#include <Arduino.h>
#include <EEPROM.h>
#include <WebServer.h>
#include <WiFi.h>
#include <HTTPClient.h>
#include <WiFiClient.h>
#include <WiFiClientSecure.h>
#include <arduino-timer.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <ArduinoOTA.h>
#include <queue>
#include "html_template.h"
#include "main_page.h"

namespace {
constexpr size_t EEPROM_SIZE = 1024;
constexpr int EEPROM_INTERVAL_ADDR = 1;
constexpr int EEPROM_API_URL_ADDR = 10;
constexpr size_t EEPROM_API_URL_MAX_LEN = 180;
constexpr int EEPROM_DEVICE_ID_ADDR = 200;
constexpr size_t EEPROM_DEVICE_ID_MAX_LEN = 48;
constexpr int EEPROM_DEVICE_SECRET_ADDR = 248;
constexpr size_t EEPROM_DEVICE_SECRET_MAX_LEN = 80;
constexpr int EEPROM_DEVICE_LOGIN_URL_ADDR = 328;
constexpr size_t EEPROM_DEVICE_LOGIN_URL_MAX_LEN = 180;
constexpr int EEPROM_WIFI_SSID_ADDR = 520;
constexpr size_t EEPROM_WIFI_SSID_MAX_LEN = 32;
constexpr int EEPROM_WIFI_PASSWORD_ADDR = 560;
constexpr size_t EEPROM_WIFI_PASSWORD_MAX_LEN = 64;
constexpr int EEPROM_AP_SSID_ADDR = 640;
constexpr size_t EEPROM_AP_SSID_MAX_LEN = 32;
constexpr int EEPROM_AP_PASSWORD_ADDR = 680;
constexpr size_t EEPROM_AP_PASSWORD_MAX_LEN = 64;
constexpr int EEPROM_UPDATE_STATUS_URL_ADDR = 760;
constexpr size_t EEPROM_UPDATE_STATUS_URL_MAX_LEN = 180;
constexpr int EEPROM_HEAT_ON_TEMP_X10_ADDR = 944;
constexpr int EEPROM_HEAT_OFF_TEMP_X10_ADDR = 948;
constexpr int EEPROM_DHT_INTERVAL_MS_ADDR = 952;
constexpr int EEPROM_WATER_AUTO_OFF_MS_ADDR = 956;
constexpr int EEPROM_FOOD_AUTO_OFF_MS_ADDR = 960;
constexpr uint16_t OTA_PORT = 3232;
std::queue<String> logQueue;

WebServer server(80);
auto pollTimer = timer_create_default();
auto updateStatusTimer = timer_create_default();
auto tempTimer = timer_create_default();
auto autoOffTimer = timer_create_default();

unsigned long lastWifiAttemptMs = 0;
String apiUrl = "";
unsigned long pollIntervalMs = 5000;
String wifiSsid = "NOGLAK_2.4_EXT";
String wifiPassword = "0826165992";
String apSsid = "Lovely-puppy";
String apPassword = "123456789";
String deviceToken = "";
String deviceId = "esp32-001";
String deviceSecret = "supersecret-key-1234-sdfskdedodfdfjk";
String deviceLoginUrl = "http://192.168.1.16:3000/auth/device/login";
String updateStatusAPIUrl = "http://192.168.1.16:3000/automation/devices/me/executions";
int pinWater = 16;
int pinFood = 17;
int pinLight = 18;
int pinFan = 19;
int pinHeat = 21;
int pinDhtInside = 27;
int pinDhtOutside = 26;
float heatOnTempC = 24.0f;
float heatOffTempC = 26.0f;
unsigned long dhtIntervalMs = 30000;
float insideTempC = NAN;
float outsideTempC = NAN;
bool heatLampOn = false;
bool heatAutoEnabled = true;
bool waterOn = false;
bool foodOn = false;
bool lightOn = false;
bool fanOn = false;
unsigned long waterAutoOffMs = 15000;
unsigned long foodAutoOffMs = 15000;
unsigned long waterAutoOffAtMs = 0;
unsigned long foodAutoOffAtMs = 0;

constexpr uint8_t DHT_TYPE = DHT22;
DHT dhtInside(pinDhtInside, DHT_TYPE);
DHT dhtOutside(pinDhtOutside, DHT_TYPE);

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

void setRelay(int pin, bool on) {
  digitalWrite(pin, on ? HIGH : LOW);
}

struct TaskContext {
  int pin = -1;
  String executionLogId;
};

bool sendExecutionStatus(const String& executionLogId, const String& status) {
  if (executionLogId.length() == 0) return false;
  if (deviceToken.length() == 0) return false;
  if (WiFi.status() != WL_CONNECTED) return false;
  if (updateStatusAPIUrl.length() == 0) return false;

  WiFiClientSecure client;
  client.setInsecure();
  HTTPClient http;
  if (!http.begin(client, updateStatusAPIUrl)) {
    logging(true, "[STATUS] HTTP begin failed");
    return false;
  }
  http.addHeader("Authorization", "Bearer " + deviceToken);
  http.addHeader("Content-Type", "application/json");
  const String body = String("{\"executionLogId\":\"") + executionLogId + "\",\"status\":\"" + status + "\"}";
  const int httpCode = http.PATCH(body);
  if (httpCode > 0) {
    logging(true, "[STATUS] update " + executionLogId + " -> " + status + " code=" + String(httpCode));
  } else {
    logging(true, "[STATUS] update failed: " + http.errorToString(httpCode));
  }
  http.end();
  return httpCode > 0;
}

bool autoOffWithStatus(void *ctxPtr) {
  TaskContext* ctx = static_cast<TaskContext*>(ctxPtr);
  if (ctx) {
    setRelay(ctx->pin, false);
    logging(true, "[POLL] auto off pin " + String(ctx->pin));
    sendExecutionStatus(ctx->executionLogId, "SUCCESS");
    delete ctx;
  }
  return false;
}

bool isAllowedGpio(int pin) {
  switch (pin) {
    case 16:
    case 17:
    case 18:
    case 19:
    case 21:
    case 23:
    case 25:
    case 26:
    case 27:
    case 32:
    case 33:
      return true;
    default:
      return false;
  }
}

void applyTask(int pin, int durationSec, int action, const String& executionLogId) {
  if (!isAllowedGpio(pin)) {
    logging(true, "[POLL] invalid pin " + String(pin));
    return;
  }
  pinMode(pin, OUTPUT);

  if (action == 0) {
    setRelay(pin, false);
    logging(true, "[POLL] action=OFF pin " + String(pin));
    sendExecutionStatus(executionLogId, "SUCCESS");
    return;
  }

  if (durationSec <= 0) {
    logging(true, "[POLL] invalid duration for pin " + String(pin));
    return;
  }

  setRelay(pin, true);
  TaskContext* ctx = new TaskContext();
  if (!ctx) {
    logging(true, "[POLL] alloc failed for pin " + String(pin));
    return;
  }
  ctx->pin = pin;
  ctx->executionLogId = executionLogId;
  autoOffTimer.in(static_cast<unsigned long>(durationSec) * 1000UL, autoOffWithStatus, ctx);
}

String onOffText(bool on) {
  return on ? "ON" : "OFF";
}

String btnText(bool on) {
  return on ? "Turn Off" : "Turn On";
}

String btnClass(bool on) {
  return on ? "off" : "";
}

String toggleValue(bool on) {
  return on ? "off" : "on";
}

void processManualAutoOff() {
  if (waterAutoOffAtMs != 0 && millisReached(waterAutoOffAtMs)) {
    waterOn = false;
    setRelay(pinWater, false);
    logging(true, "[AUTO] water off");
    waterAutoOffAtMs = 0;
  }
  if (foodAutoOffAtMs != 0 && millisReached(foodAutoOffAtMs)) {
    foodOn = false;
    setRelay(pinFood, false);
    logging(true, "[AUTO] food off");
    foodAutoOffAtMs = 0;
  }
}
void updateHeatLamp() {
  if (!heatAutoEnabled) return;
  if (isnan(insideTempC)) return;

  if (!heatLampOn && insideTempC <= heatOnTempC) {
    heatLampOn = true;
    setRelay(pinHeat, true);
    logging(true, "[HEAT] ON temp=" + String(insideTempC, 1));
    return;
  }

  if (heatLampOn && insideTempC >= heatOffTempC) {
    heatLampOn = false;
    setRelay(pinHeat, false);
    logging(true, "[HEAT] OFF temp=" + String(insideTempC, 1));
  }
}

bool readTemperaturesIfNeeded(void *) {
  const float newInside = dhtInside.readTemperature();
  const float newOutside = dhtOutside.readTemperature();

  if (!isnan(newInside)) insideTempC = newInside;
  if (!isnan(newOutside)) outsideTempC = newOutside;

  if (isnan(newInside)) logging(true, "[DHT] inside read failed");
  if (isnan(newOutside)) logging(true, "[DHT] outside read failed");

  updateHeatLamp();
  return true;
}

bool updateDeviceStatus(void *) {
  if (deviceToken.length() == 0) return true;
  if (WiFi.status() != WL_CONNECTED) return true;
  if (updateStatusAPIUrl.length() == 0) return true;

  Serial.printf("[STATUS] Updating device status to %s\n", updateStatusAPIUrl.c_str());
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, updateStatusAPIUrl)) {
    Serial.println("[STATUS] Error: HTTP begin failed");
    return true;
  }
  http.addHeader("Authorization", "Bearer " + deviceToken);
  http.addHeader("Content-Type", "application/json");
  const int httpCode = http.PATCH("{}"); // ยังไม่เสร็จ

  if (httpCode > 0) {
    Serial.printf("[STATUS] Response code: %d\n", httpCode);
    if (httpCode == HTTP_CODE_OK) {
      String payload = http.getString();
      Serial.printf("[STATUS] Payload: %s\n", payload.c_str());
      logging(true, "Status update success: " + payload);
    }
  } else {
    Serial.printf("[STATUS] PATCH failed, error: %s\n", http.errorToString(httpCode).c_str());
    logging(true, "Status update error: " + http.errorToString(httpCode));
  }
  http.end();
  return true;
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

  WiFiClientSecure client;
  client.setInsecure();
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
  WiFiClientSecure client;
  client.setInsecure();
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
      JsonDocument doc;
      DeserializationError error = deserializeJson(doc, payload);

      if (error) {
        logging(true, "Error: Failed to parse JSON response");
        Serial.printf("[POLL] JSON parse error: %s\n", error.c_str());
      } else {
        /* expected *
        {
          "success": true,
          "data": {
            "tasks": [
              {
                "executionLogId": "abc123",
                "scheduleId": "sch01",
                "pin": 5,
                "duration": 600
              }
            ]
          }
        }
        */
        const JsonArray tasks = doc["data"]["tasks"].as<JsonArray>();
        for (JsonObject task : tasks) {
          const String logId = task["executionLogId"].as<String>();
          const String scheduleId = task["scheduleId"].as<String>();
          const int pin = task["pin"].as<int>();
          const int duration = task["duration"].as<int>();
          int action = 1;
          if (task.containsKey("action")) {
            JsonVariant act = task["action"];
            if (act.is<const char*>()) {
              String actStr = String(act.as<const char*>());
              actStr.trim();
              actStr.toUpperCase();
              if (actStr == "OFF") action = 0;
              else if (actStr == "ON") action = 1;
            } else if (act.is<String>()) {
              String actStr = act.as<String>();
              actStr.trim();
              actStr.toUpperCase();
              if (actStr == "OFF") action = 0;
              else if (actStr == "ON") action = 1;
            } else {
              int actNum = act.as<int>();
              action = (actNum == 0) ? 0 : 1;
            }
          }
          Serial.printf("[POLL] Task: logId=%s scheduleId=%s pin=%d duration=%d action=%d\n", logId.c_str(), scheduleId.c_str(), pin, duration, action);
          applyTask(pin, duration, action, logId);
        }
      }
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
  if (!WiFi.softAP(apSsid.c_str(), apPassword.c_str())) {
    Serial.println("[AP] Failed to start");
    return;
  }
  Serial.printf("[AP] Started. SSID=%s IP=%s\n", apSsid.c_str(), WiFi.softAPIP().toString().c_str());
}

