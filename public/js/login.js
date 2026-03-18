(function loginPageModule(window, $) {
  'use strict';

  function renderLoginPage(options) {
    const opts = options || {};
    const apiClient = window.clientLib || null;
    const mountSelector = opts.mountSelector || '.page-area';
    const onBack = typeof opts.onBack === 'function' ? opts.onBack : null;
    const onSuccess = typeof opts.onSuccess === 'function' ? opts.onSuccess : null;
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
    $('<div/>', { class: 'page-title', text: 'Login' }).appendTo($titleWrap);
    $('<div/>', { class: 'page-note', text: 'Sign in to your account' }).appendTo($titleWrap);
    $header.append($titleWrap);

    if (onBack) {
      $('<button/>', {
        type: 'button',
        class: 'page-back-btn',
        text: 'Back to Menu'
      }).on('click', onBack).appendTo($header);
    }

    const $panel = $('<section/>', { class: 'register-panel' });
    const $form = $('<div/>', { id: 'login-form' });
    const $actions = $('<div/>', { class: 'register-actions' });
    const $submit = $('<button/>', {
      type: 'button',
      class: 'register-submit-btn',
      text: 'Sign In'
    });
    const $feedback = $('<div/>', { class: 'register-feedback' });

    $actions.append($submit);
    $panel.append($form, $actions, $feedback);
    $shell.append($header, $panel);
    $mount.append($shell);

    const formInstance = $form.dxForm({
      labelMode: 'floating',
      showColonAfterLabel: false,
      colCountByScreen: { xs: 1, sm: 1, md: 1, lg: 1 },
      formData: {
        email: '',
        password: ''
      },
      items: [
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
          validationRules: [{ type: 'required', message: 'Password is required' }]
        }
      ]
    }).dxForm('instance');

    function setFeedback(message, type) {
      $feedback.removeClass('success error').addClass(type || '').text(message || '');
    }

    function setLoading(loading) {
      $submit.prop('disabled', Boolean(loading));
      $submit.text(loading ? 'Signing In...' : 'Sign In');
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
        email: String(formData.email || '').trim(),
        password: String(formData.password || '')
      };

      setLoading(true);
      try {
        const data = await apiClient.post('/auth/login', payload, { auth: false });
        const token = data && data.token ? String(data.token) : '';
        if (token && typeof apiClient.setToken === 'function') {
          apiClient.setToken(token);
        }

        showToast('Login success', 'success');

        if (onSuccess) {
          onSuccess(data);
          return;
        }
        if (onBack) onBack();
      } catch (err) {
        const message = typeof apiClient.getErrorMessage === 'function'
          ? apiClient.getErrorMessage(err)
          : 'Login failed';
        setFeedback(message, 'error');
      } finally {
        setLoading(false);
      }
    });
  }

  window.loginPage = {
    render: renderLoginPage
  };
})(window, window.jQuery);
