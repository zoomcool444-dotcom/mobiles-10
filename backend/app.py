import base64
import json
import os
import platform
import threading
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, List, Optional, Set

from flask import Flask, jsonify, request
from flask_cors import CORS
from flask_sock import Sock

from adb_manager import AdbManager
from appium_manager import AppiumManager
from config import FLASK_HOST, FLASK_PORT, SCREENSHOT_DIR, SLOT_IDS, validate_authorized_url
from scrcpy_manager import ScrcpyManager

app = Flask(__name__)
CORS(app)
sock = Sock(app)

ws_clients: Set = set()
ws_lock = threading.Lock()
state_lock = threading.Lock()
logs: List[Dict] = []
device_states: Dict[str, Dict] = {}


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def broadcast_ws(payload: Dict) -> None:
    encoded = json.dumps(payload)
    dead = []
    with ws_lock:
        for client in list(ws_clients):
            try:
                client.send(encoded)
            except Exception:
                dead.append(client)
        for d in dead:
            ws_clients.discard(d)


def add_log(level: str, source: str, message: str, slot_id: Optional[str] = None) -> Dict:
    entry = {
        "id": f"{int(time.time() * 1000)}-{uuid.uuid4().hex[:6]}",
        "timestamp": utc_now(),
        "level": level,
        "source": source,
        "deviceId": slot_id,
        "deviceName": f"Device {slot_id}" if slot_id else None,
        "message": message,
    }
    with state_lock:
        logs.insert(0, entry)
        del logs[500:]
    broadcast_ws({"type": "log:entry", "entry": entry})
    return entry


adb_manager = AdbManager()


def handle_live_frame(slot_id: str, frame_b64: str, fps: float, timestamp: str) -> None:
    with state_lock:
        if slot_id in device_states:
            device_states[slot_id]["lastFrameBase64"] = frame_b64
            device_states[slot_id]["lastFrameAt"] = timestamp
            device_states[slot_id]["fps"] = fps
            device_states[slot_id]["mirrorStatus"] = "streaming"
    broadcast_ws(
        {
            "type": "device:frame",
            "slotId": slot_id,
            "frameBase64": frame_b64,
            "fps": fps,
            "timestamp": timestamp,
        }
    )


scrcpy_manager = ScrcpyManager(adb_manager, on_frame=handle_live_frame, on_log=add_log)
appium_manager = AppiumManager(on_log=add_log)


def build_diagnostics() -> Dict:
    return {
        "pythonBridgeUrl": f"http://127.0.0.1:{FLASK_PORT}",
        "pythonBridgeConnected": True,
        "localAdbAvailable": adb_manager.is_available(),
        "scrcpyAvailable": scrcpy_manager.is_available(),
        "appiumAvailable": appium_manager.is_binary_available(),
        "hostPlatform": platform.system().lower(),
        "lastSyncAt": utc_now(),
        "lastError": None,
    }


def refresh_all_devices(broadcast: bool = True) -> List[Dict]:
    detected = adb_manager.scan_usb_devices()
    detected_map = {d["serial"]: d for d in detected if d.get("serial")}

    updated_list = []
    for slot_id in SLOT_IDS:
        info = adb_manager.get_device_telemetry(slot_id, detected_map)
        with state_lock:
            prev = device_states.get(slot_id, {})
            info["active"] = scrcpy_manager.is_streaming(slot_id)
            info["mirrorStatus"] = "streaming" if scrcpy_manager.is_streaming(slot_id) else "stopped"
            info["scrcpyPid"] = scrcpy_manager.get_pid(slot_id)
            info["appiumStatus"] = appium_manager.get_status(slot_id)
            info["currentUrl"] = prev.get("currentUrl")
            if prev.get("lastFrameBase64") and info["usbStatus"] == "online":
                info["lastFrameBase64"] = prev.get("lastFrameBase64")
                info["lastFrameAt"] = prev.get("lastFrameAt")
                info["fps"] = prev.get("fps", 0)
            device_states[slot_id] = info
        updated_list.append(info)

    if broadcast:
        broadcast_ws(
            {
                "type": "devices:sync",
                "devices": updated_list,
                "diagnostics": build_diagnostics(),
            }
        )
    return updated_list


def monitor_loop() -> None:
    while True:
        try:
            refresh_all_devices(broadcast=True)
        except Exception as exc:
            add_log("error", "Bridge", f"Hardware monitor loop error: {exc}")
        time.sleep(2.5)


