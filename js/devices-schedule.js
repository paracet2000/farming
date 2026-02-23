(function devicesSchedulePageModule(window, $) {
  'use strict';

  var DAY_LABELS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];

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
    var selectedDeviceId = '';
    var grdSchedule = null;
    var gridInstance = null;
    var selectInstance = null;
    var addPopupInstance = null;
    var addFormInstance = null;

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
          editorType: 'dxNumberBox',
          label: { text: 'Pin Number' },
          editorOptions: { min: 0, showSpinButtons: true },
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
        selectInstance.option('value', null);
        return;
      }

      var exists = devices.some(function (d) {
        return String(d.deviceId) === String(selectedDeviceId);
      });

      if (!exists) {
        selectedDeviceId = String(devices[0].deviceId);
      }
      selectInstance.option('value', selectedDeviceId);
    }

    async function loadDevices() {
      var rows = await apiClient.get('/devices');
      devices = normalizeList(rows);
      setSelectDataSource();
    }

    async function loadSchedules() {
      var rows = await apiClient.get('/automation/schedules', {
        query: { includeInactive: 'true' }
      });
      schedules = normalizeList(rows);

      if (gridInstance) {
        gridInstance.option('editing.form.items', createScheduleEditingFormItems());
      }
    }

    function refreshScheduleGrid() {
      if (!grdSchedule) return;
      grdSchedule.refresh();
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
          var created = await apiClient.post('/automation/schedules', payload);
          showToast('Schedule created', 'success');
          await loadSchedules();
          refreshGrid();
          return toScheduleGridRow(created);
        },
        update: async function (key, values) {
          var payload = buildSchedulePayload(values);
          var updated = await apiClient.patch('/automation/schedules/' + encodeURIComponent(String(key)), payload);
          showToast('Schedule updated', 'success');
          await loadSchedules();
          refreshGrid();
          return toScheduleGridRow(updated);
        },
        remove: async function (key) {
          await apiClient.patch('/automation/schedules/' + encodeURIComponent(String(key)) + '/inactive', {});
          showToast('Schedule inactive', 'success');
          await loadSchedules();
          refreshGrid();
          return {};
        }
      });
    }

    function currentScheduleStore() {
      return new window.DevExpress.data.CustomStore({
        key: ['scheduleId', 'pinNumber'],
        load: async function () {
          if (!selectedDeviceId) return [];
          var rows = await apiClient.get('/map/' + encodeURIComponent(selectedDeviceId) + '/schedule');
          return normalizeList(rows).map(toGridRow);
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
          var created = await apiClient.post('/map/' + encodeURIComponent(selectedDeviceId) + '/schedule', payload);
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
          var updated = await apiClient.patch('/map/' + encodeURIComponent(selectedDeviceId) + '/schedule', payload);
          showToast('Mapping updated', 'success');
          return toGridRow(updated);
        },
        remove: function () {
          throw new Error('Delete is not supported by API');
        }
      });
    }

    function refreshGrid() {
      if (!gridInstance) return;
      setFeedback('', '');
      gridInstance.option('dataSource', currentScheduleStore());
      gridInstance.refresh();
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
                  var created = await apiClient.post('/devices', payload);
                  showToast('Device created', 'success');
                  addPopupInstance.hide();
                  await loadDevices();

                  if (created && created.deviceId) {
                    selectedDeviceId = String(created.deviceId);
                    if (selectInstance) {
                      selectInstance.option('value', selectedDeviceId);
                    }
                  }
                  refreshGrid();
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
      selectInstance = $deviceSelect.dxSelectBox({
        dataSource: [],
        valueExpr: 'deviceId',
        displayExpr: toDeviceDisplay,
        placeholder: 'Select device',
        searchEnabled: true,
        onValueChanged: function (e) {
          selectedDeviceId = e.value ? String(e.value) : '';
          refreshGrid();
        }
      }).dxSelectBox('instance');

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
            await Promise.all([loadDevices(), loadSchedules()]);
            refreshScheduleGrid();
            refreshGrid();
          } catch (err) {
            setFeedback(getErrorMessage(err, 'Refresh failed'), 'error');
          }
        }
      });

      gridInstance = $grid.dxDataGrid({
        dataSource: currentScheduleStore(),
        showBorders: true,
        repaintChangesOnly: true,
        rowAlternationEnabled: true,
        noDataText: 'No schedule mapping for selected device',
        paging: { enabled: true, pageSize: 10 },
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
            dataType: 'number'
          },
          {
            dataField: 'duration',
            caption: 'Duration (sec)',
            dataType: 'number'
          },
          {
            caption: 'Action',
            dataField: 'scheduleAction',
            allowEditing: false
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
        dataSource: currentMasterScheduleStore(),
        keyExpr: 'scheduleId',
        showBorders: true,
        repaintChangesOnly: true,
        rowAlternationEnabled: true,
        noDataText: 'No schedules',
        paging: { enabled: true, pageSize: 10 },
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
                  dataSource: [
                    { value: 0, text: '0' },
                    { value: 1, text: '1' }
                  ],
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
              dataSource: [
                { value: 0, text: '0' },
                { value: 1, text: '1' }
              ],
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
      initUi();
      try {
        await Promise.all([loadDevices(), loadSchedules()]);
        refreshScheduleGrid();
        refreshGrid();
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
