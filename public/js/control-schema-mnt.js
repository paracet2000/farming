(function controlSchemaMntPageModule(window, $) {
  'use strict';

  var TYPE_OPTIONS = ['GROUP', 'TOGGLE', 'DURATION', 'LINK'];

  function renderControlSchemaMnt(options) {
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

    var $shell = $('<div/>', { class: 'page-shell control-schema-page' });
    var $header = $('<div/>', { class: 'page-header' });
    var $titleWrap = $('<div/>');
    var $pageTitle = $('<div/>', { class: 'page-title', text: 'Control Schema' }).appendTo($titleWrap);
    var $pageNote = $('<div/>', { class: 'page-note', text: 'จัดการ schema ของปุ่มควบคุม' }).appendTo($titleWrap);
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
    $toolbar.append($('<label/>', { text: 'Device' }), $deviceSelect);

    var $form = $('<form/>', { class: 'control-form' });
    var $typeSelect = $('<select/>', { class: 'control-select', name: 'type' });
    TYPE_OPTIONS.forEach(function (t) { $('<option/>', { value: t, text: t }).appendTo($typeSelect); });
    var $labelInput = $('<input/>', { type: 'text', class: 'control-input', placeholder: 'Label' });
    var $orderInput = $('<input/>', { type: 'number', class: 'control-input', placeholder: 'Order', value: 0 });
    var $metaBox = $('<div/>', { class: 'control-meta' });
    var $submit = $('<button/>', { type: 'submit', class: 'control-btn primary', text: 'Save' });
    var $feedback = $('<div/>', { class: 'register-feedback' });

    $form.append(
      $('<label/>', { text: 'Type' }), $typeSelect,
      $('<label/>', { text: 'Label' }), $labelInput,
      $('<label/>', { text: 'Order' }), $orderInput,
      $metaBox,
      $submit
    );

    var $list = $('<div/>', { class: 'control-list' });

    $shell.append($header, $toolbar, $form, $list, $feedback);
    $mount.append($shell);

    var editingId = null;
    var pinDefs = [];

    function setFeedback(message, type) {
      $feedback.removeClass('success error').addClass(type || '').text(message || '');
    }

    async function ensureAdmin() {
      try {
        var me = await apiClient.get('/auth/me');
        var roles = Array.isArray(me.roles) ? me.roles : [];
        var isAdmin = roles.map(function (r) { return String(r).toLowerCase(); }).includes('admin');
        if (!isAdmin) {
          setFeedback('Admin only', 'error');
          if (onBack) {
            setTimeout(function () { onBack(); }, 700);
          }
          return false;
        }
        return true;
      } catch (_) {
        setFeedback('Unauthorized', 'error');
        if (onBack) {
          setTimeout(function () { onBack(); }, 700);
        }
        return false;
      }
    }

    var pageCode = opts.pageCode || window.location.pathname || 'control-schema-mnt';

    async function loadPageText() {
      try {
        var page = await apiClient.get('/configs/page', { query: { code: pageCode } });
        if (page && page.confName) $pageTitle.text(page.confName);
        if (page && page.confDescription) $pageNote.text(page.confDescription);
      } catch (_) {
        // fallback
      }
    }

    function buildPinSelect(selected) {
      var $select = $('<select/>', { class: 'control-select' });
      pinDefs.forEach(function (p) {
        $('<option/>', { value: p.confValue, text: p.confDescription }).appendTo($select);
      });
      if (selected) $select.val(String(selected));
      return $select;
    }

    function renderMetaFields(type, meta) {
      $metaBox.empty();
      if (type === 'GROUP') {
        $metaBox.append($('<label/>', { text: 'Background Color' }));
        $metaBox.append($('<input/>', { type: 'text', class: 'control-input', name: 'bgColor', value: meta.bgColor || '' }));
        return;
      }
      if (type === 'TOGGLE') {
        $metaBox.append($('<label/>', { text: 'Pin' }));
        $metaBox.append(buildPinSelect(meta.pin));
        $metaBox.append($('<label/>', { text: 'On Label' }));
        $metaBox.append($('<input/>', { type: 'text', class: 'control-input', name: 'onLabel', value: meta.onLabel || 'ON' }));
        $metaBox.append($('<label/>', { text: 'Off Label' }));
        $metaBox.append($('<input/>', { type: 'text', class: 'control-input', name: 'offLabel', value: meta.offLabel || 'OFF' }));
        $metaBox.append($('<label/>', { text: 'Duration (sec)' }));
        $metaBox.append($('<input/>', { type: 'number', class: 'control-input', name: 'durationSec', value: meta.durationSec || 15 }));
        return;
      }
      if (type === 'DURATION') {
        $metaBox.append($('<label/>', { text: 'Pin' }));
        $metaBox.append(buildPinSelect(meta.pin));
        $metaBox.append($('<label/>', { text: 'Default Duration (sec)' }));
        $metaBox.append($('<input/>', { type: 'number', class: 'control-input', name: 'defaultDurationSec', value: meta.defaultDurationSec || 15 }));
        $metaBox.append($('<label/>', { text: 'Button Label' }));
        $metaBox.append($('<input/>', { type: 'text', class: 'control-input', name: 'buttonLabel', value: meta.buttonLabel || 'Run' }));
        return;
      }
      if (type === 'LINK') {
        $metaBox.append($('<label/>', { text: 'URL' }));
        $metaBox.append($('<input/>', { type: 'text', class: 'control-input', name: 'url', value: meta.url || '' }));
        $metaBox.append($('<label/>', { text: 'Button Label' }));
        $metaBox.append($('<input/>', { type: 'text', class: 'control-input', name: 'buttonLabel', value: meta.buttonLabel || 'Go' }));
      }
    }

    function readMeta(type) {
      var meta = {};
      if (type === 'GROUP') {
        meta.bgColor = $metaBox.find('input[name="bgColor"]').val() || '';
      } else if (type === 'TOGGLE') {
        meta.pin = Number($metaBox.find('select').val());
        meta.onLabel = $metaBox.find('input[name="onLabel"]').val() || 'ON';
        meta.offLabel = $metaBox.find('input[name="offLabel"]').val() || 'OFF';
        meta.durationSec = Number($metaBox.find('input[name="durationSec"]').val()) || 15;
      } else if (type === 'DURATION') {
        meta.pin = Number($metaBox.find('select').val());
        meta.defaultDurationSec = Number($metaBox.find('input[name="defaultDurationSec"]').val()) || 15;
        meta.buttonLabel = $metaBox.find('input[name="buttonLabel"]').val() || 'Run';
      } else if (type === 'LINK') {
        meta.url = $metaBox.find('input[name="url"]').val() || '';
        meta.buttonLabel = $metaBox.find('input[name="buttonLabel"]').val() || 'Go';
      }
      return meta;
    }

    function renderList(items) {
      $list.empty();
      if (!items.length) {
        $list.append($('<div/>', { class: 'control-empty', text: 'No schema' }));
        return;
      }

      items.forEach(function (item) {
        var $row = $('<div/>', { class: 'control-row' });
        $('<div/>', { text: item.type + ' - ' + item.label }).appendTo($row);
        var $actions = $('<div/>', { class: 'control-row-actions' }).appendTo($row);
        $('<button/>', { type: 'button', class: 'control-btn', text: 'Edit' }).on('click', function () {
          editingId = item.schemaId;
          $typeSelect.val(item.type);
          $labelInput.val(item.label);
          $orderInput.val(item.orderIndex || 0);
          renderMetaFields(item.type, item.meta || {});
        }).appendTo($actions);
        $('<button/>', { type: 'button', class: 'control-btn off', text: 'Delete' }).on('click', async function () {
          try {
            await apiClient.del('/control-schema/' + encodeURIComponent(item.schemaId));
            loadSchema();
          } catch (err) {
            var msg = apiClient.getErrorMessage ? apiClient.getErrorMessage(err) : 'Delete failed';
            setFeedback(msg, 'error');
          }
        }).appendTo($actions);
        $list.append($row);
      });
    }

    async function loadSchema() {
      var deviceId = String($deviceSelect.val() || '').trim();
      if (!deviceId) return renderList([]);
      try {
        var items = await apiClient.get('/control-schema', { query: { deviceId: deviceId } });
        renderList(Array.isArray(items) ? items : []);
      } catch (err) {
        renderList([]);
        var msg = apiClient.getErrorMessage ? apiClient.getErrorMessage(err) : 'Load schema failed';
        setFeedback(msg, 'error');
      }
    }

    async function loadData() {
      try {
        var devices = await apiClient.get('/devices');
        var pins = await apiClient.get('/configs/pin-def');
        pinDefs = (Array.isArray(pins) ? pins : []).filter(function (p) {
          return String(p.confDescription || '').indexOf('[ESP32]') === 0;
        });

        var deviceOptions = (Array.isArray(devices) ? devices : []).map(function (d) {
          return { value: d.deviceId, label: d.deviceName ? (d.deviceName + ' (' + d.deviceId + ')') : d.deviceId };
        });
        $deviceSelect.empty();
        deviceOptions.forEach(function (o) {
          $('<option/>', { value: o.value, text: o.label }).appendTo($deviceSelect);
        });
        renderMetaFields($typeSelect.val(), {});
        await loadSchema();
      } catch (err) {
        var msg = apiClient.getErrorMessage ? apiClient.getErrorMessage(err) : 'Load failed';
        setFeedback(msg, 'error');
      }
    }

    $typeSelect.on('change', function () {
      renderMetaFields($typeSelect.val(), {});
    });

    $deviceSelect.on('change', function () {
      loadSchema();
    });

    $form.on('submit', async function (e) {
      e.preventDefault();
      var deviceId = String($deviceSelect.val() || '').trim();
      var type = String($typeSelect.val() || '').trim();
      var label = String($labelInput.val() || '').trim();
      var orderIndex = Number($orderInput.val()) || 0;
      var meta = readMeta(type);

      if (!deviceId || !type || !label) {
        setFeedback('Device, type, and label are required', 'error');
        return;
      }

      try {
        if (editingId) {
          await apiClient.patch('/control-schema/' + encodeURIComponent(editingId), {
            label: label,
            orderIndex: orderIndex,
            meta: meta
          });
        } else {
          await apiClient.post('/control-schema', {
            deviceId: deviceId,
            type: type,
            label: label,
            orderIndex: orderIndex,
            meta: meta
          });
        }

        editingId = null;
        $labelInput.val('');
        renderMetaFields(type, {});
        await loadSchema();
        setFeedback('Saved', 'success');
      } catch (err) {
        var msg = apiClient.getErrorMessage ? apiClient.getErrorMessage(err) : 'Save failed';
        setFeedback(msg, 'error');
      }
    });

    loadPageText();
    ensureAdmin().then(function (ok) {
      if (ok) loadData();
    });
  }

  window.controlSchemaMntPage = {
    render: renderControlSchemaMnt
  };
})(window, window.jQuery);