def get_online_serial_or_error(slot_id: str):
    if slot_id not in SLOT_IDS:
        return None, (jsonify({"ok": False, "error": f"Unknown slot {slot_id}"}), 404)
    serial = adb_manager.get_serial_for_slot(slot_id)
    if not serial:
        return None, (
            jsonify({"ok": False, "error": f"Device {slot_id} has no physical USB phone assigned."}),
            400,
        )
    detected = adb_manager.scan_usb_devices()
    match = next((d for d in detected if d["serial"] == serial), None)
    if not match or match["usb_status"] != "online":
        return None, (
            jsonify(
                {
                    "ok": False,
                    "error": f"Device {slot_id} ({serial}) is currently {match['usb_status'] if match else 'offline'}.",
                }
            ),
            400,
        )
    return serial, None


@sock.route("/ws")
def websocket_handler(ws) -> None:
    with ws_lock:
        ws_clients.add(ws)
    try:
        with state_lock:
            devices_snapshot = [device_states[sid] for sid in SLOT_IDS if sid in device_states]
            logs_snapshot = list(logs)
        ws.send(
            json.dumps(
                {
                    "type": "devices:sync",
                    "devices": devices_snapshot,
                    "diagnostics": build_diagnostics(),
                }
            )
        )
        ws.send(json.dumps({"type": "logs:sync", "logs": logs_snapshot}))
        while True:
            msg = ws.receive()
            if msg is None:
                break
    except Exception:
        pass
    finally:
        with ws_lock:
            ws_clients.discard(ws)


@app.get("/api/health")
def health():
    return jsonify({"ok": True, "diagnostics": build_diagnostics()})


@app.get("/api/devices")
def list_devices():
    devices = refresh_all_devices(broadcast=False)
    return jsonify({"ok": True, "devices": devices, "diagnostics": build_diagnostics()})


@app.post("/api/devices/scan")
def scan_devices():
    devices = refresh_all_devices(broadcast=True)
    online_count = sum(1 for d in devices if d["usbStatus"] == "online")
    msg = f"Scanned USB bus: {online_count} of 10 physical devices online."
    add_log("info", "ADB", msg)
    return jsonify({"ok": True, "devices": devices, "diagnostics": build_diagnostics(), "message": msg})


@app.post("/api/devices/<slot_id>/connect")
def connect_device(slot_id: str):
    if slot_id not in SLOT_IDS:
        return jsonify({"ok": False, "error": f"Invalid slot {slot_id}"}), 404
    body = request.get_json(silent=True) or {}
    target = body.get("target")
    ok, msg = adb_manager.connect_device(slot_id, target=target)
    devices = refresh_all_devices(broadcast=True)
    device = next((d for d in devices if d["slotId"] == slot_id), None)
    add_log("success" if ok else "warn", "ADB", msg, slot_id)
    if not ok:
        return jsonify({"ok": False, "error": msg, "device": device}), 400
    return jsonify({"ok": True, "message": msg, "device": device})


@app.post("/api/devices/<slot_id>/pair")
def pair_device(slot_id: str):
    if slot_id not in SLOT_IDS:
        return jsonify({"ok": False, "error": f"Invalid slot {slot_id}"}), 404
    body = request.get_json(silent=True) or {}
    pair_target = str(body.get("pairTarget", "")).strip()
    pairing_code = str(body.get("pairingCode", "")).strip()
    connect_target = str(body.get("connectTarget", "")).strip()

    ok, msg = adb_manager.pair_device(pair_target, pairing_code)
    add_log("success" if ok else "warn", "ADB", msg, slot_id)
    if not ok:
        return jsonify({"ok": False, "error": msg}), 400

    if connect_target:
        ok_conn, conn_msg = adb_manager.connect_device(slot_id, target=connect_target)
        devices = refresh_all_devices(broadcast=True)
        device = next((d for d in devices if d["slotId"] == slot_id), None)
        add_log("success" if ok_conn else "warn", "ADB", conn_msg, slot_id)
        if not ok_conn:
            return jsonify({"ok": False, "error": conn_msg, "device": device}), 400
        return jsonify({"ok": True, "message": conn_msg, "device": device})

    devices = refresh_all_devices(broadcast=True)
    device = next((d for d in devices if d["slotId"] == slot_id), None)
    return jsonify({"ok": True, "message": msg, "device": device})


