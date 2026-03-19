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

    var $form = $('<form/>', { class: 'control-form' });
    var $deviceSelect = $('<select/>', { class: 'control-select', name: 'deviceId' });
    var $pinSelect = $('<select/>', { class: 'control-select', name: 'pin' });
    var $duration = $('<input/>', { type: 'number', min: 1, value: 15, class: 'control-input', name: 'duration' });
    var $submit = $('<button/>', { type: 'submit', class: 'control-btn', text: 'Send Command' });
    var $feedback = $('<div/>', { class: 'register-feedback' });

    $form.append(
      $('<label/>', { text: 'Device' }), $deviceSelect,
      $('<label/>', { text: 'Pin' }), $pinSelect,
      $('<label/>', { text: 'Duration (sec)' }), $duration,
      $submit
    );

    $shell.append($header, $form, $feedback);
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

    async function loadData() {
      setFeedback('Loading...', '');
      try {
        var devices = await apiClient.get('/devices');
        var pins = await apiClient.get('/configs/pin-def');

        var deviceList = Array.isArray(devices) ? devices : [];
        var pinList = Array.isArray(pins) ? pins : [];

        var deviceOptions = deviceList.map(function (d) {
          return { value: d.deviceId, label: d.deviceName ? (d.deviceName + ' (' + d.deviceId + ')') : d.deviceId };
        });

        var pinOptions = pinList
          .filter(function (p) {
            var desc = String(p.confDescription || '');
            return desc.indexOf('[ESP32]') === 0;
          })
          .map(function (p) {
            return { value: p.confValue, label: p.confDescription + ' (pin ' + p.confValue + ')' };
          });

        fillSelect($deviceSelect, deviceOptions, 'value', 'label');
        fillSelect($pinSelect, pinOptions, 'value', 'label');
        setFeedback('', '');
      } catch (err) {
        var message = typeof apiClient.getErrorMessage === 'function'
          ? apiClient.getErrorMessage(err)
          : 'Failed to load data';
        setFeedback(message, 'error');
      }
    }

    $form.on('submit', async function (e) {
      e.preventDefault();
      var deviceId = String($deviceSelect.val() || '').trim();
      var pin = Number($pinSelect.val());
      var duration = Number($duration.val());

      if (!deviceId) {
        setFeedback('Please select device', 'error');
        return;
      }
      if (!Number.isInteger(pin)) {
        setFeedback('Please select pin', 'error');
        return;
      }
      if (!Number.isFinite(duration) || duration <= 0) {
        setFeedback('Duration must be greater than 0', 'error');
        return;
      }

      try {
        setFeedback('Sending...', '');
        var payload = { pin: pin, duration: duration };
        var res = await apiClient.post('/automation/devices/' + encodeURIComponent(deviceId) + '/tasks', payload);
        setFeedback('Command queued. Execution ID: ' + (res && res.executionLogId ? res.executionLogId : '-'), 'success');
      } catch (err) {
        var message = typeof apiClient.getErrorMessage === 'function'
          ? apiClient.getErrorMessage(err)
          : 'Request failed';
        setFeedback(message, 'error');
      }
    });

    loadData();
  }

  window.controlPage = {
    render: renderControlPage
  };
})(window, window.jQuery);