void connectWifiIfNeeded() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (lastWifiAttemptMs != 0 && !millisReached(lastWifiAttemptMs + 5000)) return;

  lastWifiAttemptMs = millis();
  const String wifiLog = String("[WiFi] Connecting to ") + wifiSsid;
  Serial.println(wifiLog);
  logging(true, wifiLog);

  WiFi.mode(WIFI_AP_STA);
  WiFi.begin(wifiSsid.c_str(), wifiPassword.c_str());

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

void setupArduinoOta() {
  ArduinoOTA.setPort(OTA_PORT);
  if (deviceId.length() > 0) {
    ArduinoOTA.setHostname(deviceId.c_str());
  }
  ArduinoOTA.onStart([]() {
    logging(true, "[OTA] Update start");
  });
  ArduinoOTA.onEnd([]() {
    logging(true, "[OTA] Update complete");
  });
  ArduinoOTA.onError([](ota_error_t error) {
    logging(true, "[OTA] Error " + String(error));
  });
  ArduinoOTA.begin();
  logging(true, "[OTA] Ready on port " + String(OTA_PORT));
}

String buildHomePage() {
  String html = HTML_TEMPLATE;
  html.replace("{{API_URL}}", htmlEscape(apiUrl));
  html.replace("{{INTERVAL}}", String(pollIntervalMs));
  html.replace("{{HEAT_ON_TEMP}}", String(heatOnTempC, 1));
  html.replace("{{HEAT_OFF_TEMP}}", String(heatOffTempC, 1));
  html.replace("{{DHT_INTERVAL_MS}}", String(dhtIntervalMs));
  html.replace("{{WATER_AUTO_OFF_MS}}", String(waterAutoOffMs));
  html.replace("{{FOOD_AUTO_OFF_MS}}", String(foodAutoOffMs));
  html.replace("{{WIFI_SSID}}", htmlEscape(wifiSsid));
  html.replace("{{WIFI_PASSWORD}}", htmlEscape(wifiPassword));
  html.replace("{{AP_SSID}}", htmlEscape(apSsid));
  html.replace("{{AP_PASSWORD}}", htmlEscape(apPassword));
  html.replace("{{DEVICE_ID}}", htmlEscape(deviceId));
  html.replace("{{DEVICE_SECRET}}", htmlEscape(deviceSecret));
  html.replace("{{DEVICE_LOGIN_URL}}", htmlEscape(deviceLoginUrl));
  html.replace("{{UPDATE_STATUS_URL}}", htmlEscape(updateStatusAPIUrl));
  html.replace("{{LOGS}}", htmlEscape(buildLogText()));
  return html;
}