@app.post("/api/devices/<slot_id>/tcpip")
def switch_to_tcpip(slot_id: str):
    if slot_id not in SLOT_IDS:
        return jsonify({"ok": False, "error": f"Invalid slot {slot_id}"}), 404
    ok, msg = adb_manager.enable_tcpip(slot_id)
    devices = refresh_all_devices(broadcast=True)
    device = next((d for d in devices if d["slotId"] == slot_id), None)
    add_log("success" if ok else "warn", "ADB", msg, slot_id)
    return jsonify({"ok": ok, "message": msg, "device": device}), (200 if ok else 400)


@app.post("/api/devices/<slot_id>/disconnect")
def disconnect_device(slot_id: str):
    if slot_id not in SLOT_IDS:
        return jsonify({"ok": False, "error": f"Invalid slot {slot_id}"}), 404
    scrcpy_manager.stop_mirror(slot_id)
    appium_manager.stop_session(slot_id)
    ok, msg = adb_manager.disconnect_device(slot_id)
    devices = refresh_all_devices(broadcast=True)
    device = next((d for d in devices if d["slotId"] == slot_id), None)
    add_log("info" if ok else "warn", "ADB", msg, slot_id)
    return jsonify({"ok": ok, "message": msg, "device": device}), (200 if ok else 400)


@app.post("/api/devices/<slot_id>/start")
def start_device(slot_id: str):
    serial, err_resp = get_online_serial_or_error(slot_id)
    if err_resp:
        return err_resp
    scrcpy_manager.start_mirror(slot_id, serial, f"Device {slot_id}")
    appium_manager.start_session(slot_id, serial)
    devices = refresh_all_devices(broadcast=True)
    device = next((d for d in devices if d["slotId"] == slot_id), None)
    msg = f"Started Device {slot_id} live scrcpy mirror & automation session."
    add_log("success", "Fleet", msg, slot_id)
    return jsonify({"ok": True, "message": msg, "device": device})


@app.post("/api/devices/<slot_id>/stop")
def stop_device(slot_id: str):
    if slot_id not in SLOT_IDS:
        return jsonify({"ok": False, "error": f"Invalid slot {slot_id}"}), 404
    scrcpy_manager.stop_mirror(slot_id)
    appium_manager.stop_session(slot_id)
    devices = refresh_all_devices(broadcast=True)
    device = next((d for d in devices if d["slotId"] == slot_id), None)
    msg = f"Stopped Device {slot_id} mirror and Appium session."
    add_log("info", "Fleet", msg, slot_id)
    return jsonify({"ok": True, "message": msg, "device": device})


@app.post("/api/devices/<slot_id>/browser/open")
def open_browser(slot_id: str):
    serial, err_resp = get_online_serial_or_error(slot_id)
    if err_resp:
        return err_resp
    ok, msg = adb_manager.open_browser(serial)
    devices = refresh_all_devices(broadcast=True)
    device = next((d for d in devices if d["slotId"] == slot_id), None)
    add_log("success" if ok else "error", "ADB", msg, slot_id)
    return jsonify({"ok": ok, "message": msg, "device": device}), (200 if ok else 500)


@app.post("/api/devices/<slot_id>/browser/url")
def open_url(slot_id: str):
    serial, err_resp = get_online_serial_or_error(slot_id)
    if err_resp:
        return err_resp
    body = request.get_json(silent=True) or {}
    raw_url = str(body.get("url", "")).strip()
    valid, result = validate_authorized_url(raw_url)
    if not valid:
        add_log("warn", "Appium", result, slot_id)
        return jsonify({"ok": False, "error": result}), 400

    used_appium = appium_manager.open_url(slot_id, result)
    ok = used_appium or adb_manager.open_url(serial, result)[0]
    with state_lock:
        if slot_id in device_states:
            device_states[slot_id]["currentUrl"] = result
    devices = refresh_all_devices(broadcast=True)
    device = next((d for d in devices if d["slotId"] == slot_id), None)
    msg = f"Opened {result} via {'Appium' if used_appium else 'ADB'}"
    add_log("success" if ok else "error", "Appium" if used_appium else "ADB", msg, slot_id)
    return jsonify({"ok": ok, "message": msg, "device": device}), (200 if ok else 500)


