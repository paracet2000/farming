(function devicesSchedulePageModule(window, $) {
  'use strict';

  var DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  var ACTION_OPTIONS = [
    { value: 1, text: 'เปิด' },
    { value: 0, text: 'ปิด' }
  ];

  function normalizeList(value) {
    return Array.isArray(value) ? value : [];
  }

  function toDeviceDisplay(item) {
    var name = String(item && item.deviceName ? item.deviceName : '').trim();
    var id = String(item && item.deviceId ? item.deviceId : '').trim();
    if (name && id) return name + ' (' + id + ')';
    return name || id || '-';
  }

  function toScheduleDisplay(item) {
    var name = String(item && item.scheduleName ? item.scheduleName : '').trim();
    var id = String(item && item.scheduleId ? item.scheduleId : '').trim();
    return name || id || '-';
  }

  function renderDevicesSchedulePage(options) {
    var opts = options || {};
    var apiClient = window.clientLib || null;
    var mountSelector = opts.mountSelector || '.page-area';
    var onBack = typeof opts.onBack === 'function' ? opts.onBack : null;
    var $mount = $(mountSelector);

    if (!$mount.length) return;

    if (
      !apiClient ||
      typeof apiClient.get !== 'function' ||
      typeof apiClient.post !== 'function' ||
      typeof apiClient.patch !== 'function'
    ) {
      $mount.html('<div class="page-shell"><p>clientLib is not loaded.</p></div>');
      return;
    }

    if (opts.apiBase && typeof apiClient.setApiBase === 'function') {
      apiClient.setApiBase(opts.apiBase);
    }

    if (!window.DevExpress || !window.DevExpress.ui || typeof $.fn.dxDataGrid !== 'function') {
      $mount.html('<div class="page-shell"><p>DevExtreme is not loaded.</p></div>');
      return;
    }

    $mount.empty();

    var $shell = $('<div/>', { class: 'page-shell devices-page' });
    var $header = $('<div/>', { class: 'page-header' });
    var $titleWrap = $('<div/>');
    $('<div/>', { class: 'page-title', text: 'Devices & Schedule' }).appendTo($titleWrap);
    $('<div/>', { class: 'page-note', text: 'Manage device schedule mappings in one place' }).appendTo($titleWrap);
    $header.append($titleWrap);

    if (onBack) {
      $('<button/>', {
        type: 'button',
        class: 'page-back-btn',
        text: 'Back to Menu'
      }).on('click', onBack).appendTo($header);
    }

    var $toolbar = $('<div/>', { class: 'devices-toolbar' });
    var $deviceSelect = $('<div/>', { class: 'devices-select' });
    var $addDeviceBtn = $('<div/>');
    var $refreshBtn = $('<div/>');
    $toolbar.append($deviceSelect, $addDeviceBtn, $refreshBtn);

    var $scheduleTitle = $('<div/>', { class: 'devices-grid-title', text: 'Schedules' });
    var $scheduleGrid = $('<div/>', { class: 'schedule-grid' });
    var $mappingTitle = $('<div/>', { class: 'devices-grid-title', text: 'Device Schedule Mapping' });
    var $grid = $('<div/>', { class: 'schedule-grid' });
    var $feedback = $('<div/>', { class: 'register-feedback' });
    var $addDevicePopup = $('<div/>');

    $shell.append($header, $toolbar, $scheduleTitle, $scheduleGrid, $mappingTitle, $grid, $feedback, $addDevicePopup);
    $mount.append($shell);

    var devices = [];
    var schedules = [];
    var pinDefinitions = [];
    var selectedDeviceId = '';
    var grdSchedule = null;
    var gridInstance = null;
    var selectInstance = null;
    var addPopupInstance = null;
    var addFormInstance = null;
    var mappingStore = null;
    var masterScheduleStore = null;
    var isSyncingDeviceSelect = false;
    var devicesLoadPromise = null;
    var schedulesLoadPromise = null;
    var pinDefinitionsLoadPromise = null;
    var devicesLoaded = false;
    var schedulesLoaded = false;
    var pinDefinitionsLoaded = false;
    var mappingCacheByDevice = Object.create(null);
    var mappingLoadPromises = Object.create(null);

    function getErrorMessage(err, fallback) {
      if (typeof apiClient.getErrorMessage === 'function') {
        return apiClient.getErrorMessage(err);
      }
      return fallback || 'Request failed';
    }

    function setFeedback(message, type) {
      $feedback.removeClass('success error').addClass(type || '').text(message || '');
    }

    function showToast(message, type) {
      if (window.DevExpress && window.DevExpress.ui && typeof window.DevExpress.ui.notify === 'function') {
        window.DevExpress.ui.notify(
          { message: String(message || ''), type: type || 'success', displayTime: 2000 },
          type || 'success',
          2000
        );
      }
    }

    function nowMs() {
      if (window.performance && typeof window.performance.now === 'function') {
        return window.performance.now();
      }
      return Date.now();
    }

    async function timedApiCall(method, path, callFn) {
      var startedAt = nowMs();
      try {
        var result = await callFn();
        var duration = (nowMs() - startedAt).toFixed(1);
        console.info('[DevicesSchedule][API]', method, path, duration + 'ms');
        return result;
      } catch (err) {
        var failDuration = (nowMs() - startedAt).toFixed(1);
        console.warn('[DevicesSchedule][API]', method, path, failDuration + 'ms', getErrorMessage(err, 'Request failed'));
        throw err;
      }
    }

    function apiGet(path, options) {
      return timedApiCall('GET', String(path || ''), function () {
        return apiClient.get(path, options);
      });
    }

    function apiPost(path, payload, options) {
      return timedApiCall('POST', String(path || ''), function () {
        return apiClient.post(path, payload, options);
      });
    }

    function apiPatch(path, payload, options) {
      return timedApiCall('PATCH', String(path || ''), function () {
        return apiClient.patch(path, payload, options);
      });
    }

    function updateMappingFormItems() {
      if (!gridInstance) return;
      gridInstance.option('editing.form.items', createScheduleEditingFormItems());
    }

    function upsertScheduleCache(item) {
      var scheduleId = String(item && item.scheduleId ? item.scheduleId : '').trim();
      if (!scheduleId) return;

      var exists = false;
      schedules = schedules.map(function (schedule) {
        var safeId = String(schedule && schedule.scheduleId ? schedule.scheduleId : '').trim();
        if (safeId !== scheduleId) return schedule;
        exists = true;
        return item;
      });

      if (!exists) {
        schedules.push(item);
      }
    }

    function reloadGridDataSource(grid) {
      if (!grid) return Promise.resolve();
      var ds = typeof grid.getDataSource === 'function' ? grid.getDataSource() : null;
      if (ds && typeof ds.reload === 'function') {
        return ds.reload();
      }
      return Promise.resolve(grid.refresh());
    }

    function clearMappingCache() {
      mappingCacheByDevice = Object.create(null);
      mappingLoadPromises = Object.create(null);
    }

    function toGridRow(item) {
      var schedule = item && item.schedule ? item.schedule : null;
      var days = schedule && Array.isArray(schedule.daysOfWeek) ? schedule.daysOfWeek : [];
      return {
        scheduleId: String(item && item.scheduleId ? item.scheduleId : ''),
        pinNumber: Number(item && item.pinNumber !== undefined ? item.pinNumber : 0),
        duration: item && item.duration !== undefined ? item.duration : null,
        createdAt: item && item.createdAt ? item.createdAt : null,
        scheduleName: schedule && schedule.scheduleName ? schedule.scheduleName : String(item && item.scheduleId ? item.scheduleId : ''),
        scheduleAction: schedule && schedule.action !== undefined ? schedule.action : null,
        scheduleHour: schedule && schedule.hour !== undefined ? schedule.hour : null,
        scheduleMinute: schedule && schedule.minute !== undefined ? schedule.minute : null,
        scheduleDays: days,
        scheduleActive: schedule ? Boolean(schedule.isActive) : false
      };
    }

    function normalizePinDefinitions(rows) {
      return normalizeList(rows)
        .map(function (item) {
          var pinNumber = Number(item && item.confValue);
          if (!Number.isInteger(pinNumber)) return null;
          var confDescription = String(item && item.confDescription ? item.confDescription : '').trim();
          var confName = String(item && item.confName ? item.confName : '').trim();
          return {
            confCode: String(item && item.confCode ? item.confCode : '').trim(),
            confName: confName,
            confDescription: confDescription || confName || ('Pin ' + pinNumber),
            pinNumber: pinNumber
          };
        })
        .filter(function (item) { return item !== null; })
        .sort(function (a, b) { return a.pinNumber - b.pinNumber; });
    }

    function toPinDisplay(item) {
      return item && item.confDescription ? item.confDescription : '';
    }

    function pinTextByNumber(pinNumber) {
      var safePin = Number(pinNumber);
      var pinDef = pinDefinitions.find(function (item) {
        return Number(item.pinNumber) === safePin;
      });
      if (pinDef && pinDef.confDescription) return pinDef.confDescription;
      return String(pinNumber);
    }

    function toScheduleGridRow(item) {
      var days = Array.isArray(item && item.daysOfWeek) ? item.daysOfWeek : [];
      return {
        scheduleId: String(item && item.scheduleId ? item.scheduleId : ''),
        scheduleName: String(item && item.scheduleName ? item.scheduleName : ''),
        action: item && item.action !== undefined ? Number(item.action) : null,
        hour: item && item.hour !== undefined ? Number(item.hour) : null,
        minute: item && item.minute !== undefined ? Number(item.minute) : null,
        daysOfWeek: days,
        isActive: Boolean(item && item.isActive)
      };
    }

    function toNumberOrUndefined(value) {
      if (value === undefined || value === null || value === '') return undefined;
      var num = Number(value);
      if (!Number.isFinite(num)) return undefined;
      return num;
    }

    function normalizeDaysOfWeek(value) {
      if (!Array.isArray(value)) return undefined;
      var days = value
        .map(function (item) { return Number(item); })
        .filter(function (item) { return Number.isInteger(item) && item >= 0 && item <= 6; });
      return Array.from(new Set(days)).sort(function (a, b) { return a - b; });
    }

    function buildSchedulePayload(values) {
      var payload = {};

      if (values.scheduleName !== undefined) {
        payload.scheduleName = String(values.scheduleName || '').trim();
      }

      if (values.action !== undefined) {
        payload.action = Number(values.action);
      }

      var hour = toNumberOrUndefined(values.hour);
      if (hour !== undefined) {
        payload.hour = hour;
      }

      var minute = toNumberOrUndefined(values.minute);
      if (minute !== undefined) {
        payload.minute = minute;
      }

      if (values.daysOfWeek !== undefined) {
        var days = normalizeDaysOfWeek(values.daysOfWeek);
        payload.daysOfWeek = days || [];
      }

      if (values.isActive !== undefined) {
        payload.isActive = Boolean(values.isActive);
      }

      return payload;
    }

    function formatTime(hour, minute) {
      if (hour === null || minute === null || hour === undefined || minute === undefined) return '-';
      var hh = String(hour).padStart(2, '0');
      var mm = String(minute).padStart(2, '0');
      return hh + ':' + mm;
    }

    function formatDays(days) {
      if (!Array.isArray(days) || !days.length) return '-';
      return days.map(function (d) {
        var idx = Number(d);
        if (!Number.isInteger(idx) || idx < 0 || idx > 6) return String(d);
        return DAY_LABELS[idx];
      }).join(', ');
    }

    function formatAction(value) {
      var safeValue = Number(value);
      var action = ACTION_OPTIONS.find(function (item) {
        return Number(item.value) === safeValue;
      });
      return action ? action.text : String(value);
    }

    function findScheduleById(scheduleId) {
      var safeId = String(scheduleId || '').trim();
      if (!safeId) return null;
      return schedules.find(function (item) {
        return String(item && item.scheduleId ? item.scheduleId : '') === safeId;
      }) || null;
    }

    function isDurationRequiredBySchedule(scheduleId) {
      var schedule = findScheduleById(scheduleId);
      return Boolean(schedule && Number(schedule.action) === 1);
    }

    function hasValidDuration(value) {
      if (value === undefined || value === null || value === '') return false;
      var num = Number(value);
      return Number.isFinite(num) && num > 0;
    }

    function createScheduleEditingFormItems() {
      return [
        {
          dataField: 'scheduleId',
          editorType: 'dxSelectBox',
          label: { text: 'Schedule' },
          editorOptions: {
            dataSource: schedules,
            valueExpr: 'scheduleId',
            displayExpr: toScheduleDisplay,
            searchEnabled: true
          },
          validationRules: [{ type: 'required', message: 'Schedule is required' }]
        },
        {
          dataField: 'pinNumber',
          editorType: 'dxSelectBox',
          label: { text: 'Pin Number' },
          editorOptions: {
            dataSource: pinDefinitions,
            valueExpr: 'pinNumber',
            displayExpr: toPinDisplay,
            searchEnabled: true,
            placeholder: 'Select pin'
          },
          validationRules: [{ type: 'required', message: 'Pin Number is required' }]
        },
        {
          dataField: 'duration',
          editorType: 'dxNumberBox',
          label: { text: 'Duration (sec)' },
          editorOptions: { min: 1, showSpinButtons: true },
          validationRules: [{
            type: 'custom',
            reevaluate: true,
            validationCallback: function (e) {
              var rowData = e && e.data ? e.data : {};
              if (!isDurationRequiredBySchedule(rowData.scheduleId)) return true;
              return hasValidDuration(e.value);
            },
            message: 'Duration is required when schedule action is 1'
          }]
        }
      ];
    }

    function setSelectDataSource() {
      if (!selectInstance) return;
      selectInstance.option('dataSource', devices);

      if (!devices.length) {
        selectedDeviceId = '';
        isSyncingDeviceSelect = true;
        selectInstance.option('value', null);
        isSyncingDeviceSelect = false;
        return;
      }

      var exists = devices.some(function (d) {
        return String(d.deviceId) === String(selectedDeviceId);
      });

      if (!exists) {
        selectedDeviceId = String(devices[0].deviceId);
      }
      isSyncingDeviceSelect = true;
      selectInstance.option('value', selectedDeviceId);
      isSyncingDeviceSelect = false;
    }

    function resolveSelectedDeviceId() {
      if (!devices.length) {
        selectedDeviceId = '';
        return selectedDeviceId;
      }

      var exists = devices.some(function (d) {
        return String(d.deviceId) === String(selectedDeviceId);
      });

      if (!exists) {
        selectedDeviceId = String(devices[0].deviceId);
      }
      return selectedDeviceId;
    }

    async function loadDevices(options) {
      var opts = options || {};
      var force = Boolean(opts.force);
      if (!force && devicesLoaded) {
        resolveSelectedDeviceId();
        setSelectDataSource();
        return;
      }
      if (!force && devicesLoadPromise) return devicesLoadPromise;

      var request = (async function () {
        var rows = await apiGet('/devices');
        devices = normalizeList(rows);
        devicesLoaded = true;
        resolveSelectedDeviceId();
        setSelectDataSource();
      })();

      devicesLoadPromise = request;
      try {
        return await request;
      } finally {
        if (devicesLoadPromise === request) {
          devicesLoadPromise = null;
        }
      }
    }

    async function loadSchedules(options) {
      var opts = options || {};
      var force = Boolean(opts.force);
      if (!force && schedulesLoaded) return;
      if (!force && schedulesLoadPromise) return schedulesLoadPromise;

      var request = (async function () {
        var rows = await apiGet('/automation/schedules', {
          query: { includeInactive: 'true' }
        });
        schedules = normalizeList(rows);
        schedulesLoaded = true;
        updateMappingFormItems();
      })();

      schedulesLoadPromise = request;
      try {
        return await request;
      } finally {
        if (schedulesLoadPromise === request) {
          schedulesLoadPromise = null;
        }
      }
    }

    async function loadPinDefinitions(options) {
      var opts = options || {};
      var force = Boolean(opts.force);
      if (!force && pinDefinitionsLoaded) return;
      if (!force && pinDefinitionsLoadPromise) return pinDefinitionsLoadPromise;

      var request = (async function () {
        var rows = await apiGet('/configs/pin-def');
        pinDefinitions = normalizePinDefinitions(rows);
        pinDefinitionsLoaded = true;
        updateMappingFormItems();
      })();

      pinDefinitionsLoadPromise = request;
      try {
        return await request;
      } finally {
        if (pinDefinitionsLoadPromise === request) {
          pinDefinitionsLoadPromise = null;
        }
      }
    }

    async function loadDeviceMappings(deviceId, options) {
      var safeDeviceId = String(deviceId || '').trim();
      if (!safeDeviceId) return [];

      var opts = options || {};
      var force = Boolean(opts.force);
      if (!force && Object.prototype.hasOwnProperty.call(mappingCacheByDevice, safeDeviceId)) {
        return mappingCacheByDevice[safeDeviceId];
      }
      if (!force && mappingLoadPromises[safeDeviceId]) {
        return mappingLoadPromises[safeDeviceId];
      }

      var request = (async function () {
        var rows = await apiGet('/map/' + encodeURIComponent(safeDeviceId) + '/schedule');
        var mappedRows = normalizeList(rows).map(toGridRow);
        mappingCacheByDevice[safeDeviceId] = mappedRows;
        return mappedRows;
      })();

      mappingLoadPromises[safeDeviceId] = request;
      try {
        return await request;
      } finally {
        if (mappingLoadPromises[safeDeviceId] === request) {
          delete mappingLoadPromises[safeDeviceId];
        }
      }
    }

    async function preloadPageData(options) {
      var opts = options || {};
      var force = Boolean(opts.force);

      var devicesPromise = loadDevices({ force: force });
      var schedulesPromise = loadSchedules({ force: force });
      var pinDefinitionsPromise = loadPinDefinitions({ force: force });
      var mappingsPromise = devicesPromise.then(function () {
        var deviceId = resolveSelectedDeviceId();
        if (!deviceId) return [];
        return loadDeviceMappings(deviceId, { force: force });
      });

      await Promise.all([
        devicesPromise,
        schedulesPromise,
        pinDefinitionsPromise,
        mappingsPromise
      ]);
    }

    async function refreshScheduleGrid() {
      if (!grdSchedule) return;
      await reloadGridDataSource(grdSchedule);
    }

    function currentMasterScheduleStore() {
      return new window.DevExpress.data.CustomStore({
        key: 'scheduleId',
        load: async function () {
          await loadSchedules();
          return schedules.map(toScheduleGridRow);
        },
        insert: async function (values) {
          var payload = buildSchedulePayload(values);
          var created = await apiPost('/automation/schedules', payload);
          showToast('Schedule created', 'success');
          upsertScheduleCache(created);
          clearMappingCache();
          updateMappingFormItems();
          await refreshGrid();
          return toScheduleGridRow(created);
        },
        update: async function (key, values) {
          var payload = buildSchedulePayload(values);
          var updated = await apiPatch('/automation/schedules/' + encodeURIComponent(String(key)), payload);
          showToast('Schedule updated', 'success');
          upsertScheduleCache(updated);
          clearMappingCache();
          updateMappingFormItems();
          await refreshGrid();
          return toScheduleGridRow(updated);
        },
        remove: async function (key) {
          var updated = await apiPatch('/automation/schedules/' + encodeURIComponent(String(key)) + '/inactive', {});
          showToast('Schedule inactive', 'success');
          upsertScheduleCache(updated);
          clearMappingCache();
          updateMappingFormItems();
          await refreshGrid();
          return {};
        }
      });
    }

    function currentScheduleStore() {
      return new window.DevExpress.data.CustomStore({
        key: ['scheduleId', 'pinNumber'],
        load: async function () {
          if (!selectedDeviceId) return [];
          return loadDeviceMappings(selectedDeviceId);
        },
        insert: async function (values) {
          if (!selectedDeviceId) throw new Error('Please select device');
          var payload = {
            scheduleId: String(values.scheduleId || '').trim(),
            pinNumber: Number(values.pinNumber)
          };
          if (values.duration !== undefined && values.duration !== null && values.duration !== '') {
            payload.duration = Number(values.duration);
          }
          var created = await apiPost('/map/' + encodeURIComponent(selectedDeviceId) + '/schedule', payload);
          delete mappingCacheByDevice[String(selectedDeviceId)];
          showToast('Mapping created', 'success');
          return toGridRow(created);
        },
        update: async function (key, values) {
          if (!selectedDeviceId) throw new Error('Please select device');
          var payload = {
            scheduleId: String(key.scheduleId || ''),
            pinNumber: Number(key.pinNumber)
          };
          if (values.pinNumber !== undefined) {
            payload.newPinNumber = Number(values.pinNumber);
          }
          if (values.duration !== undefined && values.duration !== null && values.duration !== '') {
            payload.duration = Number(values.duration);
          }
          var updated = await apiPatch('/map/' + encodeURIComponent(selectedDeviceId) + '/schedule', payload);
          delete mappingCacheByDevice[String(selectedDeviceId)];
          showToast('Mapping updated', 'success');
          return toGridRow(updated);
        },
        remove: function () {
          throw new Error('Delete is not supported by API');
        }
      });
    }

    async function refreshGrid() {
      if (!gridInstance) return;
      setFeedback('', '');
      await reloadGridDataSource(gridInstance);
    }

    function createAddDevicePopup() {
      addPopupInstance = $addDevicePopup.dxPopup({
        title: 'Add Device',
        showTitle: true,
        width: 520,
        height: 'auto',
        visible: false,
        dragEnabled: false,
        hideOnOutsideClick: true,
        contentTemplate: function (contentElement) {
          var $form = $('<div/>').appendTo(contentElement);
          addFormInstance = $form.dxForm({
            labelMode: 'floating',
            showColonAfterLabel: false,
            formData: {
              deviceId: '',
              deviceName: '',
              description: '',
              deviceSecret: ''
            },
            items: [
              {
                dataField: 'deviceId',
                label: { text: 'Device ID' },
                validationRules: [{ type: 'required', message: 'Device ID is required' }]
              },
              {
                dataField: 'deviceName',
                label: { text: 'Device Name' },
                validationRules: [{ type: 'required', message: 'Device Name is required' }]
              },
              {
                dataField: 'description',
                label: { text: 'Description' }
              },
              {
                dataField: 'deviceSecret',
                label: { text: 'Device Secret (optional)' },
                editorType: 'dxTextBox',
                editorOptions: { mode: 'password' }
              }
            ]
          }).dxForm('instance');
        },
        toolbarItems: [
          {
            widget: 'dxButton',
            toolbar: 'bottom',
            location: 'after',
            options: {
              text: 'Cancel',
              onClick: function () {
                addPopupInstance.hide();
              }
            }
          },
          {
            widget: 'dxButton',
            toolbar: 'bottom',
            location: 'after',
            options: {
              text: 'Save',
              type: 'default',
              onClick: async function () {
                if (!addFormInstance) return;
                var validation = addFormInstance.validate();
                if (!validation || !validation.isValid) return;

                var data = addFormInstance.option('formData') || {};
                var payload = {
                  deviceId: String(data.deviceId || '').trim(),
                  deviceName: String(data.deviceName || '').trim(),
                  description: String(data.description || '').trim()
                };
                var safeSecret = String(data.deviceSecret || '').trim();
                if (safeSecret) payload.deviceSecret = safeSecret;

                try {
                  var created = await apiPost('/devices', payload);
                  showToast('Device created', 'success');
                  addPopupInstance.hide();
                  await loadDevices();

                  if (created && created.deviceId) {
                    selectedDeviceId = String(created.deviceId);
                    mappingCacheByDevice[selectedDeviceId] = [];
                    if (selectInstance) {
                      isSyncingDeviceSelect = true;
                      selectInstance.option('value', selectedDeviceId);
                      isSyncingDeviceSelect = false;
                    }
                  }
                  await refreshGrid();
                } catch (err) {
                  setFeedback(getErrorMessage(err, 'Create device failed'), 'error');
                }
              }
            }
          }
        ]
      }).dxPopup('instance');
    }

    function initUi() {
      mappingStore = currentScheduleStore();
      masterScheduleStore = currentMasterScheduleStore();

      selectInstance = $deviceSelect.dxSelectBox({
        dataSource: [],
        valueExpr: 'deviceId',
        displayExpr: toDeviceDisplay,
        placeholder: 'Select device',
        searchEnabled: true,
        onValueChanged: function (e) {
          if (isSyncingDeviceSelect) return;
          selectedDeviceId = e.value ? String(e.value) : '';
          refreshGrid().catch(function (err) {
            setFeedback(getErrorMessage(err, 'Refresh failed'), 'error');
          });
        }
      }).dxSelectBox('instance');
      setSelectDataSource();

      $addDeviceBtn.dxButton({
        text: 'Add Device',
        type: 'default',
        onClick: function () {
          if (!addPopupInstance) return;
          setFeedback('', '');
          addPopupInstance.show();
        }
      });

      $refreshBtn.dxButton({
        text: 'Refresh',
        onClick: async function () {
          setFeedback('', '');
          try {
            await preloadPageData({ force: true });
            await Promise.all([
              refreshScheduleGrid(),
              refreshGrid()
            ]);
          } catch (err) {
            setFeedback(getErrorMessage(err, 'Refresh failed'), 'error');
          }
        }
      });

      gridInstance = $grid.dxDataGrid({
        dataSource: mappingStore,
        showBorders: true,
        repaintChangesOnly: true,
        rowAlternationEnabled: true,
        noDataText: 'No schedule mapping for selected device',
        paging: { enabled: true, pageSize: 25 },
        editing: {
          mode: 'form',
          allowAdding: true,
          allowUpdating: true,
          allowDeleting: false,
          useIcons: true,
          form: {
            colCount: 1,
            items: createScheduleEditingFormItems()
          }
        },
        onEditingStart: function (e) {
          if (!e.component) return;
          e.component.option('editing.form.items[0].editorOptions.readOnly', true);
        },
        onInitNewRow: function (e) {
          if (!e.component) return;
          e.component.option('editing.form.items[0].editorOptions.readOnly', false);
          e.data.duration = null;
        },
        onDataErrorOccurred: function (e) {
          setFeedback(getErrorMessage(e.error, 'Operation failed'), 'error');
        },
        columns: [
          {
            dataField: 'scheduleName',
            caption: 'Schedule',
            allowEditing: false
          },
          {
            dataField: 'scheduleId',
            caption: 'Schedule ID',
            visible: false
          },
          {
            dataField: 'pinNumber',
            caption: 'Pin',
            dataType: 'number',
            lookup: {
              dataSource: function () { return pinDefinitions; },
              valueExpr: 'pinNumber',
              displayExpr: toPinDisplay
            },
            customizeText: function (cellInfo) {
              if (cellInfo && cellInfo.valueText) return cellInfo.valueText;
              return pinTextByNumber(cellInfo && cellInfo.value);
            }
          },
          {
            dataField: 'duration',
            caption: 'Duration (sec)',
            dataType: 'number'
          },
          {
            caption: 'Action',
            dataField: 'scheduleAction',
            allowEditing: false,
            lookup: {
              dataSource: ACTION_OPTIONS,
              valueExpr: 'value',
              displayExpr: 'text'
            },
            customizeText: function (cellInfo) {
              if (cellInfo && cellInfo.valueText) return cellInfo.valueText;
              return formatAction(cellInfo && cellInfo.value);
            }
          },
          {
            caption: 'Time',
            allowEditing: false,
            calculateCellValue: function (rowData) {
              return formatTime(rowData.scheduleHour, rowData.scheduleMinute);
            }
          },
          {
            caption: 'Days',
            allowEditing: false,
            calculateCellValue: function (rowData) {
              return formatDays(rowData.scheduleDays);
            }
          },
          {
            caption: 'Status',
            allowEditing: false,
            calculateCellValue: function (rowData) {
              return rowData.scheduleActive ? 'ACTIVE' : 'INACTIVE';
            }
          }
        ]
      }).dxDataGrid('instance');

      grdSchedule = $scheduleGrid.dxDataGrid({
        dataSource: masterScheduleStore,
        keyExpr: 'scheduleId',
        showBorders: true,
        repaintChangesOnly: true,
        rowAlternationEnabled: true,
        noDataText: 'No schedules',
        paging: { enabled: true, pageSize: 25 },
        editing: {
          mode: 'form',
          allowAdding: true,
          allowUpdating: true,
          allowDeleting: true,
          useIcons: true,
          form: {
            colCount: 1,
            items: [
              {
                dataField: 'scheduleName',
                editorType: 'dxTextBox',
                label: { text: 'Schedule Name' },
                validationRules: [{ type: 'required', message: 'Schedule Name is required' }]
              },
              {
                dataField: 'action',
                editorType: 'dxSelectBox',
                label: { text: 'Action' },
                editorOptions: {
                  dataSource: ACTION_OPTIONS,
                  valueExpr: 'value',
                  displayExpr: 'text'
                },
                validationRules: [{ type: 'required', message: 'Action is required' }]
              },
              {
                dataField: 'hour',
                editorType: 'dxNumberBox',
                label: { text: 'Hour' },
                editorOptions: { min: 0, max: 23, showSpinButtons: true },
                validationRules: [{ type: 'required', message: 'Hour is required' }]
              },
              {
                dataField: 'minute',
                editorType: 'dxNumberBox',
                label: { text: 'Minute' },
                editorOptions: { min: 0, max: 59, showSpinButtons: true },
                validationRules: [{ type: 'required', message: 'Minute is required' }]
              },
              {
                dataField: 'daysOfWeek',
                editorType: 'dxTagBox',
                label: { text: 'Days Of Week' },
                editorOptions: {
                  dataSource: DAY_LABELS.map(function (label, index) {
                    return { value: index, text: label };
                  }),
                  valueExpr: 'value',
                  displayExpr: 'text',
                  showSelectionControls: true
                },
                validationRules: [{
                  type: 'custom',
                  reevaluate: true,
                  validationCallback: function (e) {
                    return Array.isArray(e.value) && e.value.length > 0;
                  },
                  message: 'Select at least 1 day'
                }]
              },
              {
                dataField: 'isActive',
                editorType: 'dxSwitch',
                label: { text: 'Active' }
              }
            ]
          }
        },
        onInitNewRow: function (e) {
          e.data.isActive = true;
          e.data.daysOfWeek = [0, 1, 2, 3, 4, 5, 6];
          e.data.action = 0;
          e.data.hour = 0;
          e.data.minute = 0;
        },
        onDataErrorOccurred: function (e) {
          setFeedback(getErrorMessage(e.error, 'Schedule operation failed'), 'error');
        },
        columns: [
          {
            dataField: 'scheduleName',
            caption: 'Schedule'
          },
          {
            dataField: 'scheduleId',
            caption: 'Schedule ID',
            visible: false
          },
          {
            dataField: 'action',
            caption: 'Action',
            dataType: 'number',
            lookup: {
              dataSource: ACTION_OPTIONS,
              valueExpr: 'value',
              displayExpr: 'text'
            }
          },
          {
            dataField: 'hour',
            visible: false
          },
          {
            dataField: 'minute',
            visible: false
          },
          {
            dataField: 'daysOfWeek',
            visible: false
          },
          {
            dataField: 'isActive',
            visible: false
          },
          {
            caption: 'Time',
            calculateCellValue: function (rowData) {
              return formatTime(rowData.hour, rowData.minute);
            }
          },
          {
            caption: 'Days',
            calculateCellValue: function (rowData) {
              return formatDays(rowData.daysOfWeek);
            }
          },
          {
            caption: 'Status',
            calculateCellValue: function (rowData) {
              return rowData.isActive ? 'ACTIVE' : 'INACTIVE';
            }
          }
        ]
      }).dxDataGrid('instance');

      createAddDevicePopup();
    }

    async function init() {
      try {
        await preloadPageData();
        initUi();
      } catch (err) {
        setFeedback(getErrorMessage(err, 'Cannot initialize page'), 'error');
      }
    }

    init();
  }

  window.devicesSchedulePage = {
    render: renderDevicesSchedulePage
  };
})(window, window.jQuery);