String buildMainPage() {
  String html = MAIN_PAGE;
  html.replace("{{TEMP_INSIDE}}", isnan(insideTempC) ? "-" : String(insideTempC, 1));
  html.replace("{{TEMP_OUTSIDE}}", isnan(outsideTempC) ? "-" : String(outsideTempC, 1));
  html.replace("{{HEAT_AUTO}}", heatAutoEnabled ? "ON" : "OFF");

  html.replace("{{WATER_STATE}}", onOffText(waterOn));
  html.replace("{{WATER_BTN_TEXT}}", btnText(waterOn));
  html.replace("{{WATER_BTN_CLASS}}", btnClass(waterOn));
  html.replace("{{WATER_TOGGLE}}", toggleValue(waterOn));
  html.replace("{{WATER_DURATION}}", String(waterAutoOffMs));
  html.replace("{{WATER_DURATION_SEC}}", String(waterAutoOffMs / 1000));

  html.replace("{{FOOD_STATE}}", onOffText(foodOn));
  html.replace("{{FOOD_BTN_TEXT}}", btnText(foodOn));
  html.replace("{{FOOD_BTN_CLASS}}", btnClass(foodOn));
  html.replace("{{FOOD_TOGGLE}}", toggleValue(foodOn));
  html.replace("{{FOOD_DURATION}}", String(foodAutoOffMs));
  html.replace("{{FOOD_DURATION_SEC}}", String(foodAutoOffMs / 1000));

  html.replace("{{LIGHT_STATE}}", onOffText(lightOn));
  html.replace("{{LIGHT_BTN_TEXT}}", btnText(lightOn));
  html.replace("{{LIGHT_BTN_CLASS}}", btnClass(lightOn));
  html.replace("{{LIGHT_TOGGLE}}", toggleValue(lightOn));

  html.replace("{{FAN_STATE}}", onOffText(fanOn));
  html.replace("{{FAN_BTN_TEXT}}", btnText(fanOn));
  html.replace("{{FAN_BTN_CLASS}}", btnClass(fanOn));
  html.replace("{{FAN_TOGGLE}}", toggleValue(fanOn));

  html.replace("{{HEAT_STATE}}", onOffText(heatLampOn));
  html.replace("{{HEAT_BTN_TEXT}}", btnText(heatLampOn));
  html.replace("{{HEAT_BTN_CLASS}}", btnClass(heatLampOn));
  html.replace("{{HEAT_TOGGLE}}", toggleValue(heatLampOn));
  html.replace("{{HEAT_AUTO_BTN_CLASS}}", heatAutoEnabled ? "off" : "");
  html.replace("{{HEAT_AUTO_BTN_TEXT}}", heatAutoEnabled ? "Disable" : "Enable");
  html.replace("{{HEAT_AUTO_TOGGLE}}", heatAutoEnabled ? "off" : "on");
  return html;
}

