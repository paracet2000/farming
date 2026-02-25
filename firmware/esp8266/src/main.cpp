#include <Arduino.h>
#include <ArduinoJson.h>
#include <ESP8266HTTPClient.h>
#include <ESP8266WiFi.h>
#include <WiFiClient.h>
#include <time.h>

#include "device_config.h"

namespace {
constexpr uint8_t MANAGED_PINS[] = {5, 4, 14, 12};  // D1, D2, D5, D6
constexpr size_t MANAGED_PIN_COUNT = sizeof(MANAGED_PINS) / sizeof(MANAGED_PINS[0]);
constexpr unsigned long WIFI_RETRY_MS = 5000;
constexpr unsigned long LOGIN_RETRY_MS = 5000;
constexpr unsigned long CLOCK_RETRY_MS = 30000;
constexpr unsigned long DEFAULT_POLL_INTERVAL_MS = 3000;
constexpr time_t MIN_VALID_EPOCH = 1700000000;
constexpr size_t EXEC_CACHE_SIZE = 32;

struct PinRuntimeState {
  uint8_t pin;
  bool isOn;
  bool pendingOff;
  unsigned long offAtMs;
};

struct ExecCacheEntry {
  String key;
  unsigned long seenAtMs;
};

PinRuntimeState pinStates[MANAGED_PIN_COUNT];
ExecCacheEntry execCache[EXEC_CACHE_SIZE];

String deviceToken;
unsigned long nextPollAtMs = 0;
unsigned long lastWifiAttemptMs = 0;
unsigned long lastClockAttemptMs = 0;
unsigned long nextLoginAttemptMs = 0;
unsigned long pollIntervalMs = DEFAULT_POLL_INTERVAL_MS;

bool hasClockSync = false;

bool millisReached(unsigned long dueAt) {
  return static_cast<long>(millis() - dueAt) >= 0;
}

int pinIndex(int pinNumber) {
  for (size_t i = 0; i < MANAGED_PIN_COUNT; i += 1) {
    if (static_cast<int>(MANAGED_PINS[i]) == pinNumber) return static_cast<int>(i);
  }
  return -1;
}

uint8_t levelFor(bool isOn) {
#if DEVICE_ACTIVE_HIGH
  return isOn ? HIGH : LOW;
#else
  return isOn ? LOW : HIGH;
#endif
}

void setManagedPin(int pinNumber, bool turnOn) {
  const int idx = pinIndex(pinNumber);
  if (idx < 0) return;

  digitalWrite(static_cast<uint8_t>(pinNumber), levelFor(turnOn));
  pinStates[idx].isOn = turnOn;
  if (!turnOn) {
    pinStates[idx].pendingOff = false;
  }
}

void schedulePinOff(int pinNumber, int durationSec) {
  if (durationSec <= 0) return;

  const int idx = pinIndex(pinNumber);
  if (idx < 0) return;

  pinStates[idx].pendingOff = true;
  pinStates[idx].offAtMs = millis() + (static_cast<unsigned long>(durationSec) * 1000UL);
}

void processPendingPinOff() {
  for (size_t i = 0; i < MANAGED_PIN_COUNT; i += 1) {
    if (!pinStates[i].pendingOff) continue;
    if (!millisReached(pinStates[i].offAtMs)) continue;

    setManagedPin(pinStates[i].pin, false);
    Serial.printf("[PIN] Auto OFF pin=%u\n", pinStates[i].pin);
  }
}

String normalizedBaseUrl() {
  String base = String(DEVICE_API_BASE_URL);
  base.trim();
  while (base.endsWith("/")) {
    base.remove(base.length() - 1);
  }
  return base;
}

String apiUrl(const char* path) {
  return normalizedBaseUrl() + String(path);
}

bool httpPostJson(const char* path, const String& requestBody, const String& bearerToken, int& statusCode, String& responseBody) {
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, apiUrl(path))) {
    Serial.printf("[HTTP] begin failed for POST %s\n", path);
    return false;
  }

  http.setTimeout(7000);
  http.addHeader("Content-Type", "application/json");
  if (bearerToken.length() > 0) {
    http.addHeader("Authorization", "Bearer " + bearerToken);
  }

  statusCode = http.POST(requestBody);
  if (statusCode > 0) {
    responseBody = http.getString();
  } else {
    responseBody = "";
  }
  http.end();
  return true;
}

bool httpGetJson(const char* path, const String& bearerToken, int& statusCode, String& responseBody) {
  WiFiClient client;
  HTTPClient http;
  if (!http.begin(client, apiUrl(path))) {
    Serial.printf("[HTTP] begin failed for GET %s\n", path);
    return false;
  }

  http.setTimeout(7000);
  if (bearerToken.length() > 0) {
    http.addHeader("Authorization", "Bearer " + bearerToken);
  }

  statusCode = http.GET();
  if (statusCode > 0) {
    responseBody = http.getString();
  } else {
    responseBody = "";
  }
  http.end();
  return true;
}

