(function controlPageModule(window, $) {
  'use strict';

  function renderControlPage(options) {
    var opts = options || {};
    var apiClient = window.clientLib || null;
    var mountSelector = opts.mountSelector || '.page-area';
    var onBack = typeof opts.onBack === 'function' ? opts.onBack : null;
    var $mount = $(mountSelector);

    if (!$mount.length) return;
    if (!apiClient || typeof apiClient.get !== 'function' || typeof apiClient.post !== 'function') {
      $mount.html('<div class="page-shell"><p>clientLib is not loaded.</p></div>');
      return;
    }

    if (opts.apiBase && typeof apiClient.setApiBase === 'function') {
      apiClient.setApiBase(opts.apiBase);
    }

    $mount.empty();

    var $shell = $('<div/>', { class: 'page-shell control-page' });
    var $header = $('<div/>', { class: 'page-header' });
    var $titleWrap = $('<div/>');
    $('<div/>', { class: 'page-title', text: 'Control' }).appendTo($titleWrap);
    $('<div/>', { class: 'page-note', text: 'สั่งงานอุปกรณ์แบบ manual' }).appendTo($titleWrap);
    $header.append($titleWrap);

    if (onBack) {
      $('<button/>', {
        type: 'button',
        class: 'page-back-btn',
        text: 'Back to Menu'
      }).on('click', onBack).appendTo($header);
    }

    var $toolbar = $('<div/>', { class: 'control-toolbar' });
    var $deviceSelect = $('<select/>', { class: 'control-select', name: 'deviceId' });
    var $gearBtn = $('<button/>', { type: 'button', class: 'control-gear', text: '⚙️' });
    var $controls = $('<div/>', { class: 'control-grid' });
    var $feedback = $('<div/>', { class: 'register-feedback' });

    $toolbar.append($('<label/>', { text: 'Device' }), $deviceSelect, $gearBtn);
    $shell.append($header, $toolbar, $controls, $feedback);
    $mount.append($shell);

    function setFeedback(message, type) {
      $feedback.removeClass('success error').addClass(type || '').text(message || '');
    }

    function fillSelect($select, items, valueKey, labelKey) {
      $select.empty();
      items.forEach(function (item) {
        var value = String(item[valueKey] || '').trim();
        var label = String(item[labelKey] || value || '-');
        $('<option/>', { value: value, text: label }).appendTo($select);
      });
    }

    function renderGroup(item, paletteIndex) {
      var colors = ['#fde68a', '#bfdbfe', '#fecaca', '#bbf7d0', '#e9d5ff', '#fecdd3'];
      var bg = item.meta && item.meta.bgColor ? item.meta.bgColor : colors[paletteIndex % colors.length];
      var $group = $('<div/>', { class: 'control-group', text: item.label || '-' });
      $group.css('background', bg);
      return $group;
    }

    function renderToggle(item) {
      var meta = item.meta || {};
      var pin = Number(meta.pin);
      var duration = Number(meta.durationSec || 15);
      var onLabel = meta.onLabel || 'ON';
      var offLabel = meta.offLabel || 'OFF';

      var state = { on: false };
      var $card = $('<div/>', { class: 'control-card' });
      $('<div/>', { class: 'control-label', text: item.label || 'Toggle' }).appendTo($card);
      var $btnRow = $('<div/>', { class: 'control-buttons' }).appendTo($card);

      var $on = $('<button/>', { type: 'button', class: 'control-btn on', text: onLabel }).appendTo($btnRow);
      var $off = $('<button/>', { type: 'button', class: 'control-btn off', text: offLabel }).appendTo($btnRow);

      function sync() {
        $on.prop('disabled', state.on);
        $off.prop('disabled', !state.on);
      }

      async function send(action) {
        try {
          setFeedback('Sending...', '');
          await apiClient.post('/automation/devices/' + encodeURIComponent(String($deviceSelect.val() || '')) + '/tasks', {
            pin: pin,
            duration: action === 1 ? duration : 0,
            action: action
          });
          state.on = action === 1;
          sync();
          setFeedback('Command queued', 'success');
        } catch (err) {
          var message = typeof apiClient.getErrorMessage === 'function'
            ? apiClient.getErrorMessage(err)
            : 'Request failed';
          setFeedback(message, 'error');
        }
      }

      $on.on('click', function () { send(1); });
      $off.on('click', function () { send(0); });
      sync();
      return $card;
    }

    function renderDuration(item) {
      var meta = item.meta || {};
      var pin = Number(meta.pin);
      var buttonLabel = meta.buttonLabel || 'Run';
      var defaultDuration = Number(meta.defaultDurationSec || 15);

      var $card = $('<div/>', { class: 'control-card' });
      $('<div/>', { class: 'control-label', text: item.label || 'Duration' }).appendTo($card);
      var $row = $('<div/>', { class: 'control-buttons' }).appendTo($card);
      var $input = $('<input/>', { type: 'number', min: 1, value: defaultDuration, class: 'control-input' }).appendTo($row);
      var $btn = $('<button/>', { type: 'button', class: 'control-btn primary', text: buttonLabel }).appendTo($row);

      $btn.on('click', async function () {
        var duration = Number($input.val());
        if (!Number.isFinite(duration) || duration <= 0) {
          setFeedback('Duration must be greater than 0', 'error');
          return;
        }
        try {
          setFeedback('Sending...', '');
          await apiClient.post('/automation/devices/' + encodeURIComponent(String($deviceSelect.val() || '')) + '/tasks', {
            pin: pin,
            duration: duration,
            action: 1
          });
          setFeedback('Command queued', 'success');
        } catch (err) {
          var message = typeof apiClient.getErrorMessage === 'function'
            ? apiClient.getErrorMessage(err)
            : 'Request failed';
          setFeedback(message, 'error');
        }
      });

      return $card;
    }

    function renderLink(item) {
      var meta = item.meta || {};
      var url = meta.url || '#';
      var buttonLabel = meta.buttonLabel || 'Go';

      var $card = $('<div/>', { class: 'control-card' });
      $('<div/>', { class: 'control-label', text: item.label || 'Link' }).appendTo($card);
      var $btn = $('<button/>', { type: 'button', class: 'control-btn primary', text: buttonLabel }).appendTo($card);
      $btn.on('click', function () {
        if (url && url !== '#') window.open(url, '_blank');
      });
      return $card;
    }

    function renderControls(list) {
      $controls.empty();
      if (!list.length) {
        $controls.append($('<div/>', { class: 'control-empty', text: 'No control schema' }));
        return;
      }
      var paletteIndex = 0;
      list.forEach(function (item) {
        if (!item || item.isActive === false) return;
        if (item.type === 'GROUP') {
          $controls.append(renderGroup(item, paletteIndex++));
        } else if (item.type === 'TOGGLE') {
          $controls.append(renderToggle(item));
        } else if (item.type === 'DURATION') {
          $controls.append(renderDuration(item));
        } else if (item.type === 'LINK') {
          $controls.append(renderLink(item));
        }
      });
    }

    async function loadData() {
      setFeedback('Loading...', '');
      try {
        var devices = await apiClient.get('/devices');
        var deviceList = Array.isArray(devices) ? devices : [];

        var deviceOptions = deviceList.map(function (d) {
          return { value: d.deviceId, label: d.deviceName ? (d.deviceName + ' (' + d.deviceId + ')') : d.deviceId };
        });
        fillSelect($deviceSelect, deviceOptions, 'value', 'label');

        await loadSchema();
        setFeedback('', '');
      } catch (err) {
        var message = typeof apiClient.getErrorMessage === 'function'
          ? apiClient.getErrorMessage(err)
          : 'Failed to load data';
        setFeedback(message, 'error');
      }
    }

    async function loadSchema() {
      var deviceId = String($deviceSelect.val() || '').trim();
      if (!deviceId) return renderControls([]);
      try {
        var schemas = await apiClient.get('/control-schema', { query: { deviceId: deviceId } });
        var list = Array.isArray(schemas) ? schemas : [];
        renderControls(list);
      } catch (err) {
        renderControls([]);
        var message = typeof apiClient.getErrorMessage === 'function'
          ? apiClient.getErrorMessage(err)
          : 'Failed to load schema';
        setFeedback(message, 'error');
      }
    }

    async function checkAdmin() {
      try {
        var me = await apiClient.get('/auth/me');
        var roles = Array.isArray(me.roles) ? me.roles : [];
        var isAdmin = roles.map(function (r) { return String(r).toLowerCase(); }).includes('admin');
        $gearBtn.toggle(isAdmin);
      } catch (_) {
        $gearBtn.hide();
      }
    }

    $deviceSelect.on('change', function () {
      loadSchema();
    });

    $gearBtn.on('click', function () {
      window.location.href = '/control-schema-mnt';
    });

    loadData();
    checkAdmin();
  }

  window.controlPage = {
    render: renderControlPage
  };
})(window, window.jQuery);
