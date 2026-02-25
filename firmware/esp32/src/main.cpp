#include <Arduino.h>
#include <EEPROM.h>
#include <WebServer.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <arduino-timer.h>
#include <queue>

namespace {
constexpr char WIFI_SSID[] = "NOGLAK_2.4_EXT";
constexpr char WIFI_PASSWORD[] = "0826165992";
constexpr char AP_SSID[] = "Lovely-puppy";
constexpr char AP_PASSWORD[] = "123456789";
constexpr size_t EEPROM_SIZE = 512;
constexpr int EEPROM_INTERVAL_ADDR = 1;
constexpr int EEPROM_API_URL_ADDR = 10;
constexpr size_t EEPROM_API_URL_MAX_LEN = 180;
constexpr int EEPROM_DEVICE_ID_ADDR = 200;
constexpr size_t EEPROM_DEVICE_ID_MAX_LEN = 48;
constexpr int EEPROM_DEVICE_SECRET_ADDR = 248;
constexpr size_t EEPROM_DEVICE_SECRET_MAX_LEN = 80;
constexpr int EEPROM_DEVICE_LOGIN_URL_ADDR = 328;
constexpr size_t EEPROM_DEVICE_LOGIN_URL_MAX_LEN = 180;
std::queue<String> logQueue;

WebServer server(80);
auto pollTimer = timer_create_default();

unsigned long lastWifiAttemptMs = 0;
String apiUrl = "";
unsigned long pollIntervalMs = 5000;
String deviceToken = "";
String deviceId = "device-001";
String deviceSecret = "change-me";
String deviceLoginUrl = "http://192.168.1.50:3000/auth/device/login";

void logging(bool push, const String& message="") {
  
  if (push) {
    if (logQueue.size() >= 64) {
      logQueue.pop();
    }
    logQueue.push(message);
  } else {
    while (!logQueue.empty()) {
      logQueue.pop();
    }
  }
}
bool millisReached(unsigned long dueAt) {
  return static_cast<long>(millis() - dueAt) >= 0;
}

String extractJsonStringField(const String& json, const char* fieldName) {
  const String pattern = String("\"") + fieldName + "\":\"";
  const int start = json.indexOf(pattern);
  if (start < 0) return "";

  const int valueStart = start + pattern.length();
  const int valueEnd = json.indexOf('"', valueStart);
  if (valueEnd < 0) return "";

  return json.substring(valueStart, valueEnd);
}

bool deviceLogin() {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (deviceLoginUrl.length() == 0) return false;
  if (deviceId.length() == 0 || deviceSecret.length() == 0) return false;

  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, deviceLoginUrl)) {
    logging(true, "Error: HTTP begin failed");
    return false;
  }

  http.addHeader("Content-Type", "application/json");
  const String body = String("{\"deviceId\":\"") + deviceId + "\",\"deviceSecret\":\"" + deviceSecret + "\"}";
  const int httpCode = http.POST(body);
  if (httpCode != HTTP_CODE_OK) {    
    logging(true, "Error: HTTP POST failed with code " + String(httpCode));
    http.end();
    return false;
  }

  const String response = http.getString();
  http.end();

  const String token = extractJsonStringField(response, "token");
  if (token.length() == 0) {
    logging(true, "[AUTH] token missing");
    return false;
  }

  deviceToken = token;
  logging(true, "[AUTH] login success");
  return true;
}

bool pollTheApi(void *) {
  if (deviceToken.length() == 0) {
    if (!deviceLogin()) {
      logging(true, "[POLL] Device login failed, will retry");
      return true;
    }
  }
  if (WiFi.status() != WL_CONNECTED) {
    logging(true, "[POLL] Wi-Fi not connected, skipping poll");
    return true;
  }
  if (apiUrl.length() == 0) {
    logging(true, "[POLL] API URL is not set, skipping poll");
    return true;
  }

  Serial.printf("[POLL] %s\n", apiUrl.c_str());
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, apiUrl)) {
    logging(true, "[POLL] Error: HTTP begin failed");
    return true;
  }
  http.addHeader("Authorization", "Bearer " + deviceToken);
  const int httpCode = http.GET();
  if (httpCode > 0) {
    Serial.printf("[POLL] Response code: %d\n", httpCode);
    if (httpCode == HTTP_CODE_OK) {
      String payload = http.getString();
      Serial.printf("[POLL] Payload: %s\n", payload.c_str());
      logging(true, "Success: " + payload);
    }
  } else {
    Serial.printf("[POLL] GET failed, error: %s\n", http.errorToString(httpCode).c_str());
    logging(true, "Error: " + http.errorToString(httpCode));
  }
  http.end();
  return true;
}

