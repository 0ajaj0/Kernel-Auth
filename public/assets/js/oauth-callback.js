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
    backBtn.onclick = () => { window.location.href = FOCUS_URL; };
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

    // Give the loader a moment to show this success screen, then pass the code locally.
    setTimeout(() => {
      window.location.href = target.toString();
    }, 900);
  }

  if (error) {
    showError(errorDesc || error);
    return;
  }

  if (!code) {
    showError('No authorization code received from the provider.');
    return;
  }

  status.textContent = 'Redirecting to KERNEL Loader';
  redirectToLoader();
})();
