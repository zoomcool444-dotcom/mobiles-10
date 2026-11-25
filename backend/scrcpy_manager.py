import os
import shutil
import subprocess
import threading
import time
from datetime import datetime, timezone
from typing import Callable, Dict, Optional

from adb_manager import AdbManager


class ScrcpyManager:
    def __init__(
        self,
        adb: AdbManager,
        on_frame: Callable[[str, str, float, str], None],
        on_log: Callable[[str, str, str, Optional[str]], None],
    ) -> None:
        self.adb = adb
        self.scrcpy_bin = shutil.which("scrcpy")
        self.on_frame = on_frame
        self.on_log = on_log
        self._processes: Dict[str, subprocess.Popen] = {}
        self._stream_threads: Dict[str, threading.Thread] = {}
        self._stop_flags: Dict[str, threading.Event] = {}
        self._lock = threading.Lock()

    def is_available(self) -> bool:
        return shutil.which("scrcpy") is not None

    def is_streaming(self, slot_id: str) -> bool:
        with self._lock:
            flag = self._stop_flags.get(slot_id)
            return flag is not None and not flag.is_set()

    def get_pid(self, slot_id: str) -> Optional[int]:
        with self._lock:
            proc = self._processes.get(slot_id)
            if proc and proc.poll() is None:
                return proc.pid
            return None

    def start_mirror(self, slot_id: str, serial: str, device_name: str) -> bool:
        self.stop_mirror(slot_id)

        # Spawn desktop scrcpy window if scrcpy and X11/Wayland display are available
        has_display = bool(os.environ.get("DISPLAY") or os.environ.get("WAYLAND_DISPLAY"))
        if self.is_available() and has_display:
            try:
                proc = subprocess.Popen(
                    [
                        self.scrcpy_bin or "scrcpy",
                        "-s",
                        serial,
                        "--window-title",
                        f"{device_name} ({serial})",
                        "--max-size",
                        "960",
                        "--video-bit-rate",
                        "4M",
                        "--stay-awake",
                    ],
                    stdout=subprocess.DEVNULL,
                    stderr=subprocess.DEVNULL,
                )
                with self._lock:
                    self._processes[slot_id] = proc
                self.on_log("info", "scrcpy", f"Launched scrcpy window (PID {proc.pid})", slot_id)
            except Exception as exc:
                self.on_log("warn", "scrcpy", f"Desktop scrcpy launch skipped: {exc}", slot_id)

        stop_event = threading.Event()
        with self._lock:
            self._stop_flags[slot_id] = stop_event

        thread = threading.Thread(
            target=self._frame_loop,
            args=(slot_id, serial, stop_event),
            daemon=True,
        )
        with self._lock:
            self._stream_threads[slot_id] = thread
        thread.start()
        self.on_log("success", "scrcpy", f"Started live web frame mirror for {device_name}", slot_id)
        return True

    def stop_mirror(self, slot_id: str) -> None:
        with self._lock:
            flag = self._stop_flags.pop(slot_id, None)
            if flag:
                flag.set()
            proc = self._processes.pop(slot_id, None)

        if proc and proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=2.5)
            except subprocess.TimeoutExpired:
                proc.kill()

    def _frame_loop(self, slot_id: str, serial: str, stop_event: threading.Event) -> None:
        while not stop_event.is_set():
            t0 = time.monotonic()
            frame_b64 = self.adb.capture_jpeg_frame_base64(serial, max_width=360)
            elapsed = max(0.05, time.monotonic() - t0)
            if frame_b64:
                fps = round(min(15.0, 1.0 / elapsed), 1)
                ts = datetime.now(timezone.utc).isoformat()
                self.on_frame(slot_id, frame_b64, fps, ts)
            else:
                stop_event.wait(1.0)
                continue
            # Pace to ~4 FPS over USB ADB screencap while keeping CPU low across 10 devices
            remaining = max(0.05, 0.25 - elapsed)
            stop_event.wait(remaining)

    def stop_all(self) -> None:
        with self._lock:
            slot_ids = list(self._stop_flags.keys())
        for sid in slot_ids:
            self.stop_mirror(sid)
