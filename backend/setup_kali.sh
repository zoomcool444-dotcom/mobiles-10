#!/usr/bin/env bash
set -euo pipefail

echo "=== Kali Linux 10-Device Physical Android Hardware Setup ==="

# 1. Install system tools (ADB, scrcpy, Python venv, Node/Appium prerequisites)
sudo apt-get update
sudo apt-get install -y android-tools-adb scrcpy python3 python3-venv python3-pip usbutils

# 2. Configure standard Android USB udev rules so non-root user can access all phones
if [ ! -f /etc/udev/rules.d/51-android.rules ]; then
  echo 'SUBSYSTEM=="usb", ATTR{idVendor}=="*", MODE="0666", GROUP="plugdev"' | sudo tee /etc/udev/rules.d/51-android.rules >/dev/null
  sudo chmod a+r /etc/udev/rules.d/51-android.rules
  sudo udevadm control --reload-rules
  sudo udevadm trigger
fi

# 3. Create Python virtual environment for backend
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
python3 -m venv "$SCRIPT_DIR/.venv"
source "$SCRIPT_DIR/.venv/bin/activate"
pip install --upgrade pip
pip install -r "$SCRIPT_DIR/requirements.txt"

# 4. Install Appium 2 and UiAutomator2 driver if npm is installed
if command -v npm >/dev/null 2>&1; then
  if ! command -v appium >/dev/null 2>&1; then
    sudo npm install -g appium
  fi
  appium driver install uiautomator2 || true
fi

echo ""
echo "Setup complete."
echo "Start ADB server: adb start-server"
echo "Start Python hardware backend: source backend/.venv/bin/activate && python3 backend/app.py"
echo "Start Web Dashboard: npm run dev"