bool requireAuth() {
  if (!server.authenticate("admin", "admin1234")) {
    server.requestAuthentication();
    return false;
  }
  return true;
}

void handleMainPage() {
  if (!requireAuth()) return;
  server.send(200, "text/html; charset=utf-8", buildMainPage());
}

void handleConfigPage() {
  if (!requireAuth()) return;
  server.send(200, "text/html; charset=utf-8", buildHomePage());
}

void handleLogs() {
  if (!requireAuth()) return;
  // Endpoint นี้จะคืนค่า Log ทั้งหมดเป็น plain text
  server.send(200, "text/plain", buildLogText());
}

void handleClearLogs() {
  if (!requireAuth()) return;
  logging(false); // false = clear queue
  server.send(200, "text/plain", "Cleared");
}

void handleControl() {
  if (!requireAuth()) return;
  const String device = server.arg("device");
  const String state = server.arg("state");
  const String durationArg = server.arg("durationMs");
  const bool turnOn = state == "on";
  unsigned long durationMs = static_cast<unsigned long>(durationArg.toInt());

  if (device == "water") {
    waterOn = turnOn;
    setRelay(pinWater, waterOn);
    if (waterOn) {
      if (durationMs == 0) durationMs = waterAutoOffMs;
      if (durationMs > 0) {
        waterAutoOffAtMs = millis() + durationMs;
      }
    } else {
      waterAutoOffAtMs = 0;
    }
  } else if (device == "food") {
    foodOn = turnOn;
    setRelay(pinFood, foodOn);
    if (foodOn) {
      if (durationMs == 0) durationMs = foodAutoOffMs;
      if (durationMs > 0) {
        foodAutoOffAtMs = millis() + durationMs;
      }
    } else {
      foodAutoOffAtMs = 0;
    }
  } else if (device == "light") {
    lightOn = turnOn;
    setRelay(pinLight, lightOn);
  } else if (device == "fan") {
    fanOn = turnOn;
    setRelay(pinFan, fanOn);
  } else if (device == "heat") {
    heatLampOn = turnOn;
    heatAutoEnabled = false;
    setRelay(pinHeat, heatLampOn);
  } else if (device == "heat_auto") {
    heatAutoEnabled = turnOn;
    updateHeatLamp();
  }

  server.sendHeader("Location", "/");
  server.send(303, "text/plain", "OK");
}

