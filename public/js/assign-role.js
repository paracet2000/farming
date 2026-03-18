(function assignRolePageModule(window, $) {
  'use strict';

  var ROLE_OPTIONS = ['user', 'head', 'approver', 'hr', 'finance', 'admin'];

  function toUserDisplayName(user) {
    var displayName = String(user && user.displayName ? user.displayName : '').trim();
    var email = String(user && user.email ? user.email : '').trim();
    if (displayName && email) return displayName + ' (' + email + ')';
    return displayName || email || String(user && user.userId ? user.userId : '-');
  }

  function renderAssignRolePage(options) {
    var opts = options || {};
    var apiClient = window.clientLib || null;
    var mountSelector = opts.mountSelector || '.page-area';
    var onBack = typeof opts.onBack === 'function' ? opts.onBack : null;
    var onSuccess = typeof opts.onSuccess === 'function' ? opts.onSuccess : null;
    var $mount = $(mountSelector);

    if (!$mount.length) return;

    if (!apiClient || typeof apiClient.get !== 'function' || typeof apiClient.put !== 'function') {
      $mount.html('<div class="page-shell"><p>clientLib is not loaded.</p></div>');
      return;
    }

    if (opts.apiBase && typeof apiClient.setApiBase === 'function') {
      apiClient.setApiBase(opts.apiBase);
    }

    if (typeof $.fn.dxForm !== 'function') {
      $mount.html('<div class="page-shell"><p>DevExtreme is not loaded.</p></div>');
      return;
    }

    $mount.empty();

    var $shell = $('<div/>', { class: 'page-shell' });
    var $header = $('<div/>', { class: 'page-header' });
    var $titleWrap = $('<div/>');
    $('<div/>', { class: 'page-title', text: 'Assign Role' }).appendTo($titleWrap);
    $('<div/>', { class: 'page-note', text: 'Assign roles to a user (admin only)' }).appendTo($titleWrap);
    $header.append($titleWrap);

    if (onBack) {
      $('<button/>', {
        type: 'button',
        class: 'page-back-btn',
        text: 'Back to Menu'
      }).on('click', onBack).appendTo($header);
    }

    var $panel = $('<section/>', { class: 'register-panel' });
    var $form = $('<div/>', { id: 'assign-role-form' });
    var $actions = $('<div/>', { class: 'register-actions' });
    var $submit = $('<button/>', {
      type: 'button',
      class: 'register-submit-btn',
      text: 'Save Roles'
    });
    var $feedback = $('<div/>', { class: 'register-feedback' });

    $actions.append($submit);
    $panel.append($form, $actions, $feedback);
    $shell.append($header, $panel);
    $mount.append($shell);

    var users = [];
    var formInstance = null;

    function setFeedback(message, type) {
      $feedback.removeClass('success error').addClass(type || '').text(message || '');
    }

    function setLoading(loading) {
      $submit.prop('disabled', Boolean(loading));
      $submit.text(loading ? 'Saving...' : 'Save Roles');
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

    function findUserById(userId) {
      return users.find(function (u) {
        return String(u.userId) === String(userId);
      }) || null;
    }

    function applyUserRoles(userId) {
      if (!formInstance) return;
      var selectedUser = findUserById(userId);
      var roles = Array.isArray(selectedUser && selectedUser.roles) ? selectedUser.roles : [];
      formInstance.updateData('roles', roles);
    }

    function initForm() {
      formInstance = $form.dxForm({
        labelMode: 'floating',
        showColonAfterLabel: false,
        colCountByScreen: { xs: 1, sm: 1, md: 1, lg: 1 },
        formData: {
          userId: '',
          roles: []
        },
        items: [
          {
            dataField: 'userId',
            label: { text: 'User' },
            editorType: 'dxSelectBox',
            editorOptions: {
              dataSource: users,
              valueExpr: 'userId',
              displayExpr: toUserDisplayName,
              searchEnabled: true,
              placeholder: 'Select user',
              onValueChanged: function (e) {
                applyUserRoles(e.value);
              }
            },
            validationRules: [{ type: 'required', message: 'User is required' }]
          },
          {
            dataField: 'roles',
            label: { text: 'Roles' },
            editorType: 'dxTagBox',
            editorOptions: {
              dataSource: ROLE_OPTIONS,
              valueExpr: null,
              searchEnabled: false,
              showSelectionControls: true,
              placeholder: 'Select roles'
            },
            validationRules: [{
              type: 'custom',
              reevaluate: true,
              validationCallback: function (e) {
                return Array.isArray(e.value) && e.value.length > 0;
              },
              message: 'At least one role is required'
            }]
          }
        ]
      }).dxForm('instance');
    }

    async function loadUsers() {
      try {
        users = await apiClient.get('/users');
        if (!Array.isArray(users) || !users.length) {
          setFeedback('No users found', 'error');
          return;
        }

        initForm();
      } catch (err) {
        var message = typeof apiClient.getErrorMessage === 'function'
          ? apiClient.getErrorMessage(err)
          : 'Cannot load users';
        setFeedback(message, 'error');
      }
    }

    $submit.on('click', async function onSubmit() {
      setFeedback('', '');
      if (!formInstance) return;

      var validation = formInstance.validate();
      if (!validation || !validation.isValid) return;

      var data = formInstance.option('formData') || {};
      var userId = String(data.userId || '').trim();
      var roles = Array.isArray(data.roles) ? data.roles : [];
      var payload = {
        roles: roles.map(function (r) { return String(r).toLowerCase(); })
      };

      setLoading(true);
      try {
        var updated = await apiClient.put('/users/' + encodeURIComponent(userId), payload);
        var nextRoles = Array.isArray(updated && updated.roles) ? updated.roles : payload.roles;
        formInstance.updateData('roles', nextRoles);

        users = users.map(function (u) {
          if (String(u.userId) !== userId) return u;
          return Object.assign({}, u, { roles: nextRoles });
        });

        showToast('Roles updated', 'success');
        if (onSuccess) {
          onSuccess(updated);
          return;
        }
        if (onBack) {
          onBack();
          return;
        }
      } catch (err) {
        var message = typeof apiClient.getErrorMessage === 'function'
          ? apiClient.getErrorMessage(err)
          : 'Assign role failed';
        setFeedback(message, 'error');
      } finally {
        setLoading(false);
      }
    });

    loadUsers();
  }

  window.assignRolePage = {
    render: renderAssignRolePage
  };
})(window, window.jQuery);
