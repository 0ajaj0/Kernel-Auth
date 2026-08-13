(function () {
  const params = new URLSearchParams(window.location.search);
  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''));
  const code = params.get('code') || hashParams.get('code');
  const state = params.get('state') || hashParams.get('state');
  const error = params.get('error') || hashParams.get('error');
  const errorDesc = params.get('error_description') || hashParams.get('error_description');

  const LOADER_CALLBACK = 'http://127.0.0.1:42891/callback';
  const FOCUS_URL = 'http://127.0.0.1:42891/focus';

  const title = document.getElementById('title');
  const subtitle = document.getElementById('subtitle');
  const status = document.getElementById('status');
  const spinner = document.getElementById('spinner');
  const errorEl = document.getElementById('error');
  const backBtn = document.getElementById('backBtn');

  function showError(msg, backUrl) {
    spinner.classList.add('hidden');
    title.textContent = 'Sign-in failed';
    subtitle.textContent = msg;
    status.textContent = 'Could not complete authentication';
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    backBtn.classList.remove('hidden');
    backBtn.onclick = () => { window.location.href = backUrl || '/login/'; };
  }

  function redirectToLoader() {
    title.textContent = 'Signed in successfully';
    subtitle.textContent = 'You can return to KERNEL Loader now.';
    status.textContent = 'Connected';
    spinner.classList.add('hidden');
    backBtn.classList.remove('hidden');
    backBtn.textContent = 'Go back to KERNEL Loader';
    backBtn.onclick = () => { window.location.href = FOCUS_URL; };

    const target = new URL(LOADER_CALLBACK);
    if (code) target.searchParams.set('code', code);
    if (state) target.searchParams.set('state', state);

    setTimeout(() => {
      window.location.href = target.toString();
    }, 900);
  }

  function detectProvider(stateStr) {
    if (stateStr && stateStr.startsWith('kernel:')) {
      const parts = stateStr.split(':');
      return parts[2] || 'google';
    }
    return 'google';
  }

  async function completeWebLogin() {
    title.textContent = 'Completing Security Checks...';
    subtitle.textContent = 'Verifying Session';
    status.textContent = 'Exchanging authorization code';

    const expected = sessionStorage.getItem('kernel_oauth_state');
    const isLegacyDashboard = state && state.startsWith('dashboard-');
    const isKernelState = state && state.startsWith('kernel:');

    if (!state || (!isLegacyDashboard && !isKernelState)) {
      showError('Invalid OAuth state. Please try signing in again.');
      return;
    }

    if (expected && state !== expected && !isLegacyDashboard) {
      showError('OAuth security check failed. Please try again.');
      return;
    }
    sessionStorage.removeItem('kernel_oauth_state');

    const provider = detectProvider(state);

    try {
      const res = await fetch('/api/auth-oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, provider, state }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Login failed');

      sessionStorage.setItem('kernel_auth_token', data.token);
      sessionStorage.setItem('kernel_auth_role', data.role);
      sessionStorage.setItem('kernel_admin_token', data.token);
      if (data.profile) {
        sessionStorage.setItem('kernel_user_profile', JSON.stringify(data.profile));
      }

      title.textContent = 'Completing Security Checks...';
      subtitle.textContent = 'Verifying Session';
      status.textContent = 'Session verified — redirecting';
      spinner.classList.add('hidden');

      setTimeout(() => {
        window.location.href = '/verify/?redirect=' + encodeURIComponent(data.redirect || '/client/dashboard/');
      }, 1500);
    } catch (err) {
      showError(err.message || 'Login failed');
    }
  }

  if (error) {
    showError(errorDesc || error);
    return;
  }

  if (!code) {
    showError('No authorization code received from the provider.');
    return;
  }

  if (state && (state.startsWith('kernel:') || state.startsWith('dashboard-'))) {
    completeWebLogin();
    return;
  }

  status.textContent = 'Redirecting to KERNEL Loader';
  redirectToLoader();
})();