void handleState() {
  if (!requireAuth()) return;
  String json = "{";
  json += "\"waterOn\":" + String(waterOn ? "true" : "false");
  json += ",\"foodOn\":" + String(foodOn ? "true" : "false");
  json += ",\"lightOn\":" + String(lightOn ? "true" : "false");
  json += ",\"fanOn\":" + String(fanOn ? "true" : "false");
  json += ",\"heatLampOn\":" + String(heatLampOn ? "true" : "false");
  json += ",\"heatAutoEnabled\":" + String(heatAutoEnabled ? "true" : "false");
  json += ",\"waterAutoOffMs\":" + String(waterAutoOffMs);
  json += ",\"foodAutoOffMs\":" + String(foodAutoOffMs);
  json += ",\"insideTempC\":" + String(isnan(insideTempC) ? "null" : String(insideTempC, 1));
  json += ",\"outsideTempC\":" + String(isnan(outsideTempC) ? "null" : String(outsideTempC, 1));
  json += ",\"dhtIntervalMs\":" + String(dhtIntervalMs);
  json += "}";
  server.send(200, "application/json", json);
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
  const String storedWifiSsid = readStringFromEeprom(EEPROM_WIFI_SSID_ADDR, EEPROM_WIFI_SSID_MAX_LEN);
  const String storedWifiPassword = readStringFromEeprom(EEPROM_WIFI_PASSWORD_ADDR, EEPROM_WIFI_PASSWORD_MAX_LEN);
  const String storedApSsid = readStringFromEeprom(EEPROM_AP_SSID_ADDR, EEPROM_AP_SSID_MAX_LEN);
  const String storedApPassword = readStringFromEeprom(EEPROM_AP_PASSWORD_ADDR, EEPROM_AP_PASSWORD_MAX_LEN);
  const String storedUpdateStatusUrl = readStringFromEeprom(EEPROM_UPDATE_STATUS_URL_ADDR, EEPROM_UPDATE_STATUS_URL_MAX_LEN);
  int16_t storedHeatOnX10 = 0;
  int16_t storedHeatOffX10 = 0;
  uint32_t storedDhtInterval = 0;
  uint32_t storedWaterAutoOffMs = 0;
  uint32_t storedFoodAutoOffMs = 0;
  EEPROM.get(EEPROM_HEAT_ON_TEMP_X10_ADDR, storedHeatOnX10);
  EEPROM.get(EEPROM_HEAT_OFF_TEMP_X10_ADDR, storedHeatOffX10);
  EEPROM.get(EEPROM_DHT_INTERVAL_MS_ADDR, storedDhtInterval);
  EEPROM.get(EEPROM_WATER_AUTO_OFF_MS_ADDR, storedWaterAutoOffMs);
  EEPROM.get(EEPROM_FOOD_AUTO_OFF_MS_ADDR, storedFoodAutoOffMs);

  if (storedApiUrl.length() > 0) apiUrl = storedApiUrl;
  if (storedWifiSsid.length() > 0) wifiSsid = storedWifiSsid;
  if (storedWifiPassword.length() > 0) wifiPassword = storedWifiPassword;
  if (storedApSsid.length() > 0) apSsid = storedApSsid;
  if (storedApPassword.length() > 0) apPassword = storedApPassword;
  if (storedDeviceId.length() > 0) deviceId = storedDeviceId;
  if (storedDeviceSecret.length() > 0) deviceSecret = storedDeviceSecret;
  if (storedDeviceLoginUrl.length() > 0) deviceLoginUrl = storedDeviceLoginUrl;
  if (storedUpdateStatusUrl.length() > 0) updateStatusAPIUrl = storedUpdateStatusUrl;
  if (storedHeatOnX10 != 0) heatOnTempC = static_cast<float>(storedHeatOnX10) / 10.0f;
  if (storedHeatOffX10 != 0) heatOffTempC = static_cast<float>(storedHeatOffX10) / 10.0f;
  if (storedDhtInterval > 0) dhtIntervalMs = storedDhtInterval;
  if (storedWaterAutoOffMs > 0) waterAutoOffMs = storedWaterAutoOffMs;
  if (storedFoodAutoOffMs > 0) foodAutoOffMs = storedFoodAutoOffMs;
  if (heatOffTempC < heatOnTempC) {
    heatOffTempC = heatOnTempC + 0.5f;
  }

  Serial.printf(
    "[CFG] loaded apiUrl=%s interval=%lu deviceId=%s loginUrl=%s\n",
    apiUrl.c_str(),
    pollIntervalMs,
    deviceId.c_str(),
    deviceLoginUrl.c_str()
  );
}

