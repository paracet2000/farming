(function usersManagementPageModule(window, $) {
  'use strict';

  var ROLE_OPTIONS = ['user', 'head', 'approver', 'hr', 'finance', 'admin'];
  var STATUS_OPTIONS = ['ACTIVE', 'INACTIVE'];

  function normalizeList(value) {
    return Array.isArray(value) ? value : [];
  }

  function parseRoles(value) {
    if (!value) return [];
    if (Array.isArray(value)) {
      return value.map(function (item) { return String(item || '').toLowerCase(); }).filter(Boolean);
    }
    return [];
  }

  function isAdminFromRoles(roles) {
    var items = parseRoles(roles);
    return items.includes('admin') || items.includes('admins');
  }

  function toDateText(value) {
    if (!value) return '-';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '-';
    return d.toLocaleString();
  }

  function formatArray(value) {
    var items = normalizeList(value).map(function (item) { return String(item || '').trim(); }).filter(Boolean);
    return items.length ? items.join(', ') : '-';
  }

  function normalizeString(value) {
    if (value === undefined || value === null) return '';
    return String(value).trim();
  }

  function normalizeDepartment(value) {
    if (Array.isArray(value)) {
      return value.map(function (item) { return normalizeString(item); }).filter(Boolean);
    }
    if (typeof value === 'string') {
      return value
        .split(',')
        .map(function (item) { return normalizeString(item); })
        .filter(Boolean);
    }
    return [];
  }

  function mapUserRow(item) {
    return {
      userId: String(item && item.userId ? item.userId : ''),
      displayName: normalizeString(item && item.displayName),
      firstName: normalizeString(item && item.firstName),
      lastName: normalizeString(item && item.lastName),
      email: normalizeString(item && item.email),
      phone: normalizeString(item && item.phone),
      avatar: normalizeString(item && item.avatar),
      department: normalizeList(item && item.department),
      roles: normalizeList(item && item.roles).map(function (r) { return String(r).toLowerCase(); }),
      status: normalizeString(item && item.status).toUpperCase() || 'ACTIVE',
      createdAt: item && item.createdAt ? item.createdAt : null,
      updatedAt: item && item.updatedAt ? item.updatedAt : null,
      lastLogin: item && item.lastLogin ? item.lastLogin : null
    };
  }

  function renderUsersManagementPage(options) {
    var opts = options || {};
    var apiClient = window.clientLib || null;
    var mountSelector = opts.mountSelector || '.page-area';
    var onBack = typeof opts.onBack === 'function' ? opts.onBack : null;
    var $mount = $(mountSelector);

    if (!$mount.length) return;

    if (!apiClient || typeof apiClient.get !== 'function' || typeof apiClient.put !== 'function') {
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
    $('<div/>', { class: 'page-title', text: 'Users Management' }).appendTo($titleWrap);
    $('<div/>', { class: 'page-note', text: 'Manage user profile and permissions' }).appendTo($titleWrap);
    $header.append($titleWrap);

    if (onBack) {
      $('<button/>', {
        type: 'button',
        class: 'page-back-btn',
        text: 'Back to Menu'
      }).on('click', onBack).appendTo($header);
    }

    var $gridTitle = $('<div/>', { class: 'devices-grid-title', text: 'Users' });
    var $grid = $('<div/>', { class: 'schedule-grid' });
    var $feedback = $('<div/>', { class: 'register-feedback' });
    $shell.append($header, $gridTitle, $grid, $feedback);
    $mount.append($shell);

    var viewer = {
      userId: '',
      roles: [],
      isAdmin: false
    };
    var usersCache = [];
    var gridInstance = null;

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
          { message: String(message || ''), type: type || 'success', displayTime: 1800 },
          type || 'success',
          1800
        );
      }
    }

    async function loadViewer() {
      var me = await apiClient.get('/auth/me');
      viewer.userId = String(me && me.userId ? me.userId : '');
      viewer.roles = parseRoles(me && me.roles);
      viewer.isAdmin = isAdminFromRoles(viewer.roles);
    }

    function buildUserUpdatePayload(values) {
      var payload = {};

      if (values.displayName !== undefined) payload.displayName = normalizeString(values.displayName);
      if (values.firstName !== undefined) payload.firstName = normalizeString(values.firstName);
      if (values.lastName !== undefined) payload.lastName = normalizeString(values.lastName);
      if (values.phone !== undefined) payload.phone = normalizeString(values.phone);
      if (values.avatar !== undefined) payload.avatar = normalizeString(values.avatar);

      if (viewer.isAdmin) {
        if (values.department !== undefined) payload.department = normalizeDepartment(values.department);
        if (values.status !== undefined) payload.status = normalizeString(values.status).toUpperCase();
        if (values.roles !== undefined) {
          payload.roles = normalizeList(values.roles)
            .map(function (item) { return normalizeString(item).toLowerCase(); })
            .filter(Boolean);
        }
      }

      return payload;
    }

    function buildFormItems() {
      var items = [
        {
          dataField: 'displayName',
          editorType: 'dxTextBox',
          label: { text: 'Display Name' }
        },
        {
          dataField: 'firstName',
          editorType: 'dxTextBox',
          label: { text: 'First Name' }
        },
        {
          dataField: 'lastName',
          editorType: 'dxTextBox',
          label: { text: 'Last Name' }
        },
        {
          dataField: 'email',
          editorType: 'dxTextBox',
          label: { text: 'Email' },
          editorOptions: { readOnly: true }
        },
        {
          dataField: 'phone',
          editorType: 'dxTextBox',
          label: { text: 'Phone' }
        },
        {
          dataField: 'avatar',
          editorType: 'dxTextBox',
          label: { text: 'Avatar URL' }
        }
      ];

      if (viewer.isAdmin) {
        items.push({
          dataField: 'department',
          editorType: 'dxTagBox',
          label: { text: 'Department' },
          editorOptions: {
            acceptCustomValue: true,
            showSelectionControls: true,
            searchEnabled: true,
            applyValueMode: 'useButtons'
          }
        });
        items.push({
          dataField: 'roles',
          editorType: 'dxTagBox',
          label: { text: 'Roles' },
          editorOptions: {
            dataSource: ROLE_OPTIONS,
            showSelectionControls: true,
            searchEnabled: false
          }
        });
        items.push({
          dataField: 'status',
          editorType: 'dxSelectBox',
          label: { text: 'Status' },
          editorOptions: {
            dataSource: STATUS_OPTIONS
          }
        });
      }

      return items;
    }

    function buildColumns() {
      var columns = [
        {
          dataField: 'displayName',
          caption: 'Display Name'
        },
        {
          dataField: 'email',
          caption: 'Email',
          allowEditing: false
        },
        {
          dataField: 'firstName',
          caption: 'First Name'
        },
        {
          dataField: 'lastName',
          caption: 'Last Name'
        },
        {
          dataField: 'phone',
          caption: 'Phone'
        },
        {
          caption: 'Department',
          calculateCellValue: function (rowData) {
            return formatArray(rowData.department);
          }
        },
        {
          caption: 'Roles',
          allowEditing: false,
          calculateCellValue: function (rowData) {
            return formatArray(rowData.roles);
          }
        },
        {
          dataField: 'status',
          caption: 'Status',
          allowEditing: viewer.isAdmin
        },
        {
          caption: 'Last Login',
          allowEditing: false,
          calculateCellValue: function (rowData) {
            return toDateText(rowData.lastLogin);
          }
        }
      ];

      return columns;
    }

    function createUsersStore() {
      return new window.DevExpress.data.CustomStore({
        key: 'userId',
        load: async function () {
          var rows = await apiClient.get('/users');
          usersCache = normalizeList(rows).map(mapUserRow);
          return usersCache;
        },
        update: async function (key, values) {
          var targetId = String(key || '');
          var payload = buildUserUpdatePayload(values);
          var keys = Object.keys(payload);

          if (!keys.length) {
            var existing = usersCache.find(function (u) { return u.userId === targetId; });
            return existing || {};
          }

          var updated = await apiClient.put('/users/' + encodeURIComponent(targetId), payload);
          var row = mapUserRow(updated);
          usersCache = usersCache.map(function (item) {
            return item.userId === targetId ? row : item;
          });

          showToast('User updated', 'success');
          return row;
        }
      });
    }

    function refreshGrid() {
      if (!gridInstance) return;
      setFeedback('', '');
      gridInstance.refresh();
    }

    function initGrid() {
      gridInstance = $grid.dxDataGrid({
        dataSource: createUsersStore(),
        keyExpr: 'userId',
        showBorders: true,
        repaintChangesOnly: true,
        rowAlternationEnabled: true,
        noDataText: 'No users',
        paging: { enabled: true, pageSize: 15 },
        editing: {
          mode: 'form',
          allowAdding: false,
          allowUpdating: true,
          allowDeleting: false,
          useIcons: true,
          form: {
            colCount: 1,
            items: buildFormItems()
          }
        },
        onDataErrorOccurred: function (e) {
          setFeedback(getErrorMessage(e.error, 'User operation failed'), 'error');
        },
        onToolbarPreparing: function (e) {
          if (!Array.isArray(e.toolbarOptions.items)) {
            e.toolbarOptions.items = [];
          }
          e.toolbarOptions.items.push({
            location: 'after',
            widget: 'dxButton',
            options: {
              icon: 'refresh',
              text: 'Refresh',
              onClick: function () {
                refreshGrid();
              }
            }
          });
        },
        columns: buildColumns()
      }).dxDataGrid('instance');
    }

    async function init() {
      try {
        await loadViewer();
        if (!viewer.isAdmin) {
          setFeedback('Forbidden: admin role required', 'error');
          showToast('Admin only', 'error');
          if (onBack) {
            setTimeout(function () {
              onBack();
            }, 700);
          }
          return;
        }
        initGrid();
      } catch (err) {
        setFeedback(getErrorMessage(err, 'Cannot initialize users page'), 'error');
      }
    }

    init();
  }

  window.usersManagementPage = {
    render: renderUsersManagementPage
  };
})(window, window.jQuery);
