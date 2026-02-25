# ESP32 Firmware (PlatformIO)

This firmware now runs a local config web server on ESP32.

Features:

1. Connect to Wi-Fi
2. Open web UI from browser (`http://<esp32-ip>/`)
3. Configure API URL (GET) and poll interval (ms)
4. Trigger manual API call
5. Keep last 64 API logs in memory
6. Save `API_URL` and `MIN_POLL_INTERVAL_MS` in EEPROM (survives reboot)

## 1) Configure Wi-Fi

Edit `firmware/esp32/include/device_config.h`:

- `DEVICE_WIFI_SSID`
- `DEVICE_WIFI_PASSWORD`

## 2) Build

```powershell
cd f:\Web\farming\firmware\esp32
..\..\.pio-bin\platformio.cmd run
```

## 3) Upload

```powershell
cd f:\Web\farming\firmware\esp32
..\..\.pio-bin\platformio.cmd run -t upload
```

## 4) Serial Monitor

```powershell
cd f:\Web\farming\firmware\esp32
..\..\.pio-bin\platformio.cmd device monitor -b 115200
```

## 5) Open Config Page

After ESP32 connects to Wi-Fi, open:

`http://<ESP32_IP>/`

The page allows:

- API URL config
- Poll interval config
- Manual fire button
- Last 64 log entries