void handleConfigSave() {
  if (!requireAuth()) return;
  String newUrl = server.arg("apiUrl");
  String intervalArg = server.arg("interval");
  String heatOnArg = server.arg("heatOnTemp");
  String heatOffArg = server.arg("heatOffTemp");
  String dhtIntervalArg = server.arg("dhtIntervalMs");
  String waterAutoOffArg = server.arg("waterAutoOffMs");
  String foodAutoOffArg = server.arg("foodAutoOffMs");
  String newWifiSsid = server.arg("wifiSsid");
  String newWifiPassword = server.arg("wifiPassword");
  String newApSsid = server.arg("apSsid");
  String newApPassword = server.arg("apPassword");
  String newDeviceId = server.arg("deviceId");
  String newDeviceSecret = server.arg("deviceSecret");
  String newDeviceLoginUrl = server.arg("deviceLoginUrl");
  String newUpdateStatusUrl = server.arg("updateStatusApiUrl");
  newUrl.trim();
  intervalArg.trim();
  heatOnArg.trim();
  heatOffArg.trim();
  dhtIntervalArg.trim();
  waterAutoOffArg.trim();
  foodAutoOffArg.trim();
  newWifiSsid.trim();
  newWifiPassword.trim();
  newApSsid.trim();
  newApPassword.trim();
  newDeviceId.trim();
  newDeviceSecret.trim();
  newDeviceLoginUrl.trim();
  newUpdateStatusUrl.trim();

  const unsigned long parsedInterval = static_cast<unsigned long>(intervalArg.toInt());
  if (parsedInterval > 0) {
    pollIntervalMs = parsedInterval;
  }
  if (heatOnArg.length() > 0) {
    heatOnTempC = heatOnArg.toFloat();
  }
  if (heatOffArg.length() > 0) {
    heatOffTempC = heatOffArg.toFloat();
  }
  if (heatOffTempC < heatOnTempC) {
    heatOffTempC = heatOnTempC + 0.5f;
  }
  const unsigned long parsedDhtInterval = static_cast<unsigned long>(dhtIntervalArg.toInt());
  if (parsedDhtInterval >= 1000) {
    dhtIntervalMs = parsedDhtInterval;
  }
  const unsigned long parsedWaterAutoOff = static_cast<unsigned long>(waterAutoOffArg.toInt());
  if (parsedWaterAutoOff >= 1000) {
    waterAutoOffMs = parsedWaterAutoOff;
  }
  const unsigned long parsedFoodAutoOff = static_cast<unsigned long>(foodAutoOffArg.toInt());
  if (parsedFoodAutoOff >= 1000) {
    foodAutoOffMs = parsedFoodAutoOff;
  }
  apiUrl = newUrl;
  wifiSsid = newWifiSsid;
  wifiPassword = newWifiPassword;
  apSsid = newApSsid;
  apPassword = newApPassword;
  deviceId = newDeviceId;
  deviceSecret = newDeviceSecret;
  deviceLoginUrl = newDeviceLoginUrl;
  updateStatusAPIUrl = newUpdateStatusUrl;

  const uint32_t intervalToStore = static_cast<uint32_t>(pollIntervalMs);
  EEPROM.put(EEPROM_INTERVAL_ADDR, intervalToStore);
  writeStringToEeprom(EEPROM_API_URL_ADDR, EEPROM_API_URL_MAX_LEN, apiUrl);
  writeStringToEeprom(EEPROM_WIFI_SSID_ADDR, EEPROM_WIFI_SSID_MAX_LEN, wifiSsid);
  writeStringToEeprom(EEPROM_WIFI_PASSWORD_ADDR, EEPROM_WIFI_PASSWORD_MAX_LEN, wifiPassword);
  writeStringToEeprom(EEPROM_AP_SSID_ADDR, EEPROM_AP_SSID_MAX_LEN, apSsid);
  writeStringToEeprom(EEPROM_AP_PASSWORD_ADDR, EEPROM_AP_PASSWORD_MAX_LEN, apPassword);
  writeStringToEeprom(EEPROM_DEVICE_ID_ADDR, EEPROM_DEVICE_ID_MAX_LEN, deviceId);
  writeStringToEeprom(EEPROM_DEVICE_SECRET_ADDR, EEPROM_DEVICE_SECRET_MAX_LEN, deviceSecret);
  writeStringToEeprom(EEPROM_DEVICE_LOGIN_URL_ADDR, EEPROM_DEVICE_LOGIN_URL_MAX_LEN, deviceLoginUrl);
  writeStringToEeprom(EEPROM_UPDATE_STATUS_URL_ADDR, EEPROM_UPDATE_STATUS_URL_MAX_LEN, updateStatusAPIUrl);
  const int16_t heatOnX10 = static_cast<int16_t>((heatOnTempC * 10.0f) + (heatOnTempC >= 0 ? 0.5f : -0.5f));
  const int16_t heatOffX10 = static_cast<int16_t>((heatOffTempC * 10.0f) + (heatOffTempC >= 0 ? 0.5f : -0.5f));
  EEPROM.put(EEPROM_HEAT_ON_TEMP_X10_ADDR, heatOnX10);
  EEPROM.put(EEPROM_HEAT_OFF_TEMP_X10_ADDR, heatOffX10);
  EEPROM.put(EEPROM_DHT_INTERVAL_MS_ADDR, static_cast<uint32_t>(dhtIntervalMs));
  EEPROM.put(EEPROM_WATER_AUTO_OFF_MS_ADDR, static_cast<uint32_t>(waterAutoOffMs));
  EEPROM.put(EEPROM_FOOD_AUTO_OFF_MS_ADDR, static_cast<uint32_t>(foodAutoOffMs));
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
  server.on("/", HTTP_GET, handleMainPage);
  server.on("/config", HTTP_GET, handleConfigPage);
  server.on("/config", HTTP_POST, handleConfigSave);
  server.on("/control", HTTP_POST, handleControl);
  server.on("/state", HTTP_GET, handleState);
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
  pinMode(pinWater, OUTPUT);
  pinMode(pinFood, OUTPUT);
  pinMode(pinLight, OUTPUT);
  pinMode(pinFan, OUTPUT);
  pinMode(pinHeat, OUTPUT);
  setRelay(pinWater, false);
  setRelay(pinFood, false);
  setRelay(pinLight, false);
  setRelay(pinFan, false);
  setRelay(pinHeat, false);
  dhtInside.begin();
  dhtOutside.begin();
  setupArduinoOta();
  pollTimer.every(pollIntervalMs, pollTheApi);
  tempTimer.every(dhtIntervalMs, readTemperaturesIfNeeded);
  setupWebServer();
}

void loop() {
  connectWifiIfNeeded();
  ArduinoOTA.handle();
  pollTimer.tick();  
  updateStatusTimer.tick();
  tempTimer.tick();
  autoOffTimer.tick();
  processManualAutoOff();
  server.handleClient();
  delay(20);
}
