#pragma once

#include <Arduino.h>

const char HTML_TEMPLATE[] PROGMEM = R"raw(
<!doctype html>
<html>
<head>
  <meta charset='utf-8'>
  <meta name='viewport' content='width=device-width, initial-scale=1'>
  <title>ESP32 WebServer</title>
  <style>
    body { font-family: Arial, sans-serif; padding: 16px; background: #f7f8fb; color: #111; }
    .card { max-width: 640px; background: #fff; border: 1px solid #ddd; border-radius: 10px; padding: 16px; }
    h1 { margin-top: 0; }
    label { display: block; margin-top: 12px; }
    input { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #bbb; border-radius: 8px; }
    textarea { width: 100%; height: 220px; box-sizing: border-box; border: 1px solid #bbb; border-radius: 8px; padding: 8px; overflow: auto; white-space: pre; font-family: Consolas, monospace; }
    button { margin-top: 12px; padding: 9px 12px; border: 0; background: #1f6feb; color: #fff; border-radius: 8px; }
  </style>
</head>
<body>
  <div class='card'>
    <h1>ESP32 WebServer</h1>
    <form method='post' action='/config'>
      <label for='apiUrl'>API URL</label>
      <input id='apiUrl' name='apiUrl' type='text' value='{{API_URL}}' placeholder='http://192.168.1.50:3000/ping'>
      <label for='interval'>Interval (ms)</label>
      <input id='interval' name='interval' type='number' min='100' value='{{INTERVAL}}'>
      <label for='heatOnTemp'>HEAT_ON_TEMP_C</label>
      <input id='heatOnTemp' name='heatOnTemp' type='number' step='0.1' value='{{HEAT_ON_TEMP}}'>
      <label for='heatOffTemp'>HEAT_OFF_TEMP_C</label>
      <input id='heatOffTemp' name='heatOffTemp' type='number' step='0.1' value='{{HEAT_OFF_TEMP}}'>
      <label for='dhtIntervalMs'>DHT_INTERVAL_MS</label>
      <input id='dhtIntervalMs' name='dhtIntervalMs' type='number' min='1000' value='{{DHT_INTERVAL_MS}}'>
      <label for='waterAutoOffMs'>WATER_AUTO_OFF_MS</label>
      <input id='waterAutoOffMs' name='waterAutoOffMs' type='number' min='1000' value='{{WATER_AUTO_OFF_MS}}'>
      <label for='foodAutoOffMs'>FOOD_AUTO_OFF_MS</label>
      <input id='foodAutoOffMs' name='foodAutoOffMs' type='number' min='1000' value='{{FOOD_AUTO_OFF_MS}}'>
      <label for='wifiSsid'>WIFI_SSID</label>
      <input id='wifiSsid' name='wifiSsid' type='text' value='{{WIFI_SSID}}'>
      <label for='wifiPassword'>WIFI_PASSWORD</label>
      <input id='wifiPassword' name='wifiPassword' type='password' value='{{WIFI_PASSWORD}}'>
      <label for='apSsid'>AP_SSID</label>
      <input id='apSsid' name='apSsid' type='text' value='{{AP_SSID}}'>
      <label for='apPassword'>AP_PASSWORD</label>
      <input id='apPassword' name='apPassword' type='password' value='{{AP_PASSWORD}}'>
      <label for='deviceId'>DEVICE_ID</label>
      <input id='deviceId' name='deviceId' type='text' value='{{DEVICE_ID}}'>
      <label for='deviceSecret'>DEVICE_SECRET</label>
      <input id='deviceSecret' name='deviceSecret' type='password' value='{{DEVICE_SECRET}}'>
      <label for='deviceLoginUrl'>DEVICE_LOGIN_URL</label>
      <input id='deviceLoginUrl' name='deviceLoginUrl' type='text' value='{{DEVICE_LOGIN_URL}}' placeholder='http://192.168.1.50:3000/auth/device/login'>
      <label for='updateStatusApiUrl'>UPDATE_STATUS_URL</label>
      <input id='updateStatusApiUrl' name='updateStatusApiUrl' type='text' value='{{UPDATE_STATUS_URL}}' placeholder='http://192.168.1.50:3000/automation/devices/me/executions'>
      <button type='submit'>Submit</button>
    </form>
    <div style='display:flex;justify-content:space-between;align-items:center;margin-top:12px;'>
      <label style='margin-top:0' for='logs'>Logs</label>
      <button onclick='clearLogs()' style='margin-top:0;background:#6c757d;padding:6px 12px;'>Clear</button>
    </div>
    <textarea id='logs' readonly wrap='off'>{{LOGS}}</textarea>
    <script>
      const ta = document.getElementById('logs');
      ta.scrollTop = ta.scrollHeight;
      async function clearLogs() {
        await fetch('/logs', { method: 'DELETE' });
        ta.value = '';
      }
      setInterval(async () => {
        try {
          const res = await fetch('/logs');
          if (res.ok) {
            const txt = await res.text();
            console.log(txt);
            if (ta.value !== txt) {
              ta.value = txt;
              ta.scrollTop = ta.scrollHeight;
            }
          }
        } catch (e) {
          console.error('Failed to fetch logs:', e);
        }
      }, 5000);
    </script>
  </div>
</body>
</html>
)raw";
