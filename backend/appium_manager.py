import shutil
import threading
from typing import Callable, Dict, Optional, Tuple

from config import APPIUM_BASE_PORT, APPIUM_HOST, SYSTEM_BASE_PORT

try:
    from appium import webdriver
    from appium.options.android import UiAutomator2Options

    APPIUM_CLIENT_AVAILABLE = True
except Exception:
    webdriver = None
    UiAutomator2Options = None
    APPIUM_CLIENT_AVAILABLE = False


class AppiumManager:
    def __init__(self, on_log: Callable[[str, str, str, Optional[str]], None]) -> None:
        self.on_log = on_log
        self._drivers: Dict[str, object] = {}
        self._statuses: Dict[str, str] = {}
        self._lock = threading.Lock()

    def is_binary_available(self) -> bool:
        return shutil.which("appium") is not None

    def get_status(self, slot_id: str) -> str:
        with self._lock:
            if slot_id in self._drivers:
                return "active"
            return self._statuses.get(slot_id, "idle" if APPIUM_CLIENT_AVAILABLE else "unavailable")

    def start_session(self, slot_id: str, serial: str) -> Tuple[bool, str]:
        if not APPIUM_CLIENT_AVAILABLE:
            with self._lock:
                self._statuses[slot_id] = "unavailable"
            return False, "Appium-Python-Client not installed."

        idx = int(slot_id) - 1
        appium_port = APPIUM_BASE_PORT + idx
        system_port = SYSTEM_BASE_PORT + idx
        server_url = f"http://{APPIUM_HOST}:{appium_port}"

        options = UiAutomator2Options()
        options.platform_name = "Android"
        options.automation_name = "UiAutomator2"
        options.udid = serial
        options.no_reset = True
        options.set_capability("systemPort", system_port)
        options.set_capability("newCommandTimeout", 600)

        try:
            driver = webdriver.Remote(server_url, options=options)
            with self._lock:
                self._drivers[slot_id] = driver
                self._statuses[slot_id] = "active"
            self.on_log(
                "success",
                "Appium",
                f"Appium UiAutomator2 session connected on port {appium_port}",
                slot_id,
            )
            return True, f"Appium session started on port {appium_port}"
        except Exception as exc:
            with self._lock:
                self._statuses[slot_id] = "idle"
            msg = f"Appium server on port {appium_port} unavailable ({exc}); using direct ADB controls."
            self.on_log("warn", "Appium", msg, slot_id)
            return False, msg

    def stop_session(self, slot_id: str) -> None:
        with self._lock:
            driver = self._drivers.pop(slot_id, None)
            self._statuses[slot_id] = "idle"
        if driver is not None:
            try:
                driver.quit()
            except Exception:
                pass

    def open_url(self, slot_id: str, url: str) -> bool:
        with self._lock:
            driver = self._drivers.get(slot_id)
        if driver is None:
            return False
        try:
            driver.get(url)
            return True
        except Exception:
            return False

    def reload_page(self, slot_id: str) -> bool:
        with self._lock:
            driver = self._drivers.get(slot_id)
        if driver is None:
            return False
        try:
            driver.refresh()
            return True
        except Exception:
            return False

    def go_back(self, slot_id: str) -> bool:
        with self._lock:
            driver = self._drivers.get(slot_id)
        if driver is None:
            return False
        try:
            driver.back()
            return True
        except Exception:
            return False

    def stop_all(self) -> None:
        with self._lock:
            slot_ids = list(self._drivers.keys())
        for sid in slot_ids:
            self.stop_session(sid)