String htmlEscape(const String& input) {
  String out;
  out.reserve(input.length() + 16);

  for (size_t i = 0; i < input.length(); i += 1) {
    const char c = input[i];
    switch (c) {
      case '&':
        out += "&amp;";
        break;
      case '<':
        out += "&lt;";
        break;
      case '>':
        out += "&gt;";
        break;
      case '"':
        out += "&quot;";
        break;
      case '\'':
        out += "&#39;";
        break;
      default:
        out += c;
        break;
    }
  }

  return out;
}

String readStringFromEeprom(int addr, size_t maxLen) {
  String value;
  value.reserve(maxLen);

  for (size_t i = 0; i < (maxLen - 1); i += 1) {
    const uint8_t b = EEPROM.read(addr + static_cast<int>(i));
    if (b == 0x00 || b == 0xFF) break;
    value += static_cast<char>(b);
  }
  value.trim();
  return value;
}

void writeStringToEeprom(int addr, size_t maxLen, const String& value) {
  const size_t copyLen = min(value.length(), maxLen - 1);
  for (size_t i = 0; i < maxLen; i += 1) {
    const uint8_t b = (i < copyLen) ? static_cast<uint8_t>(value[i]) : 0;
    EEPROM.write(addr + static_cast<int>(i), b);
  }
}

String buildLogText() {
  if (logQueue.empty()) return "";

  std::queue<String> snapshot = logQueue;
  String text;
  text.reserve(snapshot.size() * 40);

  while (!snapshot.empty()) {
    text += snapshot.front();
    snapshot.pop();
    if (!snapshot.empty()) text += '\n';
  }

  return text;
}

void setupAccessPoint() {
  if (!WiFi.softAP(AP_SSID, AP_PASSWORD)) {
    Serial.println("[AP] Failed to start");
    return;
  }
  Serial.printf("[AP] Started. SSID=%s IP=%s\n", AP_SSID, WiFi.softAPIP().toString().c_str());
}

void connectWifiIfNeeded() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (lastWifiAttemptMs != 0 && !millisReached(lastWifiAttemptMs + 5000)) return;

  lastWifiAttemptMs = millis();
  const String wifiLog = String("[WiFi] Connecting to ") + WIFI_SSID;
  Serial.println(wifiLog);
  logging(true, wifiLog);

  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  const unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && !millisReached(startedAt + 10000)) {
    delay(500);
  }

  if (WiFi.status() == WL_CONNECTED) {
    const String successLog = String("[WiFi] Connected. IP=") + WiFi.localIP().toString();
    Serial.println(successLog);
    logging(true, successLog);
  } else {
    Serial.println("[WiFi] Connect timeout");
    logging(true, "[WiFi] Connect timeout");
  }
}

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
      <label for='deviceId'>DEVICE_ID</label>
      <input id='deviceId' name='deviceId' type='text' value='{{DEVICE_ID}}'>
      <label for='deviceSecret'>DEVICE_SECRET</label>
      <input id='deviceSecret' name='deviceSecret' type='password' value='{{DEVICE_SECRET}}'>
      <label for='deviceLoginUrl'>DEVICE_LOGIN_URL</label>
      <input id='deviceLoginUrl' name='deviceLoginUrl' type='text' value='{{DEVICE_LOGIN_URL}}' placeholder='http://192.168.1.50:3000/auth/device/login'>
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

String buildHomePage() {
  String html = HTML_TEMPLATE;
  html.replace("{{API_URL}}", htmlEscape(apiUrl));
  html.replace("{{INTERVAL}}", String(pollIntervalMs));
  html.replace("{{DEVICE_ID}}", htmlEscape(deviceId));
  html.replace("{{DEVICE_SECRET}}", htmlEscape(deviceSecret));
  html.replace("{{DEVICE_LOGIN_URL}}", htmlEscape(deviceLoginUrl));
  html.replace("{{LOGS}}", htmlEscape(buildLogText()));
  return html;
}

void handleRoot() {
  server.send(200, "text/html; charset=utf-8", buildHomePage());
}

void handleLogs() {
  // Endpoint นี้จะคืนค่า Log ทั้งหมดเป็น plain text
  server.send(200, "text/plain", buildLogText());
}

void handleClearLogs() {
  logging(false); // false = clear queue
  server.send(200, "text/plain", "Cleared");
}

