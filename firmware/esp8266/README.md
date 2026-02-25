# ESP8266 Firmware (PlatformIO)

Firmware นี้ทำงานตาม flow:

1. ต่อ Wi-Fi  
2. ล็อกอินอุปกรณ์ด้วย `POST /auth/device/login`  
3. poll ตารางงานด้วย `GET /automation/device/schedules/poll`  
4. ควบคุมพิน `5,4,14,12` ตาม schedule และ `duration`

## 1) ตั้งค่า

แก้ไฟล์ `firmware/esp8266/include/device_config.h`:

- `DEVICE_WIFI_SSID`
- `DEVICE_WIFI_PASSWORD`
- `DEVICE_API_BASE_URL` เช่น `http://192.168.1.50:3000`
- `DEVICE_ID`
- `DEVICE_SECRET`
- `DEVICE_TZ_INFO` (ค่าเริ่มต้น `ICT-7`)
- `DEVICE_ACTIVE_HIGH` (ถ้ารีเลย์ active-low ให้เปลี่ยนเป็น `0`)

## 2) Build

```powershell
cd f:\Web\farming\firmware\esp8266
..\..\.pio-bin\platformio.cmd run
```

## 3) Upload

```powershell
cd f:\Web\farming\firmware\esp8266
..\..\.pio-bin\platformio.cmd run -t upload
```

## 4) Serial Monitor

```powershell
cd f:\Web\farming\firmware\esp8266
..\..\.pio-bin\platformio.cmd device monitor -b 115200
```

## หมายเหตุ pin mapping

- GPIO5 = D1 = Food door
- GPIO4 = D2 = Water
- GPIO14 = D5 = Fan
- GPIO12 = D6 = Light

