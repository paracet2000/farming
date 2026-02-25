#pragma once

// Wi-Fi settings
#define DEVICE_WIFI_SSID "YOUR_WIFI_SSID"
#define DEVICE_WIFI_PASSWORD "YOUR_WIFI_PASSWORD"

// API endpoint (without trailing slash)
#define DEVICE_API_BASE_URL "http://192.168.1.100:3000"

// Device credentials (must match data in your backend database)
#define DEVICE_ID "device-001"
#define DEVICE_SECRET "change-me"

// Timezone string used by configTime(); ICT = UTC+7
#define DEVICE_TZ_INFO "ICT-7"

// Relay logic:
// 1 = HIGH means ON, 0 = LOW means ON (for active-low relay modules)
#define DEVICE_ACTIVE_HIGH 1

// Poll interval bounds from server response pollIntervalMs
#define DEVICE_MIN_POLL_INTERVAL_MS 1000
#define DEVICE_MAX_POLL_INTERVAL_MS 60000

