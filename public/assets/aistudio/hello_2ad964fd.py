import os
import time

# Devices list
devices = os.popen("adb devices").read().splitlines()[1:]

# Loop through devices
for device in devices:
  # Open Chrome with URL
  os.system(f"adb -s {device} shell am start -n com.android.chrome/com.google.android.apps.chrome.Main -d https://demo-task11.netlify.app")
  time.sleep(3)  # Wait for page load

  # Loop for ads
  while True:
    # Click on ads (example, adjust based on HTML)
    os.system(f"adb -s {device} shell input tap 100 100")  # Adjust coordinates
    time.sleep(3)  # Wait for ad to play

    # Close ad (example, adjust based on HTML)
    os.system(f"adb -s {device} shell input tap 300 300")  # Adjust coordinates
    time.sleep(1)  # Buffer time

    print(f"{device}: Ad watched")
