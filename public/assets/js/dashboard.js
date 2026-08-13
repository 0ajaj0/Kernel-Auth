(function () {
  'use strict';

  const STORAGE_KEY = 'kernel_admin_token';
  const NAV = [
    { id: 'dashboard', icon: '◉', title: 'Dashboard', sub: 'Overview of your auth platform' },
    { id: 'applications', icon: '▣', title: 'Applications', sub: 'App credentials for your loader' },
    { id: 'users', icon: '👤', title: 'Users', sub: 'Manage registered users' },
    { id: 'licenses', icon: '🔑', title: 'Licenses', sub: 'Generate and manage license keys' },
    { id: 'social', icon: '🔗', title: 'Social Auth', sub: 'Google, Discord & GitHub OAuth' },
    { id: 'variables', icon: '⚙', title: 'Variables', sub: 'Remote config variables' },
    { id: 'sessions', icon: '⏱', title: 'Sessions', sub: 'Active loader sessions' },
    { id: 'logs', icon: '📋', title: 'Logs', sub: 'Activity and audit trail' },
    { id: 'settings', icon: '⚡', title: 'Settings', sub: 'API endpoints and configuration' },
  ];

  let token = sessionStorage.getItem(STORAGE_KEY) || '';
  let currentPage = 'dashboard';
  let config = null;
  let appInfo = null;
  let apps = [];
  let selectedAppId = sessionStorage.getItem('kernel_selected_app') || 'default';

  const $ = (sel) => document.querySelector(sel);
  const loginView = $('#loginView');
  const appView = $('#appView');
  const pageContent = $('#pageContent');
  const pageTitle = $('#pageTitle');
  const pageSub = $('#pageSub');
  const topbarActions = $('#topbarActions');
  const modalRoot = $('#modalRoot');
  const toastRoot = $('#toastRoot');

  function headers() {
    return {
      'Content-Type': 'application/json',
      'X-Kernel-Admin-Key': token,
    };
  }

  async function api(path, opts = {}) {
    const res = await fetch('/api/' + path, {
      ...opts,
      headers: { ...headers(), ...(opts.headers || {}) },
    });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && appView && !appView.classList.contains('hidden')) {
      logout();
      toast('Session expired. Please sign in again.', 'error');
    }
    return { ok: res.ok, status: res.status, data };
  }

  function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    toastRoot.appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function showModal(html, onClose) {
    modalRoot.innerHTML = `<div class="modal-bg" id="modalBg">${html}</div>`;
    const bg = $('#modalBg');
    bg.addEventListener('click', (e) => {
      if (e.target === bg) closeModal();
    });
    modalRoot.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    function closeModal() {
      modalRoot.innerHTML = '';
      if (onClose) onClose();
    }
    return closeModal;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  }

  function randomKey() {
    const p = () => Math.random().toString(36).slice(2, 6).toUpperCase();
    return `KERNEL-${p()}-${p()}-${p()}`;
  }

  function copyText(text) {
    navigator.clipboard.writeText(text).then(() => toast('Copied to clipboard'));
  }

  function selectedApp() {
    return apps.find((a) => a.id === selectedAppId) || apps[0] || null;
  }

  function setSelectedApp(id) {
    selectedAppId = id;
    sessionStorage.setItem('kernel_selected_app', id);
    renderNav();
    navigate(currentPage);
  }

  async function loadApps() {
    apps = [];
    const r1 = await api('applications');
    if (r1.ok && Array.isArray(r1.data.apps) && r1.data.apps.length) {
      apps = r1.data.apps;
    } else if (r1.ok && r1.data.app) {
      apps = [r1.data.app];
    } else {
      const r2 = await api('app-info');
      if (r2.ok && r2.data.app) {
        apps = [{ ...r2.data.app, id: r2.data.app.id || 'default' }];
      }
    }
    if (!apps.length) {
      apps = [{
        id: 'default',
        app_name: 'KERNEL Loader',
        owner_id: 'Loading failed — click Retry',
        version: '1.0',
        secret: '—',
        created_at: new Date().toISOString(),
      }];
    }
    if (!apps.find((a) => a.id === selectedAppId)) {
      selectedAppId = apps[0]?.id || 'default';
      sessionStorage.setItem('kernel_selected_app', selectedAppId);
    }
    return apps;
  }

  function renderAppSelector() {
    if (!apps.length) return '';
    return `
      <label style="font-size:12px;color:var(--muted);margin-right:8px">Active App</label>
      <select id="appSelector" style="padding:8px 10px;background:var(--card);border:1px solid var(--border);border-radius:8px;color:var(--text);font-size:13px">
        ${apps.map((a) => `<option value="${esc(a.id)}"${a.id === selectedAppId ? ' selected' : ''}>${esc(a.app_name)}</option>`).join('')}
      </select>`;
  }

  function bindAppSelector() {
    const sel = $('#appSelector');
    if (sel) sel.onchange = () => setSelectedApp(sel.value);
  }

  function showLoadError(message) {
    pageContent.innerHTML = `
      <div class="panel">
        <div class="panel-body" style="padding:24px">
          <p style="color:var(--danger);margin-bottom:12px">${esc(message)}</p>
          <button class="btn btn-primary btn-sm" id="retryPage">Retry</button>
        </div>
      </div>`;
    $('#retryPage').onclick = () => navigate(currentPage);
  }

  async function showApp() {
    loginView.classList.add('hidden');
    appView.classList.remove('hidden');
    try {
      await loadApps();
    } catch (err) {
      apps = [];
    }
    renderNav();
    navigate(currentPage);
  }

  function logout() {
    token = '';
    sessionStorage.removeItem(STORAGE_KEY);
    appView.classList.add('hidden');
    loginView.classList.remove('hidden');
  }

  async function login() {
    const pass = $('#loginPassword').value;
    const err = $('#loginError');
    err.classList.add('hidden');
    const { ok, data } = await api('admin-login', {
      method: 'POST',
      body: JSON.stringify({ password: pass }),
    });
    if (!ok) {
      err.textContent = data.error || 'Invalid password';
      err.classList.remove('hidden');
      return;
    }
    token = data.token;
    sessionStorage.setItem(STORAGE_KEY, token);
    await showApp();
  }

  function renderNav() {
    const nav = $('#nav');
    nav.innerHTML = NAV.map((n) =>
      `<button class="nav-item${n.id === currentPage ? ' active' : ''}" data-page="${n.id}">
        <span class="icon">${n.icon}</span>${n.title}
      </button>`
    ).join('');
    nav.querySelectorAll('.nav-item').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.dataset.page));
    });
  }

  function navigate(page) {
    currentPage = page;
    const meta = NAV.find((n) => n.id === page) || NAV[0];
    pageTitle.textContent = meta.title;
    pageSub.textContent = meta.sub;
    renderNav();
    const renderers = {
      dashboard: renderDashboard,
      applications: renderApplications,
      users: renderUsers,
      licenses: renderLicenses,
      social: renderSocial,
      variables: renderVariables,
      sessions: renderSessions,
      logs: renderLogs,
      settings: renderSettings,
    };
    (renderers[page] || renderDashboard)();
  }

  /* ── Dashboard ── */
  async function renderDashboard() {
    topbarActions.innerHTML = `<button class="btn btn-ghost btn-sm" id="refreshDash">Refresh</button>`;
    pageContent.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    const [{ data: statsD }, { data: logsD }] = await Promise.all([
      api('stats'),
      api('logs'),
    ]);
    const s = statsD.stats || {};
    const logs = (logsD.logs || []).slice(0, 8);
    pageContent.innerHTML = `
      <div class="stats">
        <div class="stat-card"><div class="label">Total Users</div><div class="value">${s.users ?? 0}</div></div>
        <div class="stat-card"><div class="label">License Keys</div><div class="value">${s.licenses ?? 0}</div></div>
        <div class="stat-card"><div class="label">Active Licenses</div><div class="value">${s.active_licenses ?? 0}</div></div>
        <div class="stat-card"><div class="label">Log Events</div><div class="value">${s.logs ?? 0}</div></div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Recent Activity</h3></div>
        <div class="panel-body">
          <table>
            <thead><tr><th>Type</th><th>Details</th><th>Time</th></tr></thead>
            <tbody>
              ${logs.length ? logs.map((l) => `
                <tr>
                  <td><span class="badge badge-accent">${esc(l.type)}</span></td>
                  <td>${esc(JSON.stringify({ ...l, type: undefined, id: undefined, at: undefined }).replace(/[{}"]/g, '').trim() || '—')}</td>
                  <td>${fmtDate(l.at)}</td>
                </tr>`).join('') : '<tr><td colspan="3" style="color:var(--muted)">No activity yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
    $('#refreshDash').onclick = () => renderDashboard();
  }

  /* ── Applications ── */
  async function renderApplications() {
    topbarActions.innerHTML = `<button class="btn btn-primary btn-sm" id="createAppBtn">+ Create Application</button>`;
    pageContent.innerHTML = '<p style="color:var(--muted)">Loading applications…</p>';
    let site = window.location.origin;
    try {
      if (!config) {
        const cfg = await api('config');
        if (cfg.ok) config = cfg.data;
      }
      site = config?.site_url || window.location.origin;
      await loadApps();
    } catch (err) {
      apps = [{
        id: 'default',
        app_name: 'KERNEL Loader',
        owner_id: 'Error',
        version: '1.0',
        secret: '—',
        created_at: new Date().toISOString(),
      }];
    }

    try {
      pageContent.innerHTML = `
        <div class="panel">
          <div class="panel-head">
            <h3>Applications (${apps.length})</h3>
            <span style="font-size:12px;color:var(--muted)">Unlimited apps — each project gets unique Owner ID + Secret</span>
          </div>
          <div class="panel-body">
            <table>
              <thead><tr><th>App Name</th><th>Owner ID</th><th>Version</th><th>Created</th><th></th></tr></thead>
              <tbody>
                ${apps.map((a) => `
                  <tr>
                    <td><strong>${esc(a.app_name)}</strong>${a.id === selectedAppId ? ' <span class="badge badge-accent">Active</span>' : ''}</td>
                    <td><code style="font-size:11px">${esc(a.owner_id.slice(0, 8))}…</code></td>
                    <td>${esc(a.version || '1.0')}</td>
                    <td>${fmtDate(a.created_at)}</td>
                    <td>
                      <button class="btn btn-ghost btn-sm" data-use-app="${esc(a.id)}">Use</button>
                      <button class="btn btn-ghost btn-sm" data-view-app="${esc(a.id)}">Credentials</button>
                      ${a.id !== 'default' ? `<button class="btn btn-danger btn-sm" data-del-app="${esc(a.id)}">Delete</button>` : ''}
                    </td>
                  </tr>`).join('')}
              </tbody>
            </table>
          </div>
        </div>
        <div class="panel" id="appDetailPanel">
          <div class="panel-head"><h3>Integration Guide</h3></div>
          <div class="panel-body" style="padding:20px;font-size:13px;color:var(--muted)">
            Select an app and click <strong>Credentials</strong> to copy Owner ID + Secret for your loader/project SDK.
            Users and license keys you create will belong to the currently active app.
          </div>
        </div>`;

      $('#createAppBtn').onclick = () => {
        showModal(`
          <div class="modal">
            <h2>Create Application</h2>
            <div class="field"><label>App Name</label><input id="mAppName" placeholder="My Cheat / My Loader" /></div>
            <div class="field"><label>Version</label><input id="mAppVersion" value="1.0" /></div>
            <div class="modal-actions">
              <button class="btn btn-ghost" data-close>Cancel</button>
              <button class="btn btn-primary" id="mCreateApp">Create</button>
            </div>
          </div>`);
        $('#mCreateApp').onclick = async () => {
          const { ok, data: d } = await api('applications', {
            method: 'POST',
            body: JSON.stringify({
              app_name: $('#mAppName').value,
              version: $('#mAppVersion').value,
            }),
          });
          if (!ok) return toast(d.error || 'Failed to create app', 'error');
          toast('Application created');
          modalRoot.innerHTML = '';
          setSelectedApp(d.app.id);
        };
      };

      pageContent.querySelectorAll('[data-use-app]').forEach((b) => {
        b.onclick = () => { setSelectedApp(b.dataset.useApp); toast('Active app updated'); };
      });

      pageContent.querySelectorAll('[data-view-app]').forEach((b) => {
        b.onclick = () => showAppCredentials(b.dataset.viewApp, site);
      });

      pageContent.querySelectorAll('[data-del-app]').forEach((b) => {
        b.onclick = async () => {
          if (!confirm('Delete this application?')) return;
          const { ok, data: d } = await api('applications?id=' + encodeURIComponent(b.dataset.delApp), { method: 'DELETE' });
          if (!ok) return toast(d.error || 'Delete failed', 'error');
          toast('Application deleted');
          if (selectedAppId === b.dataset.delApp) selectedAppId = 'default';
          renderApplications();
        };
      });
    } catch (err) {
      showLoadError(err.message || 'Failed to load applications');
    }
  }

  function showAppCredentials(appId, site) {
    const app = apps.find((a) => a.id === appId);
    if (!app) return;
    const snippet = `owner_id: ${app.owner_id}\napp_name: ${app.app_name}\nsecret: ${app.secret}\ninit_url: ${site}/api/v2-init\nlogin_url: ${site}/api/v2-login`;
    showModal(`
      <div class="modal" style="max-width:560px">
        <h2>${esc(app.app_name)}</h2>
        <div class="field"><label>Owner ID</label><div class="cred-box">${esc(app.owner_id)}<button class="btn btn-ghost btn-sm copy-btn" data-copy="${esc(app.owner_id)}">Copy</button></div></div>
        <div class="field"><label>App Secret</label><div class="cred-box">${esc(app.secret)}<button class="btn btn-ghost btn-sm copy-btn" data-copy="${esc(app.secret)}">Copy</button></div></div>
        <div class="field"><label>App ID</label><div class="cred-box">${esc(app.id)}</div></div>
        <div class="field"><label>Loader / SDK Config</label><div class="cred-box" style="white-space:pre-wrap">${esc(snippet)}<button class="btn btn-ghost btn-sm copy-btn" data-copy="${esc(snippet)}">Copy All</button></div></div>
        <div class="modal-actions"><button class="btn btn-primary" data-close>Done</button></div>
      </div>`);
    modalRoot.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.onclick = () => copyText(btn.dataset.copy);
    });
  }

  /* ── Users ── */
  async function renderUsers() {
    topbarActions.innerHTML = `${renderAppSelector()}<button class="btn btn-primary btn-sm" id="addUserBtn">+ Add User</button>`;
    pageContent.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    try {
      await loadApps();
      const app = selectedApp();
      const { ok, data } = await api('users?app_id=' + encodeURIComponent(selectedAppId));
      if (!ok) throw new Error(data.error || 'Failed to load users');
      const users = data.users || [];
      pageContent.innerHTML = `
        <div class="panel">
          <div class="panel-head"><h3>Users (${users.length}) — ${esc(app?.app_name || 'App')}</h3></div>
        <div class="panel-body">
          <table>
            <thead><tr><th>Username</th><th>Email</th><th>Provider</th><th>Subscription</th><th>Status</th><th>Created</th><th></th></tr></thead>
            <tbody>
              ${users.length ? users.map((u) => `
                <tr>
                  <td><strong>${esc(u.username)}</strong></td>
                  <td>${esc(u.email || '—')}</td>
                  <td>${u.provider ? `<span class="badge badge-accent">${esc(u.provider)}</span>` : '—'}</td>
                  <td>${esc(u.subscription || 'Standard')}</td>
                  <td>${u.banned ? '<span class="badge badge-danger">Banned</span>' : '<span class="badge badge-success">Active</span>'}</td>
                  <td>${fmtDate(u.created_at)}</td>
                  <td>
                    <button class="btn btn-ghost btn-sm" data-ban="${esc(u.id)}" data-state="${u.banned ? '0' : '1'}">${u.banned ? 'Unban' : 'Ban'}</button>
                    <button class="btn btn-danger btn-sm" data-del-user="${esc(u.id)}">Delete</button>
                  </td>
                </tr>`).join('') : '<tr><td colspan="7" style="color:var(--muted)">No users yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    $('#addUserBtn').onclick = () => {
      showModal(`
        <div class="modal">
          <h2>Add User</h2>
          <div class="field"><label>Username</label><input id="mUsername" placeholder="username" /></div>
          <div class="field"><label>Email</label><input id="mEmail" type="email" placeholder="user@email.com" /></div>
          <div class="field"><label>Password</label><input id="mPassword" type="password" placeholder="password" /></div>
          <div class="field"><label>Subscription</label><input id="mSub" value="Standard" /></div>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-close>Cancel</button>
            <button class="btn btn-primary" id="mSaveUser">Create User</button>
          </div>
        </div>`);
      $('#mSaveUser').onclick = async () => {
        const { ok, data: d } = await api('users', {
          method: 'POST',
          body: JSON.stringify({
            app_id: selectedAppId,
            username: $('#mUsername').value,
            email: $('#mEmail').value,
            password: $('#mPassword').value,
            subscription: $('#mSub').value,
          }),
        });
        if (!ok) return toast(d.error || 'Failed', 'error');
        toast('User created');
        modalRoot.innerHTML = '';
        renderUsers();
      };
    };

    pageContent.querySelectorAll('[data-ban]').forEach((b) => {
      b.onclick = async () => {
        const { ok } = await api('users', {
          method: 'PATCH',
          body: JSON.stringify({ app_id: selectedAppId, id: b.dataset.ban, banned: b.dataset.state === '1' }),
        });
        if (ok) { toast('User updated'); renderUsers(); }
      };
    });
    pageContent.querySelectorAll('[data-del-user]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('Delete this user?')) return;
        const { ok } = await api('users?id=' + encodeURIComponent(b.dataset.delUser) + '&app_id=' + encodeURIComponent(selectedAppId), { method: 'DELETE' });
        if (ok) { toast('User deleted'); renderUsers(); }
      };
    });
    bindAppSelector();
    } catch (err) {
      showLoadError(err.message || 'Failed to load users');
    }
  }

  /* ── Licenses ── */
  async function renderLicenses() {
    topbarActions.innerHTML = `${renderAppSelector()}<button class="btn btn-primary btn-sm" id="genKeyBtn">+ Generate Key</button>`;
    pageContent.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    try {
      await loadApps();
      const app = selectedApp();
      const { ok, data } = await api('admin-keys?app_id=' + encodeURIComponent(selectedAppId));
      if (!ok) throw new Error(data.error || 'Failed to load licenses');
      const keys = data.keys || [];
      pageContent.innerHTML = `
        <div class="panel">
          <div class="panel-head"><h3>License Keys (${keys.length}) — ${esc(app?.app_name || 'App')}</h3></div>
        <div class="panel-body">
          <table>
            <thead><tr><th>Key</th><th>Subscription</th><th>Activations</th><th>Bound Email</th><th>Status</th><th>Created</th><th></th></tr></thead>
            <tbody>
              ${keys.length ? keys.map((k) => `
                <tr>
                  <td><code>${esc(k.key)}</code> <button class="btn btn-ghost btn-sm" data-copy="${esc(k.key)}">Copy</button></td>
                  <td>${esc(k.subscription || '—')}</td>
                  <td>${k.activations || 0} / ${k.max_activations ?? 1}</td>
                  <td>${esc(k.bound_email || '—')}</td>
                  <td>${k.revoked ? '<span class="badge badge-danger">Revoked</span>' : '<span class="badge badge-success">Active</span>'}</td>
                  <td>${fmtDate(k.created_at)}</td>
                  <td>
                    <button class="btn btn-ghost btn-sm" data-revoke="${esc(k.key)}" data-state="${k.revoked ? '0' : '1'}">${k.revoked ? 'Restore' : 'Revoke'}</button>
                    <button class="btn btn-danger btn-sm" data-del-key="${esc(k.key)}">Delete</button>
                  </td>
                </tr>`).join('') : '<tr><td colspan="7" style="color:var(--muted)">No license keys yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    pageContent.querySelectorAll('[data-copy]').forEach((b) => {
      b.onclick = () => copyText(b.dataset.copy);
    });

    $('#genKeyBtn').onclick = () => {
      const suggested = randomKey();
      showModal(`
        <div class="modal">
          <h2>Generate License Key</h2>
          <div class="field"><label>License Key</label><input id="mKey" value="${suggested}" /></div>
          <div class="field"><label>Subscription Name</label><input id="mSubName" value="KERNEL Premium" /></div>
          <div class="field"><label>Max Activations</label><input id="mMaxAct" type="number" value="999999" min="1" /></div>
          <div class="field"><label>Expires At (optional)</label><input id="mExpires" type="datetime-local" /></div>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-close>Cancel</button>
            <button class="btn btn-primary" id="mGenSave">Generate</button>
          </div>
        </div>`);
      $('#mGenSave').onclick = async () => {
        const expires = $('#mExpires').value;
        const { ok, data: d } = await api('admin-keys', {
          method: 'POST',
          body: JSON.stringify({
            app_id: selectedAppId,
            license_key: $('#mKey').value,
            subscription: $('#mSubName').value,
            max_activations: Number($('#mMaxAct').value) || 999999,
            expires_at: expires ? new Date(expires).toISOString() : null,
          }),
        });
        if (!ok) return toast(d.error || 'Failed', 'error');
        toast('Key created: ' + d.license_key);
        modalRoot.innerHTML = '';
        renderLicenses();
      };
    };

    pageContent.querySelectorAll('[data-revoke]').forEach((b) => {
      b.onclick = async () => {
        const { ok } = await api('admin-keys', {
          method: 'PATCH',
          body: JSON.stringify({ app_id: selectedAppId, key: b.dataset.revoke, revoked: b.dataset.state === '1' }),
        });
        if (ok) { toast('License updated'); renderLicenses(); }
      };
    });
    pageContent.querySelectorAll('[data-del-key]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('Delete this license key permanently?')) return;
        const { ok } = await api('admin-keys?key=' + encodeURIComponent(b.dataset.delKey) + '&app_id=' + encodeURIComponent(selectedAppId), { method: 'DELETE' });
        if (ok) { toast('Key deleted'); renderLicenses(); }
      };
    });
    bindAppSelector();
    } catch (err) {
      showLoadError(err.message || 'Failed to load licenses');
    }
  }

  /* ── Social Auth ── */
  async function renderSocial() {
    topbarActions.innerHTML = '';
    pageContent.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    if (!config) {
      const { data } = await api('config');
      config = data;
    }
    const oauth = config.oauth || {};
    const callback = config.site_url + '/oauth/callback.html';
    const providers = [
      { id: 'google', name: 'Google', cls: 'google', letter: 'G' },
      { id: 'discord', name: 'Discord', cls: 'discord', letter: 'D' },
      { id: 'github', name: 'GitHub', cls: 'github', letter: 'GH' },
    ];

    pageContent.innerHTML = `
      <div class="panel">
        <div class="panel-head">
          <h3>OAuth Providers</h3>
          <span style="font-size:12px;color:var(--muted)">Configure client IDs in Netlify environment variables</span>
        </div>
        <div class="panel-body">
          ${providers.map((p) => {
            const o = oauth[p.id] || {};
            const enabled = o.enabled;
            return `
              <div class="oauth-card">
                <div class="oauth-icon ${p.cls}">${p.letter}</div>
                <div style="flex:1">
                  <strong>${p.name}</strong>
                  <div style="font-size:12px;color:var(--muted);margin-top:4px">
                    ${enabled ? '<span class="badge badge-success">Configured</span>' : '<span class="badge badge-warn">Not configured</span>'}
                  </div>
                </div>
                <button class="btn btn-ghost btn-sm" data-test-oauth="${p.id}" ${enabled ? '' : 'disabled'}>Test Flow</button>
              </div>`;
          }).join('')}
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Redirect URIs</h3></div>
        <div class="panel-body" style="padding:20px">
          <p style="font-size:13px;color:var(--muted);margin-bottom:16px">Add this redirect URI in Google Cloud, Discord Developer Portal, and GitHub OAuth App settings:</p>
          <div class="cred-box">${esc(callback)}<button class="btn btn-ghost btn-sm copy-btn" data-copy="${esc(callback)}">Copy</button></div>
          <div class="field" style="margin-top:16px"><label>Loader callback (local)</label><div class="cred-box">${esc(config.loader_callback)}</div></div>
          <p style="font-size:12px;color:var(--muted);margin-top:12px">OAuth flow: Loader opens start URL → Provider login → Netlify callback → redirects to loader at 127.0.0.1:42891</p>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>Netlify Environment Variables</h3></div>
        <div class="panel-body" style="padding:20px;font-size:13px">
          <table>
            <thead><tr><th>Variable</th><th>Required</th></tr></thead>
            <tbody>
              <tr><td><code>GOOGLE_CLIENT_ID</code> / <code>GOOGLE_CLIENT_SECRET</code></td><td>Google OAuth</td></tr>
              <tr><td><code>DISCORD_CLIENT_ID</code> / <code>DISCORD_CLIENT_SECRET</code></td><td>Discord OAuth</td></tr>
              <tr><td><code>GITHUB_CLIENT_ID</code> / <code>GITHUB_CLIENT_SECRET</code></td><td>GitHub OAuth</td></tr>
              <tr><td><code>KERNEL_ADMIN_PASSWORD</code></td><td>Dashboard login</td></tr>
              <tr><td><code>KERNEL_SITE_URL</code></td><td>Your Netlify site URL</td></tr>
            </tbody>
          </table>
        </div>
      </div>`;

    pageContent.querySelectorAll('[data-copy]').forEach((b) => {
      b.onclick = () => copyText(b.dataset.copy);
    });
    pageContent.querySelectorAll('[data-test-oauth]').forEach((b) => {
      b.onclick = () => {
        const state = 'test-' + Math.random().toString(36).slice(2);
        window.open('/api/oauth-start?provider=' + b.dataset.testOauth + '&state=' + state, '_blank');
      };
    });
  }

  /* ── Variables ── */
  async function renderVariables() {
    topbarActions.innerHTML = `<button class="btn btn-primary btn-sm" id="addVarBtn">+ Add Variable</button>`;
    pageContent.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    const { data } = await api('variables');
    const vars = data.variables || [];
    pageContent.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Variables (${vars.length})</h3></div>
        <div class="panel-body">
          <table>
            <thead><tr><th>Key</th><th>Value</th><th>Updated</th><th></th></tr></thead>
            <tbody>
              ${vars.length ? vars.map((v) => `
                <tr>
                  <td><code>${esc(v.key)}</code></td>
                  <td>${esc(v.value)}</td>
                  <td>${fmtDate(v.updated_at)}</td>
                  <td><button class="btn btn-danger btn-sm" data-del-var="${esc(v.key)}">Delete</button></td>
                </tr>`).join('') : '<tr><td colspan="4" style="color:var(--muted)">No variables yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    $('#addVarBtn').onclick = () => {
      showModal(`
        <div class="modal">
          <h2>Add Variable</h2>
          <div class="field"><label>Key</label><input id="mVarKey" placeholder="maintenance_mode" /></div>
          <div class="field"><label>Value</label><input id="mVarVal" placeholder="false" /></div>
          <div class="modal-actions">
            <button class="btn btn-ghost" data-close>Cancel</button>
            <button class="btn btn-primary" id="mVarSave">Save</button>
          </div>
        </div>`);
      $('#mVarSave').onclick = async () => {
        const { ok, data: d } = await api('variables', {
          method: 'POST',
          body: JSON.stringify({ key: $('#mVarKey').value, value: $('#mVarVal').value }),
        });
        if (!ok) return toast(d.error || 'Failed', 'error');
        toast('Variable saved');
        modalRoot.innerHTML = '';
        renderVariables();
      };
    };

    pageContent.querySelectorAll('[data-del-var]').forEach((b) => {
      b.onclick = async () => {
        if (!confirm('Delete variable?')) return;
        const { ok } = await api('variables?key=' + encodeURIComponent(b.dataset.delVar), { method: 'DELETE' });
        if (ok) { toast('Deleted'); renderVariables(); }
      };
    });
  }

  /* ── Sessions ── */
  async function renderSessions() {
    topbarActions.innerHTML = `<button class="btn btn-ghost btn-sm" id="refreshSessions">Refresh</button>`;
    pageContent.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    const { data } = await api('sessions');
    const sessions = data.sessions || [];
    pageContent.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Sessions (${sessions.length})</h3></div>
        <div class="panel-body">
          <table>
            <thead><tr><th>Session ID</th><th>IP</th><th>Created</th><th></th></tr></thead>
            <tbody>
              ${sessions.length ? sessions.map((s) => `
                <tr>
                  <td><code style="font-size:11px">${esc(s.id)}</code></td>
                  <td>${esc(s.ip || '—')}</td>
                  <td>${fmtDate(s.created_at)}</td>
                  <td><button class="btn btn-danger btn-sm" data-del-session="${esc(s.id)}">Revoke</button></td>
                </tr>`).join('') : '<tr><td colspan="4" style="color:var(--muted)">No active sessions</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;

    $('#refreshSessions').onclick = () => renderSessions();
    pageContent.querySelectorAll('[data-del-session]').forEach((b) => {
      b.onclick = async () => {
        const { ok } = await api('sessions?id=' + encodeURIComponent(b.dataset.delSession), { method: 'DELETE' });
        if (ok) { toast('Session revoked'); renderSessions(); }
      };
    });
  }

  /* ── Logs ── */
  async function renderLogs() {
    topbarActions.innerHTML = `<button class="btn btn-ghost btn-sm" id="refreshLogs">Refresh</button>`;
    pageContent.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    const { data } = await api('logs');
    const logs = data.logs || [];
    pageContent.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Activity Log (${logs.length})</h3></div>
        <div class="panel-body">
          <table>
            <thead><tr><th>Type</th><th>Details</th><th>Time</th></tr></thead>
            <tbody>
              ${logs.length ? logs.map((l) => {
                const details = { ...l };
                delete details.type; delete details.at; delete details.id;
                return `<tr>
                  <td><span class="badge badge-accent">${esc(l.type)}</span></td>
                  <td style="font-size:12px">${esc(Object.keys(details).length ? JSON.stringify(details) : '—')}</td>
                  <td>${fmtDate(l.at)}</td>
                </tr>`;
              }).join('') : '<tr><td colspan="3" style="color:var(--muted)">No logs yet</td></tr>'}
            </tbody>
          </table>
        </div>
      </div>`;
    $('#refreshLogs').onclick = () => renderLogs();
  }

  /* ── Settings ── */
  async function renderSettings() {
    topbarActions.innerHTML = '';
    pageContent.innerHTML = '<p style="color:var(--muted)">Loading…</p>';
    if (!config) {
      const { data } = await api('config');
      config = data;
    }
    const { data: healthD } = await api('health');
    pageContent.innerHTML = `
      <div class="panel">
        <div class="panel-head"><h3>Platform Status</h3></div>
        <div class="panel-body" style="padding:20px">
          <div class="grid-2">
            <div class="stat-card"><div class="label">Service</div><div class="value" style="font-size:18px">${healthD.ok ? '● Online' : '● Offline'}</div></div>
            <div class="stat-card"><div class="label">AuthlyX Bridge</div><div class="value" style="font-size:18px">${config.authlyx_configured ? 'Configured' : 'Not set'}</div></div>
          </div>
        </div>
      </div>
      <div class="panel">
        <div class="panel-head"><h3>All API Routes</h3></div>
        <div class="panel-body" style="padding:20px;font-size:13px">
          <table>
            <thead><tr><th>Endpoint</th><th>Method</th><th>Description</th></tr></thead>
            <tbody>
              <tr><td>/api/health</td><td>GET</td><td>Health check</td></tr>
              <tr><td>/api/config</td><td>GET</td><td>Public OAuth & site config</td></tr>
              <tr><td>/api/admin-login</td><td>POST</td><td>Dashboard authentication</td></tr>
              <tr><td>/api/admin-keys</td><td>GET/POST/PATCH/DELETE</td><td>License key management</td></tr>
              <tr><td>/api/users</td><td>GET/POST/PATCH/DELETE</td><td>User management</td></tr>
              <tr><td>/api/variables</td><td>GET/POST/DELETE</td><td>Remote variables</td></tr>
              <tr><td>/api/sessions</td><td>GET/DELETE</td><td>Session management</td></tr>
              <tr><td>/api/logs</td><td>GET</td><td>Activity logs</td></tr>
              <tr><td>/api/oauth-start</td><td>GET</td><td>Start OAuth flow</td></tr>
              <tr><td>/api/oauth-exchange</td><td>POST</td><td>Exchange OAuth code</td></tr>
              <tr><td>/api/license-activate</td><td>POST</td><td>Activate license key</td></tr>
              <tr><td>/api/license-verify</td><td>POST</td><td>Verify license key</td></tr>
              <tr><td>/api/v2-init</td><td>POST</td><td>AuthlyX-compatible init</td></tr>
              <tr><td>/api/v2-login</td><td>POST</td><td>AuthlyX-compatible login</td></tr>
            </tbody>
          </table>
        </div>
      </div>`;
  }

  /* ── Init ── */
  $('#loginBtn').addEventListener('click', login);
  $('#loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  $('#logoutBtn').addEventListener('click', logout);

  fetch('/api/config').then((r) => r.json()).then((d) => { config = d; }).catch(() => {});

  if (token) {
    api('stats').then(({ ok }) => { if (ok) showApp(); else logout(); });
  }
})();
