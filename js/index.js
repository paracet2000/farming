$(document).ready(async function () {
  const apiClient = window.clientLib || null;
  if (!apiClient || typeof apiClient.get !== 'function') {
    console.error('clientLib is not loaded');
    return;
  }

  function enforceDxLicenseLayer() {
    function applyLayer() {
      const nodes = document.querySelectorAll('dx-license');
      nodes.forEach((node) => {
        if (!node || !node.style) return;
        node.style.setProperty('position', 'fixed', 'important');
        node.style.setProperty('z-index', '-1', 'important');
        node.style.setProperty('pointer-events', 'none', 'important');
      });
    }

    applyLayer();

    const observer = new MutationObserver(() => {
      applyLayer();
    });
    observer.observe(document.documentElement, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class']
    });

    setInterval(applyLayer, 500);
  }

  enforceDxLicenseLayer();

  function parseRoles(raw) {
    if (!raw) return [];
    if (Array.isArray(raw)) return raw.map((r) => String(r).toLowerCase());
    if (typeof raw === 'string') {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((r) => String(r).toLowerCase());
      } catch (_) {
        return [raw.toLowerCase()];
      }
    }
    return [];
  }

  function readUserRoles() {
    const fromRoles = parseRoles(window.__USER_ROLES);
    if (fromRoles.length) return fromRoles;

    const fromRole = parseRoles(window.__USER_ROLE);
    if (fromRole.length) return fromRole;

    const hasToken = typeof apiClient.getToken === 'function' && Boolean(apiClient.getToken());
    return hasToken ? ['user'] : ['guest'];
  }

  const userRoles = readUserRoles();
  const apiBase = apiClient.getApiBase();
  console.log(`Using API base URL: ${apiBase}`);
  const $body = $('body');
  const $menuCards = $('.menu-cards');
  const $pageArea = $('.page-area');
  const roleLevel = { guest: 0, user: 1, admin: 2 };
  const guestVisibleMenus = new Set(['register', 'login', 'logout']);

  function openPageArea() {
    $body.addClass('menu-page-active');
    $pageArea.addClass('is-active');
  }

  function closePageArea() {
    $body.removeClass('menu-page-active');
    $pageArea.removeClass('is-active');
    $pageArea.empty();
  }

  function logoutAndRefresh() {
    if (typeof apiClient.clearAuth === 'function') {
      apiClient.clearAuth();
    } else {
      localStorage.removeItem('token');
      localStorage.removeItem('role');
      localStorage.removeItem('roles');
    }
    window.location.reload();
  }

  function isAllowed(requiredRole) {
    const safeRole = String(requiredRole || 'user').toLowerCase();
    const currentLevel = Math.max(
      ...userRoles.map((role) => roleLevel[String(role).toLowerCase()] ?? -1),
      -1
    );
    const requiredLevel = roleLevel[safeRole] ?? Number.MAX_SAFE_INTEGER;
    return currentLevel >= requiredLevel;
  }

  function toMenuCard(menu) {
    const isGuestMode = userRoles.length === 1 && String(userRoles[0]).toLowerCase() === 'guest';
    const isLogoutMenu = String(menu.confName || '').trim().toLowerCase() === 'logout';
    const isLoginMenu = String(menu.confName || '').trim().toLowerCase() === 'login';
    const isRegisterMenu = String(menu.confName || '').trim().toLowerCase() === 'register';
    const requiredRole = String(menu.requiredRole || 'user').toLowerCase();
    const allowed = isAllowed(requiredRole);
    const icon = String(menu.icon || menu.confName || '?').charAt(0).toUpperCase();

    const $card = $('<article/>', { class: 'menu-card' });
    $('<div/>', { class: 'menu-card-icon', text: icon }).appendTo($card);
    $('<div/>', { class: 'menu-name', text: menu.confName || '-' }).appendTo($card);
    $('<div/>', {
      class: 'menu-description',
      text: menu.confDescription || ''
    }).appendTo($card);
    $('<div/>', {
      class: 'menu-authority',
      text: `Required role: ${requiredRole}`
    }).appendTo($card);

    const $button = $('<button/>', { class: 'menu-open-btn' });
    if (!allowed || (isGuestMode && isLogoutMenu)) {
      $button.prop('disabled', true).text('No Access');
    } else {
      $button.prop('disabled', false).text('Open');
      $button.on('click', function () {
        if (isLogoutMenu) {
          logoutAndRefresh();
          return;
        }

        if (isLoginMenu && window.loginPage && typeof window.loginPage.render === 'function') {
          openPageArea();
          window.loginPage.render({
            apiBase,
            mountSelector: '.page-area',
            onBack: closePageArea,
            onSuccess: function () {
              closePageArea();
              window.location.reload();
            }
          });
          return;
        }

        if (isRegisterMenu && window.registerPage && typeof window.registerPage.render === 'function') {
          openPageArea();
          window.registerPage.render({
            apiBase,
            mountSelector: '.page-area',
            onBack: closePageArea
          });
          return;
        }

        const path = String(menu.openPath || '#').trim();
        if (!path || path === '#') return;
        window.location.href = path;
      });
    }

    $button.appendTo($card);
    return $card;
  }

  try {
    const menusData = await apiClient.get('/configs/menu');
    console.log('Fetched menu config:', menusData);
    const menus = Array.isArray(menusData) ? menusData : [];
    const isGuestMode = userRoles.length === 1 && String(userRoles[0]).toLowerCase() === 'guest';
    const list = menus.filter((menu) => {
      if (!isGuestMode) return true;
      const menuName = String(menu.confName || '').trim().toLowerCase();
      return guestVisibleMenus.has(menuName);
    });
    $menuCards.empty();

    if (!list.length) {
      const $emptyCard = $('<article/>', { class: 'menu-card' })
        .append($('<div/>', { class: 'menu-card-icon', text: '!' }))
        .append($('<div/>', { class: 'menu-name', text: 'No Menu Config' }))
        .append($('<div/>', {
          class: 'menu-description',
          text: 'No menu found in ConfigDetail (typ_code = MENU)'
        }))
        .append($('<div/>', { class: 'menu-authority', text: 'Required role: user' }))
        .append($('<button/>', { class: 'menu-open-btn', disabled: true, text: 'No Access' }));
      $menuCards.append($emptyCard);
      return;
    }

    list.forEach((menu) => {
      $menuCards.append(toMenuCard(menu));
    });
  } catch (err) {
    const errMessage = typeof apiClient.getErrorMessage === 'function'
      ? apiClient.getErrorMessage(err)
      : 'Cannot load menu from API /configs/menu';
    $menuCards.empty();
    const $errorCard = $('<article/>', { class: 'menu-card' })
      .append($('<div/>', { class: 'menu-card-icon', text: '!' }))
      .append($('<div/>', { class: 'menu-name', text: 'Menu Load Failed' }))
      .append($('<div/>', {
        class: 'menu-description',
        text: errMessage
      }))
      .append($('<div/>', { class: 'menu-authority', text: 'Required role: user' }))
      .append($('<button/>', { class: 'menu-open-btn', disabled: true, text: 'Retry' }));
    $menuCards.append($errorCard);
  }
});
