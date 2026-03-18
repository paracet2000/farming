#pragma once

#include <Arduino.h>

const char MAIN_PAGE[] PROGMEM = R"raw(
<!doctype html>
<html>
  <head>
    <meta charset='utf-8'>
    <meta name='viewport' content='width=device-width, initial-scale=1'>
    <title>Puppy Smart House</title>
    <link rel='stylesheet' href='https://cdnjs.cloudflare.com/ajax/libs/font-awesome/4.7.0/css/font-awesome.min.css'>
  <style>
    body { font-family: Arial, sans-serif; padding: 16px; background: #f7f8fb; color: #111; }
    .card { max-width: 720px; background: #fff; border: 1px solid #ddd; border-radius: 10px; padding: 16px; }
    h1 { margin-top: 0; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    @media (max-width: 768px) {
      .grid { grid-template-columns: 1fr; }
    }
    .row { display: flex; justify-content: space-between; align-items: center; padding: 10px; border: 1px solid #eee; border-radius: 8px; }
    .status { font-weight: bold; }
    button { padding: 8px 12px; border: 0; background: green; color: #fff; border-radius: 8px; cursor: pointer; }
    .off { background: red; }
    .topbar { display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; }
    .meta { font-size: 13px; color: #555; }
    .status { hidden: true; }
    form { margin: 0; }
  </style>
</head>
<body>
  <div class='card'>
    <div class='topbar'>
      <h1>Puppy Smart House</h1>
      <a href='/config'><button type='button'><i style="font-size:24px" class="fa">&#xf013;</i></button></a>
    </div>
    <div class='meta' id='tempMeta'>Inside: {{TEMP_INSIDE}} C | Outside: {{TEMP_OUTSIDE}} C</div>
    <div class='meta' id='heatAutoMeta'>Heat Auto: {{HEAT_AUTO}}</div>
    <div style='margin-top:12px' class='grid'>
      <div class='row'>
        <div id='waterLabel'>Water [status: {{WATER_STATE}}, {{WATER_DURATION_SEC}} sec.]</div>
        <div>          
          <form method='post' action='/control' style='display:inline'>          
            <input type='hidden' name='device' value='water'>
            <input type='hidden' name='state' value='{{WATER_TOGGLE}}'>
            <button id='waterBtn' class='{{WATER_BTN_CLASS}}'>{{WATER_BTN_TEXT}}</button>
          </form>
        </div>
      </div>
      <div class='row'>
        <div id='foodLabel'>Food [status: {{FOOD_STATE}}, {{FOOD_DURATION_SEC}} sec.]</div>
        <div>          
          <form method='post' action='/control' style='display:inline'>
            <input type='hidden' name='device' value='food'>
            <input type='hidden' name='state' value='{{FOOD_TOGGLE}}'>
            <button id='foodBtn' class='{{FOOD_BTN_CLASS}}'>{{FOOD_BTN_TEXT}}</button>
          </form>
        </div>
      </div>
      <div class='row'>
        <div>Light</div>
        <div>          
          <form method='post' action='/control' style='display:inline'>
            <input type='hidden' name='device' value='light'>
            <input type='hidden' name='state' value='{{LIGHT_TOGGLE}}'>
            <button id='lightBtn' class='{{LIGHT_BTN_CLASS}}'>{{LIGHT_BTN_TEXT}}</button>
          </form>
        </div>
      </div>
      <div class='row'>
        <div>Fan</div>
        <div>          
          <form method='post' action='/control' style='display:inline'>
            <input type='hidden' name='device' value='fan'>
            <input type='hidden' name='state' value='{{FAN_TOGGLE}}'>
            <button id='fanBtn' class='{{FAN_BTN_CLASS}}'>{{FAN_BTN_TEXT}}</button>
          </form>
        </div>
      </div>
      <div class='row'>
        <div>Heat Lamp</div>
        <div>          
          <form method='post' action='/control' style='display:inline'>
            <input type='hidden' name='device' value='heat'>
            <input type='hidden' name='state' value='{{HEAT_TOGGLE}}'>
            <button id='heatBtn' class='{{HEAT_BTN_CLASS}}'>{{HEAT_BTN_TEXT}}</button>
          </form>
        </div>
      </div>
      <div class='row'>
        <div>Heat Auto</div>
        <div>
          <form method='post' action='/control' style='display:inline'>
            <input type='hidden' name='device' value='heat_auto'>
            <input type='hidden' name='state' value='{{HEAT_AUTO_TOGGLE}}'>
            <button id='heatAutoBtn' class='{{HEAT_AUTO_BTN_CLASS}}'>{{HEAT_AUTO_BTN_TEXT}}</button>
          </form>
        </div>
      </div>
    </div>
    <script>
      let refreshTimer = null;
      async function refreshState() {
        try {
          const res = await fetch('/state');
          if (!res.ok) return;
          const data = await res.json();
          const waterLabel = document.getElementById('waterLabel');
          if (waterLabel) waterLabel.textContent = 'Water [' + (data.waterOn ? 'ON' : 'OFF') + ', ' + Math.round(data.waterAutoOffMs / 1000) + ' sec.]';
          const foodLabel = document.getElementById('foodLabel');
          if (foodLabel) foodLabel.textContent = 'Food [' + (data.foodOn ? 'ON' : 'OFF') + ', ' + Math.round(data.foodAutoOffMs / 1000) + ' sec.]';
          document.getElementById('waterBtn').textContent = data.waterOn ? 'Turn Off' : 'Turn On';
          document.getElementById('foodBtn').textContent = data.foodOn ? 'Turn Off' : 'Turn On';
          document.getElementById('lightBtn').textContent = data.lightOn ? 'Turn Off' : 'Turn On';
          document.getElementById('fanBtn').textContent = data.fanOn ? 'Turn Off' : 'Turn On';
          document.getElementById('heatBtn').textContent = data.heatLampOn ? 'Turn Off' : 'Turn On';
          document.getElementById('heatAutoBtn').className = data.heatAutoEnabled ? 'off' : '';
          document.getElementById('heatAutoBtn').textContent = data.heatAutoEnabled ? 'Disable' : 'Enable';
          const inside = data.insideTempC === null ? '-' : data.insideTempC.toFixed(1);
          const outside = data.outsideTempC === null ? '-' : data.outsideTempC.toFixed(1);
          const tempMeta = document.getElementById('tempMeta');
          if (tempMeta) tempMeta.textContent = 'Inside: ' + inside + ' C | Outside: ' + outside + ' C';
          const heatMeta = document.getElementById('heatAutoMeta');
          if (heatMeta) heatMeta.textContent = 'Heat Auto: ' + (data.heatAutoEnabled ? 'ON' : 'OFF');

          if (refreshTimer) clearInterval(refreshTimer);
          if (data.dhtIntervalMs) {
            refreshTimer = setInterval(refreshState, Math.max(1000, data.dhtIntervalMs));
          }
        } catch (e) {
          console.error(e);
        }
      }
      refreshState();
    </script>
  </div>
</body>
</html>
)raw";