@app.post("/api/devices/<slot_id>/browser/reload")
def reload_page(slot_id: str):
    serial, err_resp = get_online_serial_or_error(slot_id)
    if err_resp:
        return err_resp
    used_appium = appium_manager.reload_page(slot_id)
    ok = used_appium or adb_manager.reload_page(serial)[0]
    msg = f"Reloaded active page on Device {slot_id}"
    add_log("info", "Appium" if used_appium else "ADB", msg, slot_id)
    return jsonify({"ok": ok, "message": msg})


@app.post("/api/devices/<slot_id>/input/back")
def go_back(slot_id: str):
    serial, err_resp = get_online_serial_or_error(slot_id)
    if err_resp:
        return err_resp
    used_appium = appium_manager.go_back(slot_id)
    ok = used_appium or adb_manager.go_back(serial)[0]
    add_log("info", "ADB", f"Sent BACK on Device {slot_id}", slot_id)
    return jsonify({"ok": ok, "message": f"Sent Go Back to Device {slot_id}"})


@app.post("/api/devices/<slot_id>/input/home")
def go_home(slot_id: str):
    serial, err_resp = get_online_serial_or_error(slot_id)
    if err_resp:
        return err_resp
    ok, msg = adb_manager.go_home(serial)
    add_log("info", "ADB", f"Sent HOME on Device {slot_id}", slot_id)
    return jsonify({"ok": ok, "message": msg})


@app.post("/api/devices/<slot_id>/input/tap")
def tap_screen(slot_id: str):
    serial, err_resp = get_online_serial_or_error(slot_id)
    if err_resp:
        return err_resp
    body = request.get_json(silent=True) or {}
    x = int(body.get("x", 0))
    y = int(body.get("y", 0))
    ok, msg = adb_manager.tap(serial, x, y)
    return jsonify({"ok": ok, "message": msg})


@app.post("/api/devices/<slot_id>/input/swipe")
def swipe_screen(slot_id: str):
    serial, err_resp = get_online_serial_or_error(slot_id)
    if err_resp:
        return err_resp
    body = request.get_json(silent=True) or {}
    x1, y1 = int(body.get("x1", 500)), int(body.get("y1", 1400))
    x2, y2 = int(body.get("x2", 500)), int(body.get("y2", 600))
    ok, msg = adb_manager.swipe(serial, x1, y1, x2, y2)
    return jsonify({"ok": ok, "message": msg})


@app.post("/api/devices/<slot_id>/input/text")
def input_text(slot_id: str):
    serial, err_resp = get_online_serial_or_error(slot_id)
    if err_resp:
        return err_resp
    body = request.get_json(silent=True) or {}
    text = str(body.get("text", ""))
    if not text:
        return jsonify({"ok": False, "error": "Text payload is empty"}), 400
    ok, msg = adb_manager.input_text(serial, text)
    return jsonify({"ok": ok, "message": msg})


@app.post("/api/devices/<slot_id>/screenshot")
def take_screenshot(slot_id: str):
    serial, err_resp = get_online_serial_or_error(slot_id)
    if err_resp:
        return err_resp
    ok, png_bytes, msg = adb_manager.capture_png_screenshot(serial)
    if not ok or not png_bytes:
        add_log("error", "ADB", msg, slot_id)
        return jsonify({"ok": False, "error": msg}), 500

    os.makedirs(SCREENSHOT_DIR, exist_ok=True)
    ts = utc_now()
    filename = f"device_{slot_id}_{int(time.time())}.png"
    with open(os.path.join(SCREENSHOT_DIR, filename), "wb") as fh:
        fh.write(png_bytes)

    with state_lock:
        resolution = device_states.get(slot_id, {}).get("resolution", "—")

    screenshot = {
        "id": uuid.uuid4().hex,
        "slotId": slot_id,
        "deviceName": f"Device {slot_id}",
        "serial": serial,
        "capturedAt": ts,
        "imageBase64": base64.b64encode(png_bytes).decode("ascii"),
        "resolution": resolution,
    }
    add_log("success", "ADB", f"Captured screenshot ({filename})", slot_id)
    return jsonify({"ok": True, "message": f"Screenshot captured for Device {slot_id}", "screenshot": screenshot})


