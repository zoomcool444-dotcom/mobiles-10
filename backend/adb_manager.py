import base64
import io
import json
import os
import re
import shutil
import subprocess
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple

from PIL import Image

from config import SLOT_IDS, SLOT_PERSISTENCE_PATH, APPIUM_BASE_PORT


def _utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


class AdbManager:
    def __init__(self) -> None:
        self.adb_bin = shutil.which("adb") or "adb"
        self.slot_map: Dict[str, Optional[str]] = self._load_slot_map()

    def is_available(self) -> bool:
        return shutil.which("adb") is not None

    def _load_slot_map(self) -> Dict[str, Optional[str]]:
        mapping: Dict[str, Optional[str]] = {sid: None for sid in SLOT_IDS}
        if os.path.exists(SLOT_PERSISTENCE_PATH):
            try:
                with open(SLOT_PERSISTENCE_PATH, "r", encoding="utf-8") as fh:
                    saved = json.load(fh)
                for sid in SLOT_IDS:
                    val = saved.get(sid)
                    if isinstance(val, str) and val.strip():
                        mapping[sid] = val.strip()
            except Exception:
                pass
        return mapping

    def _save_slot_map(self) -> None:
        try:
            with open(SLOT_PERSISTENCE_PATH, "w", encoding="utf-8") as fh:
                json.dump(self.slot_map, fh, indent=2)
        except Exception:
            pass

    def _run_adb(self, args: List[str], timeout: float = 6.0) -> Tuple[bool, str, str]:
        if not self.is_available():
            return False, "", "adb binary not found in PATH"
        try:
            proc = subprocess.run(
                [self.adb_bin, *args],
                capture_output=True,
                text=True,
                timeout=timeout,
            )
            return proc.returncode == 0, proc.stdout.strip(), proc.stderr.strip()
        except subprocess.TimeoutExpired:
            return False, "", "adb command timed out"
        except Exception as exc:
            return False, "", str(exc)

    def _run_adb_bytes(self, args: List[str], timeout: float = 8.0) -> Tuple[bool, bytes, str]:
        if not self.is_available():
            return False, b"", "adb binary not found in PATH"
        try:
            proc = subprocess.run(
                [self.adb_bin, *args],
                capture_output=True,
                timeout=timeout,
            )
            return proc.returncode == 0, proc.stdout, proc.stderr.decode("utf-8", errors="ignore").strip()
        except subprocess.TimeoutExpired:
            return False, b"", "adb binary capture timed out"
        except Exception as exc:
            return False, b"", str(exc)

    def scan_usb_devices(self) -> List[Dict[str, Optional[str]]]:
        ok, stdout, _ = self._run_adb(["devices", "-l"], timeout=5.0)
        if not ok:
            return []

        detected = []
        for line in stdout.splitlines():
            line = line.strip()
            if not line or line.startswith("List of devices"):
                continue
            parts = line.split()
            if len(parts) < 2:
                continue
            serial = parts[0]
            raw_state = parts[1]
            usb_port = None
            model_hint = None
            for token in parts[2:]:
                if token.startswith("usb:"):
                    usb_port = token.split("usb:", 1)[1]
                elif token.startswith("model:"):
                    model_hint = token.split("model:", 1)[1].replace("_", " ")

            if raw_state == "device":
                usb_status = "online"
            elif raw_state == "unauthorized":
                usb_status = "unauthorized"
            else:
                usb_status = "offline"

            detected.append(
                {
                    "serial": serial,
                    "usb_status": usb_status,
                    "usb_port": usb_port,
                    "model_hint": model_hint,
                }
            )

        self._assign_slots(detected)
        return detected

    def _assign_slots(self, detected: List[Dict[str, Optional[str]]]) -> None:
        assigned_serials = {s for s in self.slot_map.values() if s}
        changed = False
        for dev in detected:
            serial = dev["serial"]
            if not serial or serial in assigned_serials:
                continue
            for sid in SLOT_IDS:
                if self.slot_map[sid] is None:
                    self.slot_map[sid] = serial
                    assigned_serials.add(serial)
                    changed = True
                    break
        if changed:
            self._save_slot_map()

    def get_serial_for_slot(self, slot_id: str) -> Optional[str]:
        return self.slot_map.get(slot_id)

    def pair_device(self, pair_target: str, pairing_code: str) -> Tuple[bool, str]:
        target = pair_target.strip()
        code = pairing_code.strip()
        if not target or not code:
            return False, "Both pairing IP:port and 6-digit pairing code are required."
        self._run_adb(["start-server"], timeout=5.0)
        ok, out, err = self._run_adb(["pair", target, code], timeout=12.0)
        combined = f"{out} {err}".strip()
        if not ok or "failed" in combined.lower():
            return False, combined or f"Wireless ADB pairing failed for {target}."
        return True, f"Paired wirelessly with {target}."

    def enable_tcpip(self, slot_id: str, port: int = 5555) -> Tuple[bool, str]:
        serial = self.slot_map.get(slot_id)
        if not serial:
            return False, f"Device {slot_id} has no assigned physical serial."
        if ":" in serial:
            return True, f"Device {slot_id} is already connected over Wi-Fi ({serial})."
        ok, out, err = self._run_adb(["-s", serial, "tcpip", str(port)], timeout=6.0)
        if not ok:
            return False, err or out or f"Failed to enable TCP/IP {port} on {serial}"
        # Query device Wi-Fi IP address
        ok_ip, ip_out, _ = self._run_adb(["-s", serial, "shell", "ip", "route"], timeout=4.0)
        ip_match = re.search(r"src\s+(\d+\.\d+\.\d+\.\d+)", ip_out) if ok_ip else None
        if ip_match:
            wifi_target = f"{ip_match.group(1)}:{port}"
            self._run_adb(["connect", wifi_target], timeout=6.0)
            self.slot_map[slot_id] = wifi_target
            self._save_slot_map()
            return True, f"Switched Device {slot_id} to Wi-Fi ADB ({wifi_target}). You may now unplug the USB cable."
        return True, f"Enabled ADB TCP/IP on port {port}. Connect using phone's Wi-Fi IP:{port}."

    def connect_device(self, slot_id: str, target: Optional[str] = None) -> Tuple[bool, str]:
        if target:
            normalized = target.strip()
            if ":" not in normalized:
                normalized = f"{normalized}:5555"
            self._run_adb(["start-server"], timeout=5.0)
            ok, out, err = self._run_adb(["connect", normalized], timeout=8.0)
            combined = f"{out} {err}".strip()
            if not ok or "unable" in combined.lower() or "cannot" in combined.lower() or "failed" in combined.lower():
                return False, combined or f"Failed to connect to {normalized}"
            self.slot_map[slot_id] = normalized
            self._save_slot_map()
            return True, f"Connected Device {slot_id} wirelessly to {normalized}"

        self._run_adb(["start-server"], timeout=5.0)
        detected = self.scan_usb_devices()
        serial = self.slot_map.get(slot_id)
        if not serial:
            return False, f"No physical USB or Wi-Fi Android phone assigned to Device {slot_id}."

        if ":" in serial:
            self._run_adb(["connect", serial], timeout=6.0)
            detected = self.scan_usb_devices()

        match = next((d for d in detected if d["serial"] == serial), None)
        if not match:
            return False, f"Assigned device {serial} is not reachable over USB or Wi-Fi."
        if match["usb_status"] == "unauthorized":
            return False, f"Device {slot_id} ({serial}) is unauthorized. Accept RSA USB debugging prompt on phone."
        if match["usb_status"] != "online":
            return False, f"Device {slot_id} ({serial}) is {match['usb_status']}."
        return True, f"Device {slot_id} ({serial}) connected."

    def disconnect_device(self, slot_id: str) -> Tuple[bool, str]:
        serial = self.slot_map.get(slot_id)
        if not serial:
            return False, f"Device {slot_id} has no assigned physical serial."
        if ":" in serial:
            self._run_adb(["disconnect", serial], timeout=4.0)
        self.slot_map[slot_id] = None
        self._save_slot_map()
        return True, f"Disconnected Device {slot_id} ({serial}) from slot."

    def get_device_telemetry(self, slot_id: str, detected_map: Dict[str, Dict[str, Optional[str]]]) -> Dict:
        idx = int(slot_id) - 1
        serial = self.slot_map.get(slot_id)
        detected = detected_map.get(serial) if serial else None
        is_wifi = bool(serial and ":" in serial)

        base = {
            "slotId": slot_id,
            "name": f"Device {slot_id}",
            "serial": serial,
            "usbPort": f"Wi-Fi ({serial})" if is_wifi else (detected["usb_port"] if detected and detected.get("usb_port") else f"USB-{slot_id}"),
            "usbStatus": detected["usb_status"] if detected else "offline",
            "active": False,
            "model": detected.get("model_hint") or "—" if detected else "—",
            "manufacturer": "—",
            "androidVersion": "—",
            "battery": None,
            "batteryCharging": False,
            "resolution": "—",
            "browserStatus": "Offline",
            "currentActivity": "—",
            "currentUrl": None,
            "mirrorStatus": "stopped",
            "scrcpyPid": None,
            "appiumStatus": "unavailable",
            "appiumPort": APPIUM_BASE_PORT + idx,
            "lastFrameBase64": None,
            "lastFrameAt": None,
            "lastSeenAt": _utc_now() if detected else None,
            "fps": 0,
        }

        if not serial or not detected or detected["usb_status"] != "online":
            return base

        # Query real device hardware properties
        _, model, _ = self._run_adb(["-s", serial, "shell", "getprop", "ro.product.model"])
        _, manufacturer, _ = self._run_adb(["-s", serial, "shell", "getprop", "ro.product.manufacturer"])
        _, android_ver, _ = self._run_adb(["-s", serial, "shell", "getprop", "ro.build.version.release"])

        if model:
            base["model"] = model
        if manufacturer:
            base["manufacturer"] = manufacturer
        if android_ver:
            base["androidVersion"] = android_ver

        # Battery level and charging state
        ok_bat, bat_out, _ = self._run_adb(["-s", serial, "shell", "dumpsys", "battery"])
        if ok_bat:
            lvl_match = re.search(r"level:\s*(\d+)", bat_out)
            if lvl_match:
                base["battery"] = int(lvl_match.group(1))
            ac = "AC powered: true" in bat_out
            usb_chg = "USB powered: true" in bat_out
            base["batteryCharging"] = ac or usb_chg

        # Screen resolution
        ok_wm, wm_out, _ = self._run_adb(["-s", serial, "shell", "wm", "size"])
        if ok_wm:
            size_match = re.search(r"(?:Override|Physical) size:\s*(\d+x\d+)", wm_out)
            if size_match:
                base["resolution"] = size_match.group(1).replace("x", "×")

        # Current focused activity
        ok_win, win_out, _ = self._run_adb(["-s", serial, "shell", "dumpsys", "window", "displays"])
        if ok_win:
            act_match = re.search(r"mCurrentFocus=Window\{[^\}]+\s+([^\s\}]+)\}", win_out)
            if act_match:
                base["currentActivity"] = act_match.group(1)
        if base["currentActivity"] == "—":
            ok_act, act_out, _ = self._run_adb(["-s", serial, "shell", "dumpsys", "activity", "activities"])
            if ok_act:
                resumed = re.search(r"ResumedActivity:.*?\s([a-zA-Z0-9_.]+\/[a-zA-Z0-9_.]+)", act_out)
                if resumed:
                    base["currentActivity"] = resumed.group(1)

        # Browser status
        ok_pid, chrome_pid, _ = self._run_adb(["-s", serial, "shell", "pidof", "com.android.chrome"])
        if ok_pid and chrome_pid.strip():
            base["browserStatus"] = "Chrome Active"
        else:
            ok_pkg, pkg_out, _ = self._run_adb(["-s", serial, "shell", "pm", "list", "packages", "com.android.chrome"])
            if ok_pkg and "com.android.chrome" in pkg_out:
                base["browserStatus"] = "Chrome Ready"
            else:
                base["browserStatus"] = "Default Browser"

        return base

    def open_browser(self, serial: str) -> Tuple[bool, str]:
        ok, _, err = self._run_adb(
            [
                "-s",
                serial,
                "shell",
                "am",
                "start",
                "-n",
                "com.android.chrome/com.google.android.apps.chrome.Main",
            ]
        )
        if not ok:
            ok2, _, err2 = self._run_adb(
                [
                    "-s",
                    serial,
                    "shell",
                    "am",
                    "start",
                    "-a",
                    "android.intent.action.VIEW",
                    "-d",
                    "about:blank",
                ]
            )
            if not ok2:
                return False, err2 or err or "Failed to launch Android browser"
        return True, "Launched Android browser"

    def open_url(self, serial: str, url: str) -> Tuple[bool, str]:
        ok, _, err = self._run_adb(
            [
                "-s",
                serial,
                "shell",
                "am",
                "start",
                "-a",
                "android.intent.action.VIEW",
                "-d",
                url,
            ]
        )
        if not ok:
            return False, err or f"Failed to open {url}"
        return True, f"Navigated browser to {url}"

    def go_back(self, serial: str) -> Tuple[bool, str]:
        ok, _, err = self._run_adb(["-s", serial, "shell", "input", "keyevent", "4"])
        return ok, err or "Sent BACK keyevent"

    def go_home(self, serial: str) -> Tuple[bool, str]:
        ok, _, err = self._run_adb(["-s", serial, "shell", "input", "keyevent", "3"])
        return ok, err or "Sent HOME keyevent"

    def reload_page(self, serial: str) -> Tuple[bool, str]:
        # Keycode 285 = KEYCODE_REFRESH on Android; fallback to Ctrl+R / F5 (135)
        ok, _, err = self._run_adb(["-s", serial, "shell", "input", "keyevent", "135"])
        return ok, err or "Sent reload keyevent"

    def tap(self, serial: str, x: int, y: int) -> Tuple[bool, str]:
        ok, _, err = self._run_adb(["-s", serial, "shell", "input", "tap", str(x), str(y)])
        return ok, err or f"Tapped ({x}, {y})"

    def swipe(self, serial: str, x1: int, y1: int, x2: int, y2: int) -> Tuple[bool, str]:
        ok, _, err = self._run_adb(
            ["-s", serial, "shell", "input", "swipe", str(x1), str(y1), str(x2), str(y2), "280"]
        )
        return ok, err or f"Swiped ({x1},{y1}) -> ({x2},{y2})"

    def input_text(self, serial: str, text: str) -> Tuple[bool, str]:
        escaped = text.replace(" ", "%s").replace("'", "\\'").replace('"', '\\"')
        ok, _, err = self._run_adb(["-s", serial, "shell", "input", "text", escaped])
        return ok, err or "Sent text input"

    def capture_png_screenshot(self, serial: str) -> Tuple[bool, Optional[bytes], str]:
        ok, raw, err = self._run_adb_bytes(["-s", serial, "exec-out", "screencap", "-p"], timeout=8.0)
        if not ok or not raw:
            return False, None, err or "Failed to capture screencap"
        return True, raw, "Captured screenshot"

    def capture_jpeg_frame_base64(self, serial: str, max_width: int = 360) -> Optional[str]:
        ok, raw, _ = self.capture_png_screenshot(serial)
        if not ok or not raw:
            return None
        try:
            with Image.open(io.BytesIO(raw)) as img:
                rgb = img.convert("RGB")
                if rgb.width > max_width:
                    ratio = max_width / float(rgb.width)
                    new_height = max(1, int(rgb.height * ratio))
                    rgb = rgb.resize((max_width, new_height), Image.Resampling.BILINEAR)
                buf = io.BytesIO()
                rgb.save(buf, format="JPEG", quality=62, optimize=True)
                return base64.b64encode(buf.getvalue()).decode("ascii")
        except Exception:
            return None
