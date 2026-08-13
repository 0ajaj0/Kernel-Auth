(function (global) {
  'use strict';

  const TOKEN_KEY = 'kernel_auth_token';
  const ROLE_KEY = 'kernel_auth_role';
  const PROFILE_KEY = 'kernel_user_profile';
  const LEGACY_TOKEN = 'kernel_admin_token';

  function getToken() {
    return sessionStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(LEGACY_TOKEN) || '';
  }

  function getRole() {
    return sessionStorage.getItem(ROLE_KEY) || '';
  }

  function authHeaders() {
    const token = getToken();
    const h = { 'Content-Type': 'application/json' };
    if (token) h.Authorization = 'Bearer ' + token;
    return h;
  }

  function saveSession(data) {
    if (data.token) {
      sessionStorage.setItem(TOKEN_KEY, data.token);
      sessionStorage.setItem(LEGACY_TOKEN, data.token);
    }
    if (data.role) sessionStorage.setItem(ROLE_KEY, data.role);
    if (data.profile) sessionStorage.setItem(PROFILE_KEY, JSON.stringify(data.profile));
  }

  function clearSession() {
    [TOKEN_KEY, ROLE_KEY, PROFILE_KEY, LEGACY_TOKEN, 'kernel_oauth_state', 'kernel_nav_mode', 'kernel_selected_app'].forEach((k) => {
      sessionStorage.removeItem(k);
    });
  }

  async function verifySession() {
    const token = getToken();
    if (!token) return null;
    try {
      const res = await fetch('/api/auth-session', { headers: { Authorization: 'Bearer ' + token } });
      if (!res.ok) return null;
      const data = await res.json();
      if (data.session?.role) sessionStorage.setItem(ROLE_KEY, data.session.role);
      return data;
    } catch {
      return null;
    }
  }

  function startOAuth(provider, role) {
    const state = 'kernel:' + (role === 'ADMIN' ? 'admin' : 'customer') + ':' + provider + ':' + crypto.randomUUID();
    sessionStorage.setItem('kernel_oauth_state', state);
    window.location.href = '/api/oauth-start?provider=' + encodeURIComponent(provider) + '&role=' + (role === 'ADMIN' ? 'admin' : 'customer') + '&state=' + encodeURIComponent(state);
  }

  async function guardRoute(requiredRole, forbiddenUrl) {
    const session = await verifySession();
    if (!session) {
      const callback = encodeURIComponent(location.pathname + location.search);
      location.href = '/login/?callbackUrl=' + callback;
      return false;
    }
    if (requiredRole && session.session.role !== requiredRole) {
      const fallback = session.session.role === 'CUSTOMER' ? '/unauthorized/' : '/admin/dashboard/';
      location.href = forbiddenUrl || fallback;
      return false;
    }
    return session;
  }

  global.KernelAuth = {
    TOKEN_KEY,
    ROLE_KEY,
    PROFILE_KEY,
    getToken,
    getRole,
    authHeaders,
    saveSession,
    clearSession,
    verifySession,
    startOAuth,
    guardRoute,
  };
})(window);