@app.post("/api/fleet/connect-all")
def fleet_connect_all():
    adb_manager._run_adb(["start-server"], timeout=5.0)
    devices = refresh_all_devices(broadcast=True)
    online = [d for d in devices if d["usbStatus"] == "online"]
    for dev in online:
        if not scrcpy_manager.is_streaming(dev["slotId"]) and dev["serial"]:
            scrcpy_manager.start_mirror(dev["slotId"], dev["serial"], dev["name"])
    devices = refresh_all_devices(broadcast=True)
    msg = f"Connected {len(online)} of 10 physical USB Android devices."
    add_log("success" if online else "warn", "Fleet", msg)
    return jsonify({"ok": True, "devices": devices, "message": msg})


@app.post("/api/fleet/open-url")
def fleet_open_url():
    body = request.get_json(silent=True) or {}
    raw_url = str(body.get("url", "")).strip()
    valid, result = validate_authorized_url(raw_url)
    if not valid:
        add_log("warn", "Fleet", result)
        return jsonify({"ok": False, "error": result}), 400

    target_slots = body.get("slotIds") or SLOT_IDS
    devices = refresh_all_devices(broadcast=False)
    count = 0
    for dev in devices:
        if dev["slotId"] in target_slots and dev["usbStatus"] == "online" and dev["serial"]:
            used_appium = appium_manager.open_url(dev["slotId"], result)
            if used_appium or adb_manager.open_url(dev["serial"], result)[0]:
                count += 1
                with state_lock:
                    device_states[dev["slotId"]]["currentUrl"] = result
    devices = refresh_all_devices(broadcast=True)
    msg = f"Opened {result} on {count} online device(s)."
    add_log("success" if count else "warn", "Fleet", msg)
    return jsonify({"ok": count > 0, "devices": devices, "message": msg})


@app.post("/api/fleet/action")
def fleet_action():
    body = request.get_json(silent=True) or {}
    action = body.get("action")
    target_slots = body.get("slotIds") or SLOT_IDS
    devices = refresh_all_devices(broadcast=False)
    affected = 0

    for dev in devices:
        sid = dev["slotId"]
        serial = dev["serial"]
        if sid not in target_slots or dev["usbStatus"] != "online" or not serial:
            continue
        if action == "start":
            scrcpy_manager.start_mirror(sid, serial, dev["name"])
            appium_manager.start_session(sid, serial)
            affected += 1
        elif action == "stop":
            scrcpy_manager.stop_mirror(sid)
            appium_manager.stop_session(sid)
            affected += 1
        elif action == "disconnect":
            scrcpy_manager.stop_mirror(sid)
            appium_manager.stop_session(sid)
            adb_manager.disconnect_device(sid)
            affected += 1
        elif action == "browser":
            adb_manager.open_browser(serial)
            affected += 1
        elif action == "home":
            adb_manager.go_home(serial)
            affected += 1
        elif action == "back":
            adb_manager.go_back(serial)
            affected += 1
        elif action == "reload":
            adb_manager.reload_page(serial)
            affected += 1
        elif action == "screenshot":
            ok, png_bytes, _ = adb_manager.capture_png_screenshot(serial)
            if ok and png_bytes:
                os.makedirs(SCREENSHOT_DIR, exist_ok=True)
                with open(os.path.join(SCREENSHOT_DIR, f"device_{sid}_{int(time.time())}.png"), "wb") as fh:
                    fh.write(png_bytes)
                affected += 1

    devices = refresh_all_devices(broadcast=True)
    msg = f"Executed fleet '{action}' on {affected} online device(s)."
    add_log("info", "Fleet", msg)
    return jsonify({"ok": True, "devices": devices, "message": msg})


@app.get("/api/logs")
def get_logs():
    with state_lock:
        return jsonify({"ok": True, "logs": list(logs)})


@app.delete("/api/logs")
def clear_logs():
    with state_lock:
        logs.clear()
    broadcast_ws({"type": "logs:sync", "logs": []})
    return jsonify({"ok": True})


if __name__ == "__main__":
    refresh_all_devices(broadcast=False)
    add_log("info", "Bridge", f"Python Flask hardware service started on {FLASK_HOST}:{FLASK_PORT}")
    monitor_thread = threading.Thread(target=monitor_loop, daemon=True)
    monitor_thread.start()
    try:
        app.run(host=FLASK_HOST, port=FLASK_PORT, threaded=True)
    finally:
        scrcpy_manager.stop_all()
        appium_manager.stop_all()
