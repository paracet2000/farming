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

    if (!window.DevExpress || !window.DevExpress.ui || typeof $.fn.dxForm !== 'function') {
      $mount.html('<div class="page-shell"><p>DevExtreme is not loaded.</p></div>');
      return;
    }

    $mount.empty();

    var $shell = $('<div/>', { class: 'page-shell control-shell' });
    var $header = $('<div/>', { class: 'page-header' });
    var $titleWrap = $('<div/>');
    var $pageTitle = $('<div/>', { class: 'page-title', text: 'Control' }).appendTo($titleWrap);
    var $pageNote = $('<div/>', { class: 'page-note', text: 'สั่งงานอุปกรณ์แบบ manual' }).appendTo($titleWrap);
    $header.append($titleWrap);

    if (onBack) {
      $('<button/>', {
        type: 'button',
        class: 'page-back-btn',
        text: 'Back to Menu'
      }).on('click', onBack).appendTo($header);
    }

    var $toolbar = $('<div/>', { class: 'control-toolbar' });
    var $formHost = $('<div/>', { class: 'control-form control-device-select' });
    var $controls = $('<div/>', { class: 'control-grid' });
    var $feedback = $('<div/>', { class: 'register-feedback' });

    $toolbar.append($formHost);
    $shell.append($header, $toolbar, $controls, $feedback);
    $mount.append($shell);

    var formInstance = null;

    function setFeedback(message, type) {
      $feedback.removeClass('success error').addClass(type || '').text(message || '');
    }

    function getDeviceId() {
      if (!formInstance) return '';
      var data = formInstance.option('formData') || {};
      return String(data.deviceId || '').trim();
    }

    function renderGroup(item, paletteIndex) {
      var colors = ['#1f8f5f', '#1c64f2', '#e11d48', '#0f766e', '#6d28d9', '#b45309'];
      var bg = item.meta && item.meta.bgColor ? item.meta.bgColor : colors[paletteIndex % colors.length];
      var $group = $('<div/>', { class: 'control-card group-card' });
      $('<div/>', { class: 'control-title', text: item.label || '-' }).appendTo($group);
      if (item.meta && item.meta.caption) {
        $('<div/>', { class: 'control-subtitle', text: item.meta.caption }).appendTo($group);
      }
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
      $('<div/>', { class: 'control-title', text: item.label || 'Toggle' }).appendTo($card);
      var $btnRow = $('<div/>', { class: 'control-actions' }).appendTo($card);
      var $onWrap = $('<div/>').appendTo($btnRow);
      var $offWrap = $('<div/>').appendTo($btnRow);
      var onBtn = $onWrap.dxButton({ text: onLabel, type: 'success', stylingMode: 'contained' }).dxButton('instance');
      var offBtn = $offWrap.dxButton({ text: offLabel, type: 'default', stylingMode: 'contained' }).dxButton('instance');

      function sync() {
        onBtn.option('disabled', state.on);
        offBtn.option('disabled', !state.on);
      }

      async function send(action) {
        try {
          setFeedback('Sending...', '');
          await apiClient.post('/automation/devices/' + encodeURIComponent(getDeviceId()) + '/tasks', {
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

      onBtn.on('click', function () { send(1); });
      offBtn.on('click', function () { send(0); });
      sync();
      return $card;
    }

    function renderDuration(item) {
      var meta = item.meta || {};
      var pin = Number(meta.pin);
      var buttonLabel = meta.buttonLabel || 'Run';
      var defaultDuration = Number(meta.defaultDurationSec || 15);

      var $card = $('<div/>', { class: 'control-card' });
      $('<div/>', { class: 'control-title', text: item.label || 'Duration' }).appendTo($card);
      var $row = $('<div/>', { class: 'control-duration-row' }).appendTo($card);
      var $inputWrap = $('<div/>').appendTo($row);
      var $btnWrap = $('<div/>').appendTo($row);
      var inputBox = $inputWrap.dxNumberBox({
        min: 1,
        value: defaultDuration,
        width: 120,
        showSpinButtons: true
      }).dxNumberBox('instance');
      var btn = $btnWrap.dxButton({ text: buttonLabel, type: 'default', stylingMode: 'contained' }).dxButton('instance');

      btn.on('click', async function () {
        var duration = Number(inputBox.option('value'));
        if (!Number.isFinite(duration) || duration <= 0) {
          setFeedback('Duration must be greater than 0', 'error');
          return;
        }
        try {
          setFeedback('Sending...', '');
          await apiClient.post('/automation/devices/' + encodeURIComponent(getDeviceId()) + '/tasks', {
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
      $('<div/>', { class: 'control-title', text: item.label || 'Link' }).appendTo($card);
      var $btnWrap = $('<div/>', { class: 'control-link-row' }).appendTo($card);
      var btn = $btnWrap.dxButton({ text: buttonLabel, type: 'default', stylingMode: 'contained' }).dxButton('instance');
      btn.on('click', function () {
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

    async function loadPageText() {
      try {
        var page = await apiClient.get('/configs/page', { query: { code: 'control' } });
        if (page && page.confName) $pageTitle.text(page.confName);
        if (page && page.confDescription) $pageNote.text(page.confDescription);
      } catch (_) {
        // fallback
      }
    }

    async function checkAdmin() {
      try {
        var me = await apiClient.get('/auth/me');
        var roles = Array.isArray(me.roles) ? me.roles : [];
        return roles.map(function (r) { return String(r).toLowerCase(); }).includes('admin');
      } catch (_) {
        return false;
      }
    }

    async function loadSchema() {
      var deviceId = getDeviceId();
      if (!deviceId) return renderControls([]);
      try {
        var schemas = await apiClient.get('/control-schema', { query: { deviceId: deviceId } });
        renderControls(Array.isArray(schemas) ? schemas : []);
      } catch (err) {
        renderControls([]);
        var message = typeof apiClient.getErrorMessage === 'function'
          ? apiClient.getErrorMessage(err)
          : 'Failed to load schema';
        setFeedback(message, 'error');
      }
    }

    function initForm(deviceOptions, isAdmin) {
      formInstance = $formHost.dxForm({
        labelLocation: 'top',
        colCountByScreen: { xs: 1, sm: 2, md: 2, lg: 2 },
        formData: { deviceId: deviceOptions.length ? deviceOptions[0].value : '' },
        items: [
          {
            dataField: 'deviceId',
            label: { text: 'Device' },
            editorType: 'dxSelectBox',
            editorOptions: {
              dataSource: deviceOptions,
              valueExpr: 'value',
              displayExpr: 'label',
              searchEnabled: true,
              onValueChanged: function () { loadSchema(); }
            }
          },
          {
            itemType: 'button',
            horizontalAlignment: 'left',
            buttonOptions: {
              text: 'Control Schema',
              icon: 'preferences',
              type: 'default',
              visible: isAdmin,
              onClick: function () {
                window.location.href = '/control-schema-mnt';
              }
            }
          }
        ]
      }).dxForm('instance');
    }

    async function loadData() {
      setFeedback('Loading...', '');
      try {
        var devices = await apiClient.get('/devices');
        var deviceList = Array.isArray(devices) ? devices : [];
        var deviceOptions = deviceList.map(function (d) {
          return { value: d.deviceId, label: d.deviceName ? (d.deviceName + ' (' + d.deviceId + ')') : d.deviceId };
        });

        var isAdmin = await checkAdmin();
        initForm(deviceOptions, isAdmin);
        await loadSchema();
        setFeedback('', '');
      } catch (err) {
        var message = typeof apiClient.getErrorMessage === 'function'
          ? apiClient.getErrorMessage(err)
          : 'Failed to load data';
        setFeedback(message, 'error');
      }
    }

    loadData();
    loadPageText();
  }

  window.controlPage = {
    render: renderControlPage
  };
})(window, window.jQuery);
