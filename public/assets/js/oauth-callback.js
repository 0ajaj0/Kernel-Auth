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

  function showError(msg) {
    spinner.classList.add('hidden');
    title.textContent = 'Sign-in failed';
    subtitle.textContent = msg;
    status.textContent = 'Could not complete authentication';
    errorEl.textContent = msg;
    errorEl.classList.remove('hidden');
    backBtn.classList.remove('hidden');
    backBtn.onclick = () => {
      window.location.href = state && state.startsWith('dashboard-') ? '/dashboard/' : FOCUS_URL;
    };
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

  async function completeDashboardLogin() {
    title.textContent = 'Signing in to KERNEL Dashboard';
    subtitle.textContent = 'Verifying your Google account…';
    status.textContent = 'Exchanging authorization code';

    const expected = sessionStorage.getItem('kernel_oauth_state');
    if (!state || !expected || state !== expected) {
      showError('OAuth security check failed. Please try Google login again from the dashboard.');
      return;
    }
    sessionStorage.removeItem('kernel_oauth_state');

    try {
      const res = await fetch('/api/dashboard-oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ code, provider: 'google', state }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Dashboard login failed');

      sessionStorage.setItem('kernel_admin_token', data.token);
      sessionStorage.setItem('kernel_user_profile', JSON.stringify(data.profile));

      title.textContent = 'Welcome back!';
      subtitle.textContent = data.profile.display_name || data.profile.email;
      status.textContent = 'Redirecting to dashboard…';
      spinner.classList.add('hidden');
      setTimeout(() => {
        window.location.href = '/dashboard/';
      }, 600);
    } catch (err) {
      showError(err.message || 'Dashboard login failed');
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

  if (state && state.startsWith('dashboard-')) {
    completeDashboardLogin();
    return;
  }

  status.textContent = 'Redirecting to KERNEL Loader';
  redirectToLoader();
})();
