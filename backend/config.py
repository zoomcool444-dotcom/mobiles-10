import os
import re
from urllib.parse import urlparse

SLOT_IDS = [f"{i:02d}" for i in range(1, 11)]
FLASK_HOST = os.environ.get("FLASK_HOST", "0.0.0.0")
FLASK_PORT = int(os.environ.get("FLASK_PORT", "5000"))

APPIUM_HOST = os.environ.get("APPIUM_HOST", "127.0.0.1")
APPIUM_BASE_PORT = int(os.environ.get("APPIUM_BASE_PORT", "4723"))
SYSTEM_BASE_PORT = int(os.environ.get("SYSTEM_BASE_PORT", "8200"))

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
SLOT_PERSISTENCE_PATH = os.path.join(BASE_DIR, "device_slots.json")
SCREENSHOT_DIR = os.path.join(BASE_DIR, "screenshots")

DISALLOWED_PATTERNS = [
    re.compile(r"ad-?click", re.IGNORECASE),
    re.compile(r"click-?farm", re.IGNORECASE),
    re.compile(r"auto-?surf", re.IGNORECASE),
    re.compile(r"view-?bot", re.IGNORECASE),
    re.compile(r"reward-?bot", re.IGNORECASE),
    re.compile(r"traffic-?exchange", re.IGNORECASE),
]


def validate_authorized_url(raw_url: str) -> tuple[bool, str]:
    """Validate that the target URL is a valid HTTP(S) endpoint for authorized QA testing."""
    try:
        parsed = urlparse(raw_url.strip())
    except Exception:
        return False, "Invalid URL format."

    if parsed.scheme not in ("http", "https") or not parsed.netloc:
        return False, "URL must start with http:// or https://."

    normalized = parsed.geturl()
    for pattern in DISALLOWED_PATTERNS:
        if pattern.search(normalized):
            return False, "URL rejected by authorized automation policy."

    return True, normalized