void connectWifiIfNeeded() {
  if (WiFi.status() == WL_CONNECTED) return;
  if (lastWifiAttemptMs != 0 && !millisReached(lastWifiAttemptMs + WIFI_RETRY_MS)) return;

  lastWifiAttemptMs = millis();
  Serial.printf("[WiFi] Connecting to %s\n", DEVICE_WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.begin(DEVICE_WIFI_SSID, DEVICE_WIFI_PASSWORD);

  unsigned long startedAt = millis();
  while (WiFi.status() != WL_CONNECTED && !millisReached(startedAt + 10000)) {
    delay(200);
    yield();
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.printf("[WiFi] Connected. IP=%s\n", WiFi.localIP().toString().c_str());
  } else {
    Serial.println("[WiFi] Connect timeout");
  }
}

void syncClockIfNeeded() {
  if (hasClockSync) return;
  if (WiFi.status() != WL_CONNECTED) return;
  if (lastClockAttemptMs != 0 && !millisReached(lastClockAttemptMs + CLOCK_RETRY_MS)) return;

  lastClockAttemptMs = millis();

  configTime(DEVICE_TZ_INFO, "pool.ntp.org", "time.nist.gov");
  Serial.println("[NTP] Syncing clock...");

  const unsigned long startedAt = millis();
  while (!millisReached(startedAt + 12000)) {
    const time_t now = time(nullptr);
    if (now >= MIN_VALID_EPOCH) {
      hasClockSync = true;
      Serial.printf("[NTP] Synced. epoch=%ld\n", static_cast<long>(now));
      return;
    }
    delay(200);
    yield();
  }

  Serial.println("[NTP] Sync timeout");
}

bool executionAlreadyProcessed(const String& key) {
  for (size_t i = 0; i < EXEC_CACHE_SIZE; i += 1) {
    if (execCache[i].key == key) {
      return true;
    }
  }
  return false;
}

void rememberExecutionKey(const String& key) {
  size_t slot = 0;
  bool foundEmpty = false;
  unsigned long oldestSeenAt = ULONG_MAX;

  for (size_t i = 0; i < EXEC_CACHE_SIZE; i += 1) {
    if (execCache[i].key.length() == 0) {
      slot = i;
      foundEmpty = true;
      break;
    }
    if (execCache[i].seenAtMs < oldestSeenAt) {
      oldestSeenAt = execCache[i].seenAtMs;
      slot = i;
    }
  }

  if (!foundEmpty) {
    execCache[slot].key = "";
  }

  execCache[slot].key = key;
  execCache[slot].seenAtMs = millis();
}

bool shouldRunByDay(JsonVariantConst daysOfWeek, int currentWeekday) {
  if (!daysOfWeek.is<JsonArrayConst>()) return true;

  JsonArrayConst arr = daysOfWeek.as<JsonArrayConst>();
  if (arr.size() == 0) return true;

  for (JsonVariantConst item : arr) {
    if (item.as<int>() == currentWeekday) return true;
  }
  return false;
}

String buildExecutionKey(JsonObjectConst schedule, const tm& now) {
  const char* scheduleId = schedule["scheduleId"] | "";
  const int pin = schedule["pinNumber"] | -1;

  char key[96];
  snprintf(
    key,
    sizeof(key),
    "%s|%d|%04d%02d%02d%02d%02d",
    scheduleId,
    pin,
    now.tm_year + 1900,
    now.tm_mon + 1,
    now.tm_mday,
    now.tm_hour,
    now.tm_min
  );
  return String(key);
}

void applyScheduleIfDue(JsonObjectConst schedule, const tm& now) {
  const int pinNumber = schedule["pinNumber"] | -1;
  const int action = schedule["action"] | -1;
  const int hour = schedule["hour"] | -1;
  const int minute = schedule["minute"] | -1;
  const bool isActive = schedule["isActive"] | false;

  if (!isActive) return;
  if (pinIndex(pinNumber) < 0) return;
  if (hour != now.tm_hour || minute != now.tm_min) return;
  if (!shouldRunByDay(schedule["daysOfWeek"], now.tm_wday)) return;

  const String key = buildExecutionKey(schedule, now);
  if (executionAlreadyProcessed(key)) return;
  rememberExecutionKey(key);

  if (action == 0) {
    setManagedPin(pinNumber, false);
    Serial.printf("[RUN] OFF pin=%d\n", pinNumber);
    return;
  }

  if (action == 1) {
    const int duration = schedule["duration"] | 0;
    if (duration <= 0) {
      Serial.printf("[RUN] Skip action=1 pin=%d because duration is missing\n", pinNumber);
      return;
    }
    setManagedPin(pinNumber, true);
    Serial.printf("[RUN] ON pin=%d duration=%d\n", pinNumber, duration);
    schedulePinOff(pinNumber, duration);
    return;
  }

  Serial.printf("[RUN] Unknown action=%d pin=%d\n", action, pinNumber);
}

bool deviceLogin() {
  if (WiFi.status() != WL_CONNECTED) return false;

  DynamicJsonDocument req(256);
  req["deviceId"] = DEVICE_ID;
  req["deviceSecret"] = DEVICE_SECRET;

  String body;
  serializeJson(req, body);

  int statusCode = 0;
  String responseBody;
  if (!httpPostJson("/auth/device/login", body, "", statusCode, responseBody)) {
    return false;
  }

  if (statusCode != 200) {
    Serial.printf("[AUTH] Login failed status=%d body=%s\n", statusCode, responseBody.c_str());
    return false;
  }

  DynamicJsonDocument res(2048);
  const DeserializationError err = deserializeJson(res, responseBody);
  if (err) {
    Serial.printf("[AUTH] Invalid JSON: %s\n", err.c_str());
    return false;
  }

  const char* token = res["token"] | "";
  if (token[0] == '\0') {
    Serial.println("[AUTH] Token missing");
    return false;
  }

  deviceToken = String(token);
  Serial.println("[AUTH] Login success");
  return true;
}

bool pollSchedulesAndRun() {
  if (WiFi.status() != WL_CONNECTED) return false;
  if (deviceToken.length() == 0) return false;

  int statusCode = 0;
  String responseBody;
  if (!httpGetJson("/automation/device/schedules/poll", deviceToken, statusCode, responseBody)) {
    return false;
  }

  if (statusCode == 401) {
    Serial.println("[POLL] Unauthorized, token cleared");
    deviceToken = "";
    return false;
  }

  if (statusCode != 200) {
    Serial.printf("[POLL] Failed status=%d body=%s\n", statusCode, responseBody.c_str());
    return false;
  }

  DynamicJsonDocument res(16384);
  const DeserializationError err = deserializeJson(res, responseBody);
  if (err) {
    Serial.printf("[POLL] Invalid JSON: %s\n", err.c_str());
    return false;
  }

  const int nextInterval = res["pollIntervalMs"] | static_cast<int>(DEFAULT_POLL_INTERVAL_MS);
  pollIntervalMs = static_cast<unsigned long>(
    constrain(nextInterval, DEVICE_MIN_POLL_INTERVAL_MS, DEVICE_MAX_POLL_INTERVAL_MS)
  );

  const time_t epochNow = time(nullptr);
  if (epochNow < MIN_VALID_EPOCH) {
    Serial.println("[POLL] Clock not synced, skip schedule run");
    return true;
  }

  tm nowLocal = {};
  localtime_r(&epochNow, &nowLocal);

  JsonArrayConst schedules = res["schedules"].as<JsonArrayConst>();
  for (JsonObjectConst item : schedules) {
    applyScheduleIfDue(item, nowLocal);
  }

  return true;
}

void setupPins() {
  for (size_t i = 0; i < MANAGED_PIN_COUNT; i += 1) {
    const uint8_t pin = MANAGED_PINS[i];
    pinMode(pin, OUTPUT);
    digitalWrite(pin, levelFor(false));
    pinStates[i] = {pin, false, false, 0};
  }
  Serial.println("[PIN] Initialized pins: 5,4,14,12");
}
}  // namespace

void setup() {
  Serial.begin(115200);
  delay(200);
  Serial.println();
  Serial.println("[BOOT] ESP8266 device controller start");

  setupPins();
  connectWifiIfNeeded();
  syncClockIfNeeded();
}

void loop() {
  connectWifiIfNeeded();
  syncClockIfNeeded();
  processPendingPinOff();

  if (WiFi.status() != WL_CONNECTED) {
    delay(50);
    return;
  }

  if (deviceToken.length() == 0) {
    if (millisReached(nextLoginAttemptMs)) {
      if (deviceLogin()) {
        nextPollAtMs = 0;
      } else {
        nextLoginAttemptMs = millis() + LOGIN_RETRY_MS;
      }
    }
    delay(20);
    return;
  }

  if (millisReached(nextPollAtMs)) {
    const bool ok = pollSchedulesAndRun();
    if (!ok && deviceToken.length() == 0) {
      nextLoginAttemptMs = millis() + LOGIN_RETRY_MS;
    }
    nextPollAtMs = millis() + pollIntervalMs;
  }

  delay(20);
}