void loadConfigFromEeprom() {
  uint32_t storedInterval = 0;
  EEPROM.get(EEPROM_INTERVAL_ADDR, storedInterval);
  if (storedInterval > 0) {
    pollIntervalMs = static_cast<unsigned long>(storedInterval);
  }

  const String storedApiUrl = readStringFromEeprom(EEPROM_API_URL_ADDR, EEPROM_API_URL_MAX_LEN);
  const String storedDeviceId = readStringFromEeprom(EEPROM_DEVICE_ID_ADDR, EEPROM_DEVICE_ID_MAX_LEN);
  const String storedDeviceSecret = readStringFromEeprom(EEPROM_DEVICE_SECRET_ADDR, EEPROM_DEVICE_SECRET_MAX_LEN);
  const String storedDeviceLoginUrl = readStringFromEeprom(EEPROM_DEVICE_LOGIN_URL_ADDR, EEPROM_DEVICE_LOGIN_URL_MAX_LEN);

  if (storedApiUrl.length() > 0) apiUrl = storedApiUrl;
  if (storedDeviceId.length() > 0) deviceId = storedDeviceId;
  if (storedDeviceSecret.length() > 0) deviceSecret = storedDeviceSecret;
  if (storedDeviceLoginUrl.length() > 0) deviceLoginUrl = storedDeviceLoginUrl;

  Serial.printf(
    "[CFG] loaded apiUrl=%s interval=%lu deviceId=%s loginUrl=%s\n",
    apiUrl.c_str(),
    pollIntervalMs,
    deviceId.c_str(),
    deviceLoginUrl.c_str()
  );
}

void handleConfigSave() {
  String newUrl = server.arg("apiUrl");
  String intervalArg = server.arg("interval");
  String newDeviceId = server.arg("deviceId");
  String newDeviceSecret = server.arg("deviceSecret");
  String newDeviceLoginUrl = server.arg("deviceLoginUrl");
  newUrl.trim();
  intervalArg.trim();
  newDeviceId.trim();
  newDeviceSecret.trim();
  newDeviceLoginUrl.trim();

  const unsigned long parsedInterval = static_cast<unsigned long>(intervalArg.toInt());
  if (parsedInterval > 0) {
    pollIntervalMs = parsedInterval;
  }
  apiUrl = newUrl;
  deviceId = newDeviceId;
  deviceSecret = newDeviceSecret;
  deviceLoginUrl = newDeviceLoginUrl;

  const uint32_t intervalToStore = static_cast<uint32_t>(pollIntervalMs);
  EEPROM.put(EEPROM_INTERVAL_ADDR, intervalToStore);
  writeStringToEeprom(EEPROM_API_URL_ADDR, EEPROM_API_URL_MAX_LEN, apiUrl);
  writeStringToEeprom(EEPROM_DEVICE_ID_ADDR, EEPROM_DEVICE_ID_MAX_LEN, deviceId);
  writeStringToEeprom(EEPROM_DEVICE_SECRET_ADDR, EEPROM_DEVICE_SECRET_MAX_LEN, deviceSecret);
  writeStringToEeprom(EEPROM_DEVICE_LOGIN_URL_ADDR, EEPROM_DEVICE_LOGIN_URL_MAX_LEN, deviceLoginUrl);
  EEPROM.commit();
  pollTimer = timer_create_default();
  pollTimer.every(pollIntervalMs, pollTheApi);

  Serial.printf(
    "[CFG] apiUrl=%s interval=%lu deviceId=%s loginUrl=%s\n",
    apiUrl.c_str(),
    pollIntervalMs,
    deviceId.c_str(),
    deviceLoginUrl.c_str()
  );
  server.sendHeader("Location", "/");
  server.send(303, "text/plain", "Saved");
}

void setupWebServer() {
  server.on("/", HTTP_GET, handleRoot);
  server.on("/config", HTTP_POST, handleConfigSave);
  server.on("/logs", HTTP_GET, handleLogs);
  server.on("/logs", HTTP_DELETE, handleClearLogs);
  server.onNotFound([]() { server.send(404, "text/plain", "Not found"); });
  server.begin();
  Serial.println("[HTTP] Server started on port 80");
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("[BOOT] ESP32 Wi-Fi connect only");

  if (!EEPROM.begin(EEPROM_SIZE)) {
    Serial.println("[EEPROM] begin failed");
  } else {
    loadConfigFromEeprom();
  }

  WiFi.mode(WIFI_AP_STA);
  setupAccessPoint();
  connectWifiIfNeeded();
  pollTimer.every(pollIntervalMs, pollTheApi);
  setupWebServer();
}

void loop() {
  connectWifiIfNeeded();
  pollTimer.tick();  
  server.handleClient();
  delay(20);
}
