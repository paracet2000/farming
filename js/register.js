(function registerPageModule(window, $) {
  'use strict';

  function renderRegisterPage(options) {
    const opts = options || {};
    const apiClient = window.clientLib || null;
    const mountSelector = opts.mountSelector || '.page-area';
    const onBack = typeof opts.onBack === 'function' ? opts.onBack : null;
    const $mount = $(mountSelector);

    if (!$mount.length) return;

    if (!apiClient || typeof apiClient.post !== 'function') {
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

    const $shell = $('<div/>', { class: 'page-shell' });
    const $header = $('<div/>', { class: 'page-header' });
    const $titleWrap = $('<div/>');
    $('<div/>', { class: 'page-title', text: 'Register' }).appendTo($titleWrap);
    $('<div/>', { class: 'page-note', text: 'Create a new user account' }).appendTo($titleWrap);
    $header.append($titleWrap);

    if (onBack) {
      $('<button/>', {
        type: 'button',
        class: 'page-back-btn',
        text: 'Back to Menu'
      }).on('click', onBack).appendTo($header);
    }

    const $panel = $('<section/>', { class: 'register-panel' });
    const $form = $('<div/>', { id: 'register-form' });
    const $actions = $('<div/>', { class: 'register-actions' });
    const $submit = $('<button/>', {
      type: 'button',
      class: 'register-submit-btn',
      text: 'Create Account'
    });
    const $feedback = $('<div/>', { class: 'register-feedback' });

    $actions.append($submit);
    $panel.append($form, $actions, $feedback);
    $shell.append($header, $panel);
    $mount.append($shell);

    const formInstance = $form.dxForm({
      labelMode: 'floating',
      showColonAfterLabel: false,
      colCountByScreen: { xs: 1, sm: 1, md: 2, lg: 2 },
      formData: {
        firstName: '',
        lastName: '',
        displayName: '',
        email: '',
        password: ''
      },
      items: [
        {
          dataField: 'firstName',
          label: { text: 'First Name' },
          validationRules: [{ type: 'required', message: 'First name is required' }]
        },
        {
          dataField: 'lastName',
          label: { text: 'Last Name' },
          validationRules: [{ type: 'required', message: 'Last name is required' }]
        },
        {
          dataField: 'displayName',
          label: { text: 'Display Name' },
          editorOptions: { maxLength: 100 }
        },
        {
          dataField: 'email',
          label: { text: 'Email' },
          validationRules: [
            { type: 'required', message: 'Email is required' },
            { type: 'email', message: 'Invalid email format' }
          ]
        },
        {
          dataField: 'password',
          label: { text: 'Password' },
          editorType: 'dxTextBox',
          editorOptions: { mode: 'password' },
          validationRules: [
            { type: 'required', message: 'Password is required' },
            { type: 'stringLength', min: 6, message: 'Password must be at least 6 characters' }
          ]
        }
      ]
    }).dxForm('instance');

    function setFeedback(message, type) {
      $feedback.removeClass('success error').addClass(type || '').text(message || '');
    }

    function setLoading(loading) {
      $submit.prop('disabled', Boolean(loading));
      $submit.text(loading ? 'Submitting...' : 'Create Account');
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

    $submit.on('click', async function onSubmit() {
      setFeedback('', '');
      const result = formInstance.validate();
      if (!result || !result.isValid) return;

      const formData = formInstance.option('formData') || {};
      const payload = {
        firstName: String(formData.firstName || '').trim(),
        lastName: String(formData.lastName || '').trim(),
        displayName: String(formData.displayName || '').trim(),
        email: String(formData.email || '').trim(),
        password: String(formData.password || '')
      };

      setLoading(true);
      try {
        await apiClient.post('/auth/register', payload, { auth: false });

        showToast('Register success', 'success');
        if (onBack) {
          onBack();
          return;
        }
      } catch (err) {
        const message = typeof apiClient.getErrorMessage === 'function'
          ? apiClient.getErrorMessage(err)
          : 'Register failed';
        setFeedback(message, 'error');
      } finally {
        setLoading(false);
      }
    });
  }

  window.registerPage = {
    render: renderRegisterPage
  };
})(window, window.jQuery);
