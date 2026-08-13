(function () {
  'use strict';

  const STORAGE_KEY = 'kernel_admin_token';
  const PROFILE_KEY = 'kernel_user_profile';

  const NAV_APP = [
    { id: 'dashboard', icon: '◉', title: 'Overview' },
    { id: 'apps', icon: '▣', title: 'Apps' },
    { id: 'users', icon: '👤', title: 'Users' },
    { id: 'licenses', icon: '🔑', title: 'Licenses' },
    { id: 'device', icon: '💻', title: 'Device' },
    { id: 'subscriptions', icon: '★', title: 'Subscriptions' },
    { id: 'variables', icon: '⚙', title: 'Variables' },
    { id: 'chats', icon: '💬', title: 'Chats' },
    { id: 'sessions', icon: '⏱', title: 'Session' },
    { id: 'logs', icon: '📋', title: 'Logs' },
    { id: 'files', icon: '📁', title: 'Files' },
    { id: 'policies', icon: '🛡', title: 'Policies' },
    { id: 'social', icon: '🔗', title: 'Social Auth' },
    { id: 'settings', icon: '⚡', title: 'Settings' },
  ];

  const NAV_TEAM = [
    { id: 'apikey', icon: '🔐', title: 'Elite Key' },
    { id: 'bots', icon: '🤖', title: 'Bots' },
    { id: 'audit', icon: '📜', title: 'Audit Logs' },
    { id: 'staff', icon: '👥', title: 'Staff' },
    { id: 'resellers', icon: '🏪', title: 'Resellers' },
  ];

  const PAGE_META = {
    dashboard: { title: 'Overview', desc: 'Overview of your auth platform, metrics, and recent activity.' },
    apps: { title: 'Applications', desc: 'Manage your applications and SDK credentials.' },
    users: { title: 'Users', desc: 'Manage registered users for the selected application.' },
    licenses: { title: 'Licenses', desc: 'Generate and manage license keys for your customers.' },
    device: { title: 'Devices', desc: 'Track and manage HWID / system bindings.' },
    subscriptions: { title: 'Subscriptions', desc: 'Define subscription tiers and durations.' },
    variables: { title: 'Variables', desc: 'Remote configuration variables for your loader.' },
    chats: { title: 'Chats', desc: 'User chat messages and support threads.' },
    sessions: { title: 'Sessions', desc: 'Active authentication sessions.' },
    logs: { title: 'Logs', desc: 'Activity and audit trail for your platform.' },
    files: { title: 'Files', desc: 'Upload and manage files for your application.' },
    policies: { title: 'Policies', desc: 'IP, HWID, VPN and location access rules.' },
    social: { title: 'Social Auth', desc: 'Google, Discord and GitHub OAuth configuration.' },
    settings: { title: 'Settings', desc: 'Application settings, webhooks and version control.' },
    apikey: { title: 'Elite Key', desc: 'Team API keys for advanced integrations.' },
    bots: { title: 'Bots', desc: 'Discord and Telegram bot integrations.' },
    audit: { title: 'Audit Logs', desc: 'Team-level audit trail.' },
    staff: { title: 'Staff', desc: 'Manage staff members and permissions.' },
    resellers: { title: 'Resellers', desc: 'Reseller accounts and commission tracking.' },
  };

  let token = sessionStorage.getItem(STORAGE_KEY) || '';
  let userProfile = null;
  try { userProfile = JSON.parse(sessionStorage.getItem(PROFILE_KEY) || 'null'); } catch { userProfile = null; }
  let mode = sessionStorage.getItem('kernel_nav_mode') || 'app';
  let currentPage = 'dashboard';
  let config = null;
  let apps = [];
  let selectedAppId = sessionStorage.getItem('kernel_selected_app') || '';
  let viewMode = 'list';
  let navGen = 0;
  let appsLoadedAt = 0;
  let policiesDraft = null;
  let settingsDraft = null;
  const APPS_CACHE_MS = 60000;

  const SDK_LANGS = ['cpp', 'csharp', 'python', 'javascript', 'go', 'rust'];
  let sdkLang = 'cpp';

  function sdkSnippet(lang, app, site) {
    const o = app?.owner_id || 'OWNER_ID';
    const n = app?.app_name || 'AppName';
    const s = app?.secret || 'SECRET';
    const base = site || location.origin;
    const map = {
      cpp: `#include "KernelAuth.h"\nKernelAuth::KernelAuthClient auth("${o}", "${n}", "1.0", "${s}", "${base}/api");\nauth.Init();\nauth.LicenseLogin("KERNEL-XXXX");`,
      csharp: `var auth = new KernelAuthClient("${o}", "${n}", "1.0", "${s}", "${base}/api");\nawait auth.InitAsync();\nawait auth.LicenseLoginAsync("KERNEL-XXXX");`,
      python: `import requests\ns = requests.post("${base}/api/v1/auth/init", json={"owner_id":"${o}","app_name":"${n}"}).json()["session_id"]\nrequests.post("${base}/api/v1/auth/login", json={"session_id":s,"license_key":"KERNEL-XXXX"})`,
      javascript: `const r = await fetch("${base}/api/v1/auth/init",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({owner_id:"${o}",app_name:"${n}"})});\nconst {session_id}=await r.json();\nawait fetch("${base}/api/v1/auth/login",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({session_id,license_key:"KERNEL-XXXX"})});`,
      go: `http.Post("${base}/api/v1/auth/init", "application/json", body)\n// then POST ${base}/api/v1/auth/login with session_id + license_key`,
      rust: `client.post("${base}/api/v1/auth/init").json(&init).send().await?;\nclient.post("${base}/api/v1/auth/login").json(&login).send().await?;`,
    };
    return map[lang] || map.cpp;
  }

  function paginate(items, page, perPage) {
    const p = Math.max(1, page || 1);
    const size = perPage || 10;
    const start = (p - 1) * size;
    return { items: items.slice(start, start + size), page: p, pages: Math.max(1, Math.ceil(items.length / size)), total: items.length };
  }

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => [...(root || document).querySelectorAll(sel)];

  function headers() {
    return { 'Content-Type': 'application/json', 'X-Kernel-Admin-Key': token };
  }

  async function api(path, opts = {}) {
    const res = await fetch('/api/' + path, { ...opts, headers: { ...headers(), ...(opts.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    if (res.status === 401 && $('#appView') && !$('#appView').classList.contains('hidden')) {
      logout();
      toast('Session expired. Please sign in again.', 'error');
    }
    return { ok: res.ok, status: res.status, data };
  }

  function toast(msg, type = 'success') {
    const el = document.createElement('div');
    el.className = 'toast ' + type;
    el.textContent = msg;
    $('#toastRoot').appendChild(el);
    setTimeout(() => el.remove(), 3500);
  }

  function showModal(html) {
    $('#modalRoot').innerHTML = `<div class="modal-bg" id="modalBg">${html}</div>`;
    const bg = $('#modalBg');
    bg.addEventListener('click', (e) => { if (e.target === bg) closeModal(); });
    $$('[data-close]').forEach((b) => b.addEventListener('click', closeModal));
    function closeModal() { $('#modalRoot').innerHTML = ''; }
    return closeModal;
  }

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  }

  function fmtDate(iso) {
    if (!iso) return '—';
    try { return new Date(iso).toLocaleString(); } catch { return iso; }
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

  function appName() {
    return selectedApp()?.app_name || 'App';
  }

  function setSelectedApp(id) {
    selectedAppId = id;
    sessionStorage.setItem('kernel_selected_app', id);
    syncAppSelectors();
    policiesDraft = null;
    settingsDraft = null;
    if (currentPage === 'apps') paintAppsTable();
    else navigate(currentPage);
  }

  async function loadApps(force) {
    const now = Date.now();
    if (!force && apps.length && now - appsLoadedAt < APPS_CACHE_MS) {
      syncAppSelectors();
      return apps;
    }
    const r = await api('applications');
    if (r.ok && Array.isArray(r.data.apps)) apps = r.data.apps;
    else if (r.ok && r.data.app) apps = [r.data.app];
    else apps = [];
    appsLoadedAt = now;
    if (!apps.find((a) => a.id === selectedAppId)) {
      selectedAppId = apps[0]?.id || '';
      if (selectedAppId) sessionStorage.setItem('kernel_selected_app', selectedAppId);
      else sessionStorage.removeItem('kernel_selected_app');
    }
    syncAppSelectors();
    return apps;
  }

  function stale(gen) {
    return gen !== navGen;
  }

  function breadcrumb(page) {
    const meta = PAGE_META[page] || PAGE_META.dashboard;
    return `<div class="ax-breadcrumb">Home <span>›</span> ${esc(appName())} <span>›</span> ${esc(meta.title)}</div>`;
  }

  function pageHead(page, badges = '', actions = '') {
    const meta = PAGE_META[page] || PAGE_META.dashboard;
    return `${breadcrumb(page)}
      <div class="ax-page-head">
        <div><h1>${esc(meta.title)}</h1><p>${esc(meta.desc)}</p></div>
        <div style="display:flex;align-items:center;gap:12px;flex-shrink:0">
          ${badges ? `<div class="ax-stat-badges">${badges}</div>` : ''}
          ${actions}
        </div>
      </div>`;
  }

  function toolbar(extra = '') {
    return `<div class="ax-toolbar">
      <div class="ax-search"><span class="si">🔍</span><input type="search" id="pageSearch" placeholder="Search…" /></div>
      <div class="ax-view-toggle">
        <button type="button" class="${viewMode === 'list' ? 'active' : ''}" data-view="list">☰ List</button>
        <button type="button" class="${viewMode === 'grid' ? 'active' : ''}" data-view="grid">▦ Grid</button>
      </div>
      ${extra}
    </div>`;
  }

  function bindToolbar(onSearch) {
    const inp = $('#pageSearch');
    if (inp && onSearch) inp.oninput = () => onSearch(inp.value.toLowerCase());
    $$('[data-view]').forEach((b) => {
      b.onclick = () => { viewMode = b.dataset.view; navigate(currentPage); };
    });
  }

  function bindCopy() {
    $$('[data-copy]').forEach((b) => { b.onclick = () => copyText(b.dataset.copy); });
  }

  function updateUserUI() {
    const name = userProfile?.display_name || 'Admin';
    const initial = (name[0] || 'A').toUpperCase();
    ['userName', 'topUserName'].forEach((id) => { const el = $('#' + id); if (el) el.textContent = name; });
    ['userAvatar', 'topAvatar'].forEach((id) => {
      const el = $('#' + id);
      if (!el) return;
      if (userProfile?.avatar_url) {
        el.innerHTML = `<img src="${esc(userProfile.avatar_url)}" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover" />`;
      } else {
        el.textContent = initial;
      }
    });
  }

  function renderNav() {
    const nav = $('#nav');
    const items = mode === 'team' ? NAV_TEAM : NAV_APP;
    nav.innerHTML = items.map((n) =>
      `<button class="ax-nav-item${n.id === currentPage ? ' active' : ''}" data-page="${n.id}">
        <span class="icon">${n.icon}</span>${n.title}
      </button>`
    ).join('');
    $$('.ax-nav-item', nav).forEach((btn) => btn.addEventListener('click', () => navigate(btn.dataset.page)));
  }

  function syncAppSelectors() {
    const sel = $('#appSelectorTop');
    if (!sel) return;
    sel.innerHTML = apps.length
      ? apps.map((a) => `<option value="${esc(a.id)}"${a.id === selectedAppId ? ' selected' : ''}>${esc(a.app_name)}</option>`).join('')
      : '<option value="">No apps</option>';
    sel.onchange = () => setSelectedApp(sel.value);
  }

  async function navigate(page) {
    currentPage = page;
    renderNav();
    const gen = ++navGen;
    const content = $('#pageContent');
    if (content && !content.querySelector('.ax-page-head')) {
      content.innerHTML = '<div class="ax-skeleton" style="padding:20px;color:var(--ax-muted)">Loading page…</div>';
    }
    const renderers = {
      dashboard: renderDashboard,
      apps: renderApps,
      users: renderUsers,
      licenses: renderLicenses,
      device: renderDevices,
      subscriptions: renderSubscriptions,
      variables: renderVariables,
      chats: () => renderTeamPage('chats', 'Chats', gen),
      sessions: renderSessions,
      logs: renderLogs,
      files: () => renderTeamPage('files', 'Files', gen),
      policies: renderPolicies,
      social: renderSocial,
      settings: renderSettings,
      apikey: () => renderTeamPage('apikey', 'Elite Key', gen),
      bots: () => renderTeamPage('bots', 'Bots', gen),
      audit: () => renderTeamPage('audit', 'Audit Logs', gen),
      staff: () => renderTeamPage('staff', 'Staff', gen),
      resellers: () => renderTeamPage('resellers', 'Resellers', gen),
    };
    try {
      await (renderers[page] || renderDashboard)(gen);
    } catch (err) {
      if (!stale(gen)) showLoadError(err.message || 'Page failed to load');
    }
  }

  function showLoadError(msg) {
    $('#pageContent').innerHTML = `<div class="ax-panel"><div class="ax-empty"><p style="color:var(--ax-red)">${esc(msg)}</p><button class="btn btn-primary btn-sm" id="retryPage" style="margin-top:12px">Retry</button></div></div>`;
    $('#retryPage').onclick = () => navigate(currentPage);
  }

  /* ── Dashboard ── */
  async function renderDashboard(gen = navGen) {
    try {
      const [{ data: statsD }, { data: logsD }] = await Promise.all([api('stats'), api('logs')]);
      if (stale(gen)) return;
      const s = statsD.stats || {};
      const logs = (logsD.logs || []).slice(0, 12);
      const app = selectedApp();

      $('#pageContent').innerHTML = `
        ${pageHead('dashboard', `<span class="ax-badge blue">LIVE</span>`, `<button class="btn btn-ghost btn-sm" id="refreshDash">↻ Refresh</button>`)}
        <div class="ax-stats">
          <div class="ax-stat-card"><div class="label">Total Apps</div><div class="value">${s.apps ?? 0}</div></div>
          <div class="ax-stat-card"><div class="label">Licenses</div><div class="value">${s.licenses ?? 0}</div></div>
          <div class="ax-stat-card"><div class="label">Users</div><div class="value">${s.users ?? 0}</div></div>
          <div class="ax-stat-card"><div class="label">Devices</div><div class="value">${s.devices ?? 0}</div></div>
          <div class="ax-stat-card"><div class="label">Staff</div><div class="value">${s.staff ?? 0}</div></div>
          <div class="ax-stat-card"><div class="label">Resellers</div><div class="value">${s.resellers ?? 0}</div></div>
        </div>
        <div class="ax-dash-grid">
          <div class="ax-chart-placeholder">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">
              <strong>Call Usage</strong>
              <div class="ax-chart-tabs" id="chartTabs">
                <button class="active" data-range="today">Today</button>
                <button data-range="week">Week</button>
                <button data-range="month">Month</button>
                <button data-range="all">All Time</button>
              </div>
            </div>
            <canvas id="usageChart" height="200"></canvas>
          </div>
          <div class="ax-panel">
            <div style="padding:16px;border-bottom:1px solid var(--ax-border);display:flex;justify-content:space-between">
              <strong>Recent Activity</strong><span class="ax-badge green">LIVE</span>
            </div>
            <div class="ax-panel-body" style="max-height:320px;overflow-y:auto">
              ${logs.length ? logs.map((l) => `
                <div style="padding:12px 16px;border-bottom:1px solid var(--ax-border);font-size:12px">
                  <span class="ax-badge blue">${esc(l.type)}</span>
                  <span style="color:var(--ax-muted);margin-left:8px">${fmtDate(l.at)}</span>
                </div>`).join('') : '<div class="ax-empty">No activity yet</div>'}
            </div>
          </div>
        </div>
        ${app ? `<div class="ax-panel" style="margin-top:16px;padding:16px"><strong>Owner ID</strong><div class="cred-box" style="margin-top:8px">${esc(app.owner_id)}<button class="btn btn-ghost btn-sm" data-copy="${esc(app.owner_id)}" style="margin-top:8px">Copy</button></div></div>` : ''}`;

      bindCopy();
      drawChart(logs);
      $('#refreshDash').onclick = () => renderDashboard(navGen);
      $$('#chartTabs button').forEach((b) => b.onclick = () => {
        $$('#chartTabs button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        drawChart(logs, b.dataset.range);
      });
    } catch (err) {
      showLoadError(err.message || 'Failed to load dashboard');
    }
  }

  function drawChart(logs, range = 'today') {
    const canvas = $('#usageChart');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const w = canvas.parentElement.clientWidth - 40;
    canvas.width = w;
    canvas.height = 200;
    ctx.clearRect(0, 0, w, 200);

    const buckets = range === 'today' ? 24 : range === 'week' ? 7 : range === 'month' ? 30 : 12;
    const data = Array.from({ length: buckets }, () => Math.floor(Math.random() * 5) + (logs.length > 0 ? 1 : 0));
    logs.forEach((_, i) => { if (i < buckets) data[i % buckets]++; });

    const max = Math.max(...data, 1);
    const barW = (w - 40) / buckets;
    data.forEach((v, i) => {
      const h = (v / max) * 140;
      const x = 20 + i * barW;
      const y = 170 - h;
      const grad = ctx.createLinearGradient(0, y, 0, 170);
      grad.addColorStop(0, '#3b82f6');
      grad.addColorStop(1, 'rgba(59,130,246,0.2)');
      ctx.fillStyle = grad;
      ctx.fillRect(x + 2, y, barW - 4, h);
    });
  }

  function appsTableRows() {
    return apps.length ? apps.map((a) => `
      <tr data-search="${esc((a.app_name + a.id).toLowerCase())}" data-app-id="${esc(a.id)}">
        <td><strong>${esc(a.app_name)}</strong>${a.id === selectedAppId ? ' <span class="ax-badge blue">Active</span>' : ''}</td>
        <td><code style="font-size:11px">${esc(String(a.owner_id).slice(0, 12))}…</code></td>
        <td>${esc(a.version || '1.0')}</td>
        <td>${fmtDate(a.created_at)}</td>
        <td>
          <button class="btn btn-ghost btn-sm" data-use-app="${esc(a.id)}">Use</button>
          <button class="btn btn-ghost btn-sm" data-view-app="${esc(a.id)}">Credentials</button>
          <button class="btn btn-danger-ghost btn-sm" data-del-app="${esc(a.id)}">Delete</button>
        </td>
      </tr>`).join('') : '<tr><td colspan="5"><div class="ax-empty">No applications yet</div></td></tr>';
  }

  function bindAppsTableEvents(site) {
    $$('[data-use-app]').forEach((b) => b.onclick = () => { setSelectedApp(b.dataset.useApp); toast('Active app updated'); });
    $$('[data-view-app]').forEach((b) => b.onclick = () => showAppCredentials(b.dataset.viewApp, site));
    $$('[data-del-app]').forEach((b) => b.onclick = async () => {
      const id = b.dataset.delApp;
      if (!confirm('Delete this application permanently?')) return;
      b.disabled = true;
      const { ok, data: d } = await api('applications?id=' + encodeURIComponent(id), { method: 'DELETE' });
      if (!ok) { b.disabled = false; return toast(d.error || 'Delete failed', 'error'); }
      apps = apps.filter((a) => a.id !== id);
      appsLoadedAt = Date.now();
      if (selectedAppId === id) {
        selectedAppId = apps[0]?.id || '';
        if (selectedAppId) sessionStorage.setItem('kernel_selected_app', selectedAppId);
        else sessionStorage.removeItem('kernel_selected_app');
        syncAppSelectors();
      }
      toast('Application deleted');
      paintAppsTable();
    });
  }

  function paintAppsTable() {
    const site = config?.site_url || location.origin;
    const body = $('#appsBody');
    const badge = $('#appsCountBadge');
    if (body) {
      body.innerHTML = appsTableRows();
      bindAppsTableEvents(site);
    } else if (currentPage === 'apps') {
      renderApps(navGen);
    }
    if (badge) badge.textContent = apps.length + ' TOTAL';
  }

  /* ── Apps ── */
  async function renderApps(gen = navGen) {
    try {
      if (!config) { const c = await api('config'); if (c.ok) config = c.data; }
      await loadApps(true);
      if (stale(gen)) return;
      const site = config?.site_url || location.origin;

      $('#pageContent').innerHTML = `
        ${pageHead('apps', `<span class="ax-badge" id="appsCountBadge">${apps.length} TOTAL</span>`, `<button class="btn btn-primary" id="createAppBtn">+ New App</button>`)}
        ${toolbar(`<button class="btn btn-ghost btn-sm" id="exportApps">Export All</button>`)}
        <div class="ax-panel">
          <table class="ax-table">
            <thead><tr><th>App Name</th><th>Owner ID</th><th>Version</th><th>Created</th><th></th></tr></thead>
            <tbody id="appsBody">${appsTableRows()}</tbody>
          </table>
        </div>
        <div class="ax-panel" style="margin-top:16px;padding:20px" id="sdkPanel">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">
            <strong>SDK Integration</strong>
            <div class="ax-view-toggle" id="sdkLangTabs">
              ${SDK_LANGS.map((l) => `<button type="button" data-sdk-lang="${l}" class="${l === sdkLang ? 'active' : ''}">${l.toUpperCase()}</button>`).join('')}
            </div>
          </div>
          <pre class="code-block" id="sdkCodeBlock" style="margin:0;padding:16px;background:#0a0c10;border-radius:10px;overflow-x:auto;font-size:12px">${esc(sdkSnippet(sdkLang, selectedApp(), site))}</pre>
          <button class="btn btn-ghost btn-sm" id="copySdkBtn" style="margin-top:10px">Copy Snippet</button>
        </div>`;

      bindToolbar((q) => {
        $$('#appsBody tr[data-search]').forEach((tr) => {
          tr.style.display = !q || tr.dataset.search.includes(q) ? '' : 'none';
        });
      });

      $('#createAppBtn').onclick = () => {
        showModal(`<div class="modal"><h2>New Application</h2>
          <div class="field"><label>App Name</label><input id="mAppName" placeholder="My Loader" /></div>
          <div class="field"><label>Version</label><input id="mAppVersion" value="1.0" /></div>
          <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="mCreateApp">Create</button></div></div>`);
        $('#mCreateApp').onclick = async () => {
          const { ok, data: d } = await api('applications', { method: 'POST', body: JSON.stringify({ app_name: $('#mAppName').value, version: $('#mAppVersion').value }) });
          if (!ok) return toast(d.error || 'Failed', 'error');
          toast('Application created');
          $('#modalRoot').innerHTML = '';
          apps.push(d.app);
          appsLoadedAt = Date.now();
          setSelectedApp(d.app.id);
        };
      };

      bindAppsTableEvents(site);
      $('#exportApps').onclick = () => { copyText(JSON.stringify(apps, null, 2)); };
      $$('[data-sdk-lang]').forEach((b) => b.onclick = () => {
        sdkLang = b.dataset.sdkLang;
        $$('[data-sdk-lang]').forEach((x) => x.classList.toggle('active', x === b));
        $('#sdkCodeBlock').textContent = sdkSnippet(sdkLang, selectedApp(), site);
      });
      $('#copySdkBtn').onclick = () => copyText(sdkSnippet(sdkLang, selectedApp(), site));
    } catch (err) {
      if (!stale(gen)) showLoadError(err.message);
    }
  }

  function showAppCredentials(appId, site) {
    const app = apps.find((a) => a.id === appId);
    if (!app) return;
    const snippet = `owner_id: ${app.owner_id}\napp_name: ${app.app_name}\nsecret: ${app.secret}`;
    showModal(`<div class="modal" style="max-width:560px"><h2>${esc(app.app_name)}</h2>
      <div class="field"><label>Owner ID</label><div class="cred-box">${esc(app.owner_id)}<button class="btn btn-ghost btn-sm" data-copy="${esc(app.owner_id)}" style="margin-top:8px">Copy</button></div></div>
      <div class="field"><label>App Secret</label><div class="cred-box">${esc(app.secret)}<button class="btn btn-ghost btn-sm" data-copy="${esc(app.secret)}" style="margin-top:8px">Copy Secret Key</button></div></div>
      <div class="field"><label>App ID / Owner ID</label><div class="cred-box">${esc(app.owner_id)}<button class="btn btn-ghost btn-sm" data-copy="${esc(app.owner_id)}" style="margin-top:8px">Copy App ID</button></div></div>
      <div class="field"><label>Init URL</label><div class="cred-box">${esc(site)}/api/v2/init</div></div>
      <div class="field"><label>Login URL</label><div class="cred-box">${esc(site)}/api/v2/login</div></div>
      <div class="modal-actions"><button class="btn btn-primary" data-close>Done</button></div></div>`);
    bindCopy();
  }

  /* ── Users ── */
  async function renderUsers(gen = navGen) {
    try {
      if (!selectedAppId) await loadApps();
      else await loadApps(false);
      const { ok, data } = await api('users?app_id=' + encodeURIComponent(selectedAppId));
      if (stale(gen)) return;
      if (!ok) throw new Error(data.error || 'Failed to load users');
      let users = data.users || [];

      $('#pageContent').innerHTML = `
        ${pageHead('users', `<span class="ax-badge">${users.length} TOTAL</span><span class="ax-badge green">${users.filter(u => !u.banned).length} ACTIVE</span>`, `<button class="btn btn-primary" id="addUserBtn">+ New User</button>`)}
        ${toolbar(`<select id="userStatusFilter" style="padding:8px;background:var(--ax-panel);border:1px solid var(--ax-border);border-radius:8px;color:var(--ax-text)"><option value="">All Status</option><option value="active">Active</option><option value="expired">Expired</option><option value="banned">Banned</option></select><button class="btn btn-ghost btn-sm" id="exportUsers">Export All</button><button class="btn btn-ghost btn-sm" id="clearExpired">Clear Expired</button>`)}
        <div class="ax-panel"><table class="ax-table"><thead><tr><th>Username</th><th>Email</th><th>Subscription</th><th>Expires</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody id="usersBody">${users.map((u) => `
          <tr data-search="${esc((u.username + u.email).toLowerCase())}" data-id="${esc(u.id)}">
            <td><strong>${esc(u.username)}</strong></td>
            <td>${esc(u.email || '—')}</td>
            <td>${esc(u.subscription || 'Standard')}</td>
            <td>${u.expires_at ? fmtDate(u.expires_at) : (u.duration_days ? u.duration_days + 'd' : 'Lifetime')}</td>
            <td>${u.banned ? '<span class="ax-badge" style="color:var(--ax-red)">Banned</span>' : '<span class="ax-badge green">Active</span>'}</td>
            <td>${fmtDate(u.created_at)}</td>
            <td>
              <button class="btn btn-ghost btn-sm" data-ban="${esc(u.id)}" data-state="${u.banned ? '0' : '1'}">${u.banned ? 'Unban' : 'Ban'}</button>
              <button class="btn btn-danger-ghost btn-sm" data-del-user="${esc(u.id)}">Delete</button>
            </td>
          </tr>`).join('') || '<tr><td colspan="7"><div class="ax-empty">No users yet</div></td></tr>'}
        </tbody></table></div>`;

      bindToolbar((q) => $$('#usersBody tr[data-search]').forEach((tr) => { tr.style.display = !q || tr.dataset.search.includes(q) ? '' : 'none'; }));
      $('#userStatusFilter')?.addEventListener('change', (e) => {
        const v = e.target.value;
        $$('#usersBody tr[data-search]').forEach((tr) => {
          if (!v) { tr.style.display = ''; return; }
          const text = tr.textContent.toLowerCase();
          tr.style.display = (v === 'banned' && text.includes('banned')) || (v === 'active' && text.includes('active')) || (v === 'expired' && text.includes('expired')) ? '' : 'none';
        });
      });
      $('#addUserBtn').onclick = () => {
        showModal(`<div class="modal"><h2>New User</h2>
          <div class="field"><label>Username</label><input id="mUsername" /></div>
          <div class="field"><label>Email</label><input id="mEmail" type="email" /></div>
          <div class="field"><label>Password</label><input id="mPassword" type="password" /></div>
          <div class="field"><label>Subscription Tier</label><select id="mSub"><option>Standard</option><option>Premium</option><option>Enterprise</option></select></div>
          <div class="field"><label>HWID Limit</label><input id="mHwidLimit" type="number" value="1" min="1" /></div>
          <div class="field"><label>Expiry Date</label><input id="mExpiry" type="datetime-local" /></div>
          <div class="field"><label>Duration (days, if no expiry)</label><input id="mDuration" type="number" value="30" min="0" placeholder="0=lifetime" /></div>
          <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="mSaveUser">Create</button></div></div>`);
        $('#mSaveUser').onclick = async () => {
          const expiry = $('#mExpiry').value;
          const { ok, data: d } = await api('users', { method: 'POST', body: JSON.stringify({
            app_id: selectedAppId, username: $('#mUsername').value, email: $('#mEmail').value,
            password: $('#mPassword').value, subscription: $('#mSub').value,
            duration_days: expiry ? 0 : (Number($('#mDuration').value) || 0),
            expires_at: expiry ? new Date(expiry).toISOString() : null,
            hwid_limit: Number($('#mHwidLimit').value) || 1,
          }) });
          if (!ok) return toast(d.error || 'Failed', 'error');
          toast('User created'); $('#modalRoot').innerHTML = ''; renderUsers();
        };
      };
      $$('[data-ban]').forEach((b) => b.onclick = async () => {
        const { ok } = await api('users', { method: 'PATCH', body: JSON.stringify({ app_id: selectedAppId, id: b.dataset.ban, banned: b.dataset.state === '1' }) });
        if (ok) { toast('Updated'); renderUsers(); }
      });
      $$('[data-del-user]').forEach((b) => b.onclick = async () => {
        if (!confirm('Delete user?')) return;
        const { ok } = await api('users?id=' + encodeURIComponent(b.dataset.delUser) + '&app_id=' + encodeURIComponent(selectedAppId), { method: 'DELETE' });
        if (ok) { toast('Deleted'); renderUsers(); }
      });
      $('#exportUsers').onclick = () => copyText(JSON.stringify(users, null, 2));
      $('#clearExpired').onclick = async () => {
        const expired = users.filter((u) => u.expires_at && new Date(u.expires_at) < new Date());
        if (!expired.length) return toast('No expired users');
        if (!confirm(`Delete ${expired.length} expired users?`)) return;
        for (const u of expired) await api('users?id=' + encodeURIComponent(u.id) + '&app_id=' + encodeURIComponent(selectedAppId), { method: 'DELETE' });
        toast('Expired users cleared'); renderUsers();
      };
    } catch (err) { showLoadError(err.message); }
  }

  /* ── Licenses ── */
  async function renderLicenses() {
    try {
      await loadApps();
      const { ok, data } = await api('admin-keys?app_id=' + encodeURIComponent(selectedAppId));
      if (!ok) throw new Error(data.error || 'Failed');
      let keys = data.keys || [];

      $('#pageContent').innerHTML = `
        ${pageHead('licenses', `<span class="ax-badge">${keys.length} TOTAL</span><span class="ax-badge green">${keys.filter(k => !k.revoked).length} ACTIVE</span>`, `<button class="btn btn-primary" id="genKeyBtn">+ New License</button>`)}
        ${toolbar(`<button class="btn btn-ghost btn-sm" id="exportKeys">Export All</button><button class="btn btn-ghost btn-sm" id="clearExpiredKeys">Clear Expired</button>`)}
        <div class="ax-panel"><table class="ax-table"><thead><tr><th>Key</th><th>Subscription</th><th>Activations</th><th>Email</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody id="keysBody">${keys.map((k) => `
          <tr data-search="${esc(k.key.toLowerCase())}">
            <td><code class="license-key" data-key="${esc(k.key)}">${esc(k.key.slice(0, 8))}••••</code> <button class="btn btn-ghost btn-sm" data-toggle-mask="${esc(k.key)}">Show</button> <button class="btn btn-ghost btn-sm" data-copy="${esc(k.key)}">Copy</button></td>
            <td>${esc(k.subscription || '—')}</td>
            <td>${k.activations || 0} / ${k.max_activations ?? 1}</td>
            <td>${esc(k.bound_email || '—')}</td>
            <td>${k.revoked ? '<span class="ax-badge" style="color:var(--ax-red)">Revoked</span>' : '<span class="ax-badge green">Active</span>'}</td>
            <td>${fmtDate(k.created_at)}</td>
            <td>
              <button class="btn btn-ghost btn-sm" data-revoke="${esc(k.key)}" data-state="${k.revoked ? '0' : '1'}">${k.revoked ? 'Restore' : 'Revoke'}</button>
              <button class="btn btn-danger-ghost btn-sm" data-del-key="${esc(k.key)}">Delete</button>
            </td>
          </tr>`).join('') || '<tr><td colspan="7"><div class="ax-empty">No license keys yet</div></td></tr>'}
        </tbody></table></div>`;

      bindToolbar((q) => $$('#keysBody tr[data-search]').forEach((tr) => { tr.style.display = !q || tr.dataset.search.includes(q) ? '' : 'none'; }));
      bindCopy();
      $$('[data-toggle-mask]').forEach((b) => b.onclick = () => {
        const el = b.parentElement.querySelector('.license-key');
        if (!el) return;
        const full = b.dataset.toggleMask;
        const masked = full.slice(0, 8) + '••••';
        if (el.textContent.includes('••••')) { el.textContent = full; b.textContent = 'Hide'; }
        else { el.textContent = masked; b.textContent = 'Show'; }
      });
      $('#genKeyBtn').onclick = () => {
        const suggested = randomKey();
        showModal(`<div class="modal"><h2>New License</h2>
          <div class="field"><label>License Key</label><input id="mKey" value="${suggested}" /></div>
          <div class="field"><label>Subscription</label><input id="mSubName" value="KERNEL Premium" /></div>
          <div class="field"><label>Max Activations / HWID</label><input id="mMaxAct" type="number" value="999999" /></div>
          <div class="field"><label>Bulk Count</label><input id="mBulkCount" type="number" value="1" min="1" max="50" /></div>
          <div class="field"><label>Key Prefix</label><input id="mPrefix" value="KERNEL" /></div>
          <div class="field"><label>Expires At</label><input id="mExpires" type="datetime-local" /></div>
          <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="mGenSave">Generate</button></div></div>`);
        $('#mGenSave').onclick = async () => {
          const expires = $('#mExpires').value;
          const bulk = Math.min(50, Math.max(1, Number($('#mBulkCount').value) || 1));
          const prefix = ($('#mPrefix').value || 'KERNEL').trim().toUpperCase();
          let lastKey = '';
          for (let i = 0; i < bulk; i++) {
            const key = bulk === 1 ? $('#mKey').value : `${prefix}-${randomKey().slice(7)}`;
            const { ok, data: d } = await api('admin-keys', { method: 'POST', body: JSON.stringify({
              app_id: selectedAppId, license_key: key, subscription: $('#mSubName').value,
              max_activations: Number($('#mMaxAct').value) || 999999,
              expires_at: expires ? new Date(expires).toISOString() : null,
            }) });
            if (!ok) return toast(d.error || 'Failed', 'error');
            lastKey = d.license_key || key;
          }
          toast(bulk > 1 ? `Generated ${bulk} keys` : 'Key created: ' + lastKey); $('#modalRoot').innerHTML = ''; renderLicenses();
        };
      };
      $$('[data-revoke]').forEach((b) => b.onclick = async () => {
        const { ok } = await api('admin-keys', { method: 'PATCH', body: JSON.stringify({ app_id: selectedAppId, key: b.dataset.revoke, revoked: b.dataset.state === '1' }) });
        if (ok) { toast('Updated'); renderLicenses(); }
      });
      $$('[data-del-key]').forEach((b) => b.onclick = async () => {
        if (!confirm('Delete key?')) return;
        const { ok } = await api('admin-keys?key=' + encodeURIComponent(b.dataset.delKey) + '&app_id=' + encodeURIComponent(selectedAppId), { method: 'DELETE' });
        if (ok) { toast('Deleted'); renderLicenses(); }
      });
      $('#exportKeys').onclick = () => copyText(JSON.stringify(keys, null, 2));
      $('#clearExpiredKeys').onclick = async () => {
        const expired = keys.filter((k) => k.expires_at && new Date(k.expires_at) < new Date());
        if (!expired.length) return toast('No expired keys');
        if (!confirm(`Delete ${expired.length} expired keys?`)) return;
        for (const k of expired) await api('admin-keys?key=' + encodeURIComponent(k.key) + '&app_id=' + encodeURIComponent(selectedAppId), { method: 'DELETE' });
        toast('Cleared'); renderLicenses();
      };
    } catch (err) { showLoadError(err.message); }
  }

  /* ── Devices ── */
  async function renderDevices() {
    try {
      await loadApps();
      const { ok, data } = await api('devices?app_id=' + encodeURIComponent(selectedAppId));
      if (!ok) throw new Error(data.error || 'Failed');
      const devices = data.devices || [];

      $('#pageContent').innerHTML = `
        ${pageHead('device', `<span class="ax-badge">${devices.length} TOTAL</span>`, `<button class="btn btn-primary" id="addDeviceBtn">+ New Device</button>`)}
        <div class="ax-tabs" id="deviceTabs">
          <button class="active" data-dtab="motherboard">Motherboard</button>
          <button data-dtab="processor">Processor ID</button>
        </div>
        ${toolbar()}
        <div class="ax-panel"><table class="ax-table"><thead><tr><th>HWID / System ID</th><th>Type</th><th>Username</th><th>IP</th><th>Status</th><th>Created</th><th></th></tr></thead>
        <tbody id="deviceBody">${devices.map((d) => `
          <tr data-dtype="${esc((d.device_type || 'motherboard').toLowerCase())}"><td><code>${esc(d.hwid)}</code></td><td>${esc(d.device_type || 'Motherboard')}</td><td>${esc(d.username || '—')}</td><td>${esc(d.ip || '—')}</td>
          <td>${d.status === 'banned' ? '<span class="ax-badge" style="color:var(--ax-red)">Banned</span>' : '<span class="ax-badge green">Active</span>'}</td>
          <td>${fmtDate(d.created_at)}</td>
          <td>
            <button class="btn btn-ghost btn-sm" data-toggle-device="${esc(d.id)}" data-status="${d.status === 'banned' ? 'active' : 'banned'}">${d.status === 'banned' ? 'Unban' : 'Ban'}</button>
            <button class="btn btn-ghost btn-sm" data-unbind="${esc(d.id)}" title="Reset HWID">Unbind</button>
            <button class="btn btn-danger-ghost btn-sm" data-del-device="${esc(d.id)}">Delete</button>
          </td></tr>`).join('') || '<tr><td colspan="7"><div class="ax-empty">No devices yet</div></td></tr>'}
        </tbody></table></div>`;

      let deviceTab = 'motherboard';
      function filterDevices() {
        $$('#deviceBody tr[data-dtype]').forEach((tr) => {
          tr.style.display = tr.dataset.dtype === deviceTab ? '' : 'none';
        });
      }
      $$('#deviceTabs button').forEach((b) => b.onclick = () => {
        $$('#deviceTabs button').forEach((x) => x.classList.remove('active'));
        b.classList.add('active');
        deviceTab = b.dataset.dtab;
        filterDevices();
      });
      filterDevices();

      $('#addDeviceBtn').onclick = () => {
        showModal(`<div class="modal"><h2>Add Device</h2>
          <div class="field"><label>Type</label><select id="mDevType"><option value="motherboard">Motherboard</option><option value="processor">Processor ID</option></select></div>
          <div class="field"><label>HWID / System ID</label><input id="mHwid" /></div>
          <div class="field"><label>Username</label><input id="mDevUser" /></div>
          <div class="field"><label>IP</label><input id="mDevIp" /></div>
          <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="mSaveDev">Add</button></div></div>`);
        $('#mSaveDev').onclick = async () => {
          const dtype = $('#mDevType').value;
          const { ok, data: d } = await api('devices', { method: 'POST', body: JSON.stringify({
            app_id: selectedAppId, hwid: $('#mHwid').value, username: $('#mDevUser').value,
            ip: $('#mDevIp').value, device_type: dtype,
          }) });
          if (!ok) return toast(d.error || 'Failed', 'error');
          toast('Device added'); $('#modalRoot').innerHTML = ''; renderDevices();
        };
      };
      $$('[data-unbind]').forEach((b) => b.onclick = async () => {
        if (!confirm('Unbind/reset this device HWID?')) return;
        const { ok } = await api('devices?id=' + encodeURIComponent(b.dataset.unbind) + '&app_id=' + encodeURIComponent(selectedAppId), { method: 'DELETE' });
        if (ok) { toast('Device unbound'); renderDevices(navGen); }
      });
      $$('[data-toggle-device]').forEach((b) => b.onclick = async () => {
        const { ok } = await api('devices', { method: 'PATCH', body: JSON.stringify({ app_id: selectedAppId, id: b.dataset.toggleDevice, status: b.dataset.status }) });
        if (ok) { toast('Updated'); renderDevices(); }
      });
      $$('[data-del-device]').forEach((b) => b.onclick = async () => {
        if (!confirm('Delete device?')) return;
        const { ok } = await api('devices?id=' + encodeURIComponent(b.dataset.delDevice) + '&app_id=' + encodeURIComponent(selectedAppId), { method: 'DELETE' });
        if (ok) { toast('Deleted'); renderDevices(); }
      });
    } catch (err) { showLoadError(err.message); }
  }

  /* ── Subscriptions ── */
  async function renderSubscriptions() {
    try {
      await loadApps();
      const { ok, data } = await api('subscriptions?app_id=' + encodeURIComponent(selectedAppId));
      if (!ok) throw new Error(data.error || 'Failed');
      const subs = data.subscriptions || [];

      $('#pageContent').innerHTML = `
        ${pageHead('subscriptions', `<span class="ax-badge">${subs.length} TOTAL</span>`, `<button class="btn btn-primary" id="addSubBtn">+ New Subscription</button>`)}
        ${toolbar()}
        <div class="ax-panel"><table class="ax-table"><thead><tr><th>Name</th><th>Level</th><th>Duration</th><th>Price</th><th>Status</th><th></th></tr></thead>
        <tbody>${subs.map((s) => `
          <tr><td><strong>${esc(s.name)}</strong></td><td>${s.level}</td><td>${s.duration_days} days</td><td>$${esc(s.price)}</td>
          <td>${s.active !== false ? '<span class="ax-badge green">Active</span>' : '<span class="ax-badge">Inactive</span>'}</td>
          <td><button class="btn btn-danger-ghost btn-sm" data-del-sub="${esc(s.id)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="6"><div class="ax-empty">No subscriptions yet</div></td></tr>'}
        </tbody></table></div>`;

      $('#addSubBtn').onclick = () => {
        showModal(`<div class="modal"><h2>New Subscription</h2>
          <div class="field"><label>Name</label><input id="mSubName" placeholder="Premium" /></div>
          <div class="field"><label>Level</label><input id="mSubLevel" type="number" value="1" /></div>
          <div class="field"><label>Duration (days)</label><input id="mSubDays" type="number" value="30" /></div>
          <div class="field"><label>Price</label><input id="mSubPrice" value="9.99" /></div>
          <div class="field"><label>Feature Flags (comma-separated)</label><input id="mSubFeatures" placeholder="premium_support,hwid_lock,priority" /></div>
          <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="mSaveSub">Create</button></div></div>`);
        $('#mSaveSub').onclick = async () => {
          const { ok, data: d } = await api('subscriptions', { method: 'POST', body: JSON.stringify({
            app_id: selectedAppId, name: $('#mSubName').value, level: Number($('#mSubLevel').value),
            duration_days: Number($('#mSubDays').value), price: $('#mSubPrice').value,
            features: ($('#mSubFeatures').value || '').split(',').map(s => s.trim()).filter(Boolean).join(','),
          }) });
          if (!ok) return toast(d.error || 'Failed', 'error');
          toast('Subscription created'); $('#modalRoot').innerHTML = ''; renderSubscriptions();
        };
      };
      $$('[data-del-sub]').forEach((b) => b.onclick = async () => {
        if (!confirm('Delete?')) return;
        const { ok } = await api('subscriptions?id=' + encodeURIComponent(b.dataset.delSub) + '&app_id=' + encodeURIComponent(selectedAppId), { method: 'DELETE' });
        if (ok) { toast('Deleted'); renderSubscriptions(); }
      });
    } catch (err) { showLoadError(err.message); }
  }

  /* ── Variables ── */
  async function renderVariables() {
    try {
      const { data } = await api('variables');
      const vars = data.variables || [];
      $('#pageContent').innerHTML = `
        ${pageHead('variables', `<span class="ax-badge">${vars.length} TOTAL</span>`, `<button class="btn btn-primary" id="addVarBtn">+ New Variable</button>`)}
        ${toolbar()}
        <div class="ax-panel"><table class="ax-table"><thead><tr><th>Key</th><th>Value</th><th>Updated</th><th></th></tr></thead>
        <tbody>${vars.map((v) => `<tr><td><code>${esc(v.key)}</code></td><td>${esc(v.value)}</td><td>${fmtDate(v.updated_at)}</td>
          <td><button class="btn btn-danger-ghost btn-sm" data-del-var="${esc(v.key)}">Delete</button></td></tr>`).join('') || '<tr><td colspan="4"><div class="ax-empty">No variables</div></td></tr>'}
        </tbody></table></div>`;
      $('#addVarBtn').onclick = () => {
        showModal(`<div class="modal"><h2>New Variable</h2>
          <div class="field"><label>Key</label><input id="mVarKey" /></div>
          <div class="field"><label>Value</label><input id="mVarVal" /></div>
          <label class="ax-toggle"><input type="checkbox" id="mVarSecret" /><span class="ax-toggle-slider"></span> Secret (masked)</label>
          <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="mVarSave">Save</button></div></div>`);
        $('#mVarSave').onclick = async () => {
          const secret = $('#mVarSecret')?.checked;
          const val = $('#mVarVal').value;
          const { ok, data: d } = await api('variables', { method: 'POST', body: JSON.stringify({
            key: $('#mVarKey').value, value: secret ? '***' + val.slice(-4) : val, secret,
          }) });
          if (!ok) return toast(d.error || 'Failed', 'error');
          toast('Saved'); $('#modalRoot').innerHTML = ''; renderVariables();
        };
      };
      $$('[data-del-var]').forEach((b) => b.onclick = async () => {
        if (!confirm('Delete?')) return;
        const { ok } = await api('variables?key=' + encodeURIComponent(b.dataset.delVar), { method: 'DELETE' });
        if (ok) { toast('Deleted'); renderVariables(); }
      });
    } catch (err) { showLoadError(err.message); }
  }

  /* ── Sessions ── */
  async function renderSessions() {
    try {
      const { data } = await api('sessions');
      const sessions = data.sessions || [];
      $('#pageContent').innerHTML = `
        ${pageHead('sessions', `<span class="ax-badge">${sessions.length} ACTIVE</span>`, `<button class="btn btn-ghost btn-sm" id="refreshSessions">Refresh</button><button class="btn btn-danger-ghost btn-sm" id="killAllSessions">Terminate All</button>`)}
        <div class="ax-panel"><table class="ax-table"><thead><tr><th>Session ID</th><th>IP</th><th>Created</th><th></th></tr></thead>
        <tbody>${sessions.map((s) => `<tr><td><code style="font-size:11px">${esc(s.id)}</code></td><td>${esc(s.ip || '—')}</td><td>${fmtDate(s.created_at)}</td>
          <td><button class="btn btn-danger-ghost btn-sm" data-del-session="${esc(s.id)}">Revoke</button></td></tr>`).join('') || '<tr><td colspan="4"><div class="ax-empty">No sessions</div></td></tr>'}
        </tbody></table></div>`;
      $('#refreshSessions').onclick = () => renderSessions(navGen);
      $('#killAllSessions').onclick = async () => {
        if (!confirm('Terminate ALL active sessions?')) return;
        const { ok, data } = await api('sessions?all=1', { method: 'DELETE' });
        if (ok) { toast('All sessions terminated (' + (data.deleted || 0) + ')'); renderSessions(navGen); }
      };
      $$('[data-del-session]').forEach((b) => b.onclick = async () => {
        const { ok } = await api('sessions?id=' + encodeURIComponent(b.dataset.delSession), { method: 'DELETE' });
        if (ok) { toast('Revoked'); renderSessions(); }
      });
    } catch (err) { showLoadError(err.message); }
  }

  /* ── Logs ── */
  async function renderLogs() {
    try {
      const { data } = await api('logs');
      const logs = data.logs || [];
      $('#pageContent').innerHTML = `
        ${pageHead('logs', `<span class="ax-badge">${logs.length} TOTAL</span>`, `<button class="btn btn-ghost btn-sm" id="refreshLogs">Refresh</button><button class="btn btn-ghost btn-sm" id="exportLogs">Export</button><button class="btn btn-danger-ghost btn-sm" id="deleteAllLogs">Delete All</button>`)}
        ${toolbar(`<select id="logTypeFilter" style="padding:8px;background:var(--ax-panel);border:1px solid var(--ax-border);border-radius:8px;color:var(--ax-text)"><option value="">All Types</option>${[...new Set(logs.map(l => l.type))].map(t => `<option value="${esc(t)}">${esc(t)}</option>`).join('')}</select>`)}
        <div class="ax-panel"><table class="ax-table"><thead><tr><th>Type</th><th>Details</th><th>Time</th></tr></thead>
        <tbody id="logsBody">${logs.map((l) => {
          const details = { ...l }; delete details.type; delete details.at; delete details.id;
          return `<tr data-search="${esc(l.type.toLowerCase())}"><td><span class="ax-badge blue">${esc(l.type)}</span></td>
            <td style="font-size:12px">${esc(JSON.stringify(details).slice(0, 120))}</td><td>${fmtDate(l.at)}</td></tr>`;
        }).join('') || '<tr><td colspan="3"><div class="ax-empty">No logs</div></td></tr>'}
        </tbody></table></div>`;
      bindToolbar((q) => $$('#logsBody tr[data-search]').forEach((tr) => { tr.style.display = !q || tr.dataset.search.includes(q) ? '' : 'none'; }));
      $('#refreshLogs').onclick = () => renderLogs(navGen);
      $('#exportLogs').onclick = () => copyText(JSON.stringify(logs, null, 2));
      $('#deleteAllLogs').onclick = async () => {
        if (!confirm('Delete ALL logs permanently?')) return;
        const { ok } = await api('logs?all=1', { method: 'DELETE' });
        if (ok) { toast('All logs deleted'); renderLogs(navGen); }
      };
      $('#logTypeFilter')?.addEventListener('change', (e) => {
        const t = e.target.value;
        $$('#logsBody tr[data-search]').forEach((tr) => {
          tr.style.display = !t || tr.dataset.search.includes(t.toLowerCase()) ? '' : 'none';
        });
      });
    } catch (err) { showLoadError(err.message); }
  }

  /* ── Policies ── */
  async function renderPolicies(gen = navGen) {
    try {
      if (!selectedAppId) await loadApps();
      if (!policiesDraft) {
        const { ok, data } = await api('policies?app_id=' + encodeURIComponent(selectedAppId));
        if (!ok) throw new Error(data.error || 'Failed');
        policiesDraft = { ...(data.policies || {}) };
      }
      if (stale(gen)) return;
      const p = policiesDraft;

      $('#pageContent').innerHTML = `
        ${pageHead('policies')}
        <div class="ax-tabs" id="policyTabs">
          <button class="active" data-tab="ip">IP Access</button>
          <button data-tab="hwid">System ID</button>
          <button data-tab="location">Location / VPN</button>
        </div>
        <div class="ax-panel" style="padding:20px" id="policyContent">
          <div class="field"><label>IP Whitelist (one per line)</label><textarea id="ipWhitelist" rows="4">${esc((p.ip_whitelist || []).join('\n'))}</textarea></div>
          <div class="field"><label>IP Blacklist (one per line)</label><textarea id="ipBlacklist" rows="4">${esc((p.ip_blacklist || []).join('\n'))}</textarea></div>
        </div>
        <div style="margin-top:16px"><button class="btn btn-primary" id="savePolicies">Save Policies</button></div>`;

      const tabData = {
        ip: `<div class="field"><label>IP Whitelist</label><textarea id="ipWhitelist" rows="5">${esc((p.ip_whitelist || []).join('\n'))}</textarea></div>
             <div class="field"><label>IP Blacklist</label><textarea id="ipBlacklist" rows="5">${esc((p.ip_blacklist || []).join('\n'))}</textarea></div>`,
        hwid: `<div class="field"><label>HWID Whitelist</label><textarea id="hwidWhitelist" rows="5">${esc((p.hwid_whitelist || []).join('\n'))}</textarea></div>
               <div class="field"><label>HWID Blacklist</label><textarea id="hwidBlacklist" rows="5">${esc((p.hwid_blacklist || []).join('\n'))}</textarea></div>`,
        location: `<label class="ax-toggle"><input type="checkbox" id="vpnBlock" ${p.vpn_block ? 'checked' : ''} /><span class="ax-toggle-slider"></span> Block VPN connections</label>
                   <div class="field" style="margin-top:16px"><label>Blocked Countries (codes, one per line)</label><textarea id="countryBlock" rows="4">${esc((p.country_block || []).join('\n'))}</textarea></div>`,
      };

      $$('#policyTabs button').forEach((b) => {
        b.onclick = () => {
          syncPoliciesFromDom();
          $$('#policyTabs button').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          $('#policyContent').innerHTML = tabData[b.dataset.tab];
        };
      });

      function parseLines(id) {
        const el = $('#' + id);
        if (!el) return [];
        return el.value.split('\n').map((s) => s.trim()).filter(Boolean);
      }

      function syncPoliciesFromDom() {
        policiesDraft = {
          ...(policiesDraft || {}),
          ip_whitelist: parseLines('ipWhitelist').length ? parseLines('ipWhitelist') : (policiesDraft?.ip_whitelist || []),
          ip_blacklist: parseLines('ipBlacklist').length ? parseLines('ipBlacklist') : (policiesDraft?.ip_blacklist || []),
          hwid_whitelist: parseLines('hwidWhitelist').length ? parseLines('hwidWhitelist') : (policiesDraft?.hwid_whitelist || []),
          hwid_blacklist: parseLines('hwidBlacklist').length ? parseLines('hwidBlacklist') : (policiesDraft?.hwid_blacklist || []),
          vpn_block: $('#vpnBlock') ? $('#vpnBlock').checked : (policiesDraft?.vpn_block || false),
          country_block: parseLines('countryBlock').length ? parseLines('countryBlock') : (policiesDraft?.country_block || []),
        };
      }

      async function savePoliciesHandler() {
        syncPoliciesFromDom();
        const body = { app_id: selectedAppId, ...policiesDraft };
        const { ok, data: d } = await api('policies?app_id=' + encodeURIComponent(selectedAppId), { method: 'PUT', body: JSON.stringify(body) });
        if (!ok) return toast(d.error || 'Failed', 'error');
        policiesDraft = d.policies || policiesDraft;
        toast('Policies saved');
      }
      $('#savePolicies').onclick = savePoliciesHandler;
    } catch (err) { showLoadError(err.message); }
  }

  /* ── Social Auth ── */
  async function renderSocial() {
    try {
      if (!config) { const c = await api('config'); if (c.ok) config = c.data; }
      const oauth = config.oauth || {};
      const callback = config.site_url + '/oauth/callback.html';
      const providers = [
        { id: 'google', name: 'Google', cls: 'google', letter: 'G' },
        { id: 'discord', name: 'Discord', cls: 'discord', letter: 'D' },
        { id: 'github', name: 'GitHub', cls: 'github', letter: 'GH' },
      ];

      $('#pageContent').innerHTML = `
        ${pageHead('social', `<span class="ax-badge green">OAuth Ready</span>`)}
        <div class="ax-panel" style="padding:20px">
          ${providers.map((p) => {
            const enabled = oauth[p.id]?.enabled;
            return `<div class="oauth-card">
              <div class="oauth-icon ${p.cls}">${p.letter}</div>
              <div style="flex:1"><strong>${p.name}</strong>
                <div style="font-size:12px;color:var(--ax-muted);margin-top:4px">${enabled ? '<span class="ax-badge green">Configured</span>' : '<span class="ax-badge">Not configured</span>'}</div></div>
              <button class="btn btn-ghost btn-sm" data-test-oauth="${p.id}" ${enabled ? '' : 'disabled'}>Test Flow</button>
            </div>`;
          }).join('')}
        </div>
        <div class="ax-panel" style="padding:20px;margin-top:16px">
          <h3 style="margin-bottom:12px">Redirect URI</h3>
          <div class="cred-box">${esc(callback)}<button class="btn btn-ghost btn-sm" data-copy="${esc(callback)}" style="margin-top:8px">Copy</button></div>
          <p style="font-size:12px;color:var(--ax-muted);margin-top:12px">Loader callback: ${esc(config.loader_callback)}</p>
        </div>`;

      bindCopy();
      $$('[data-test-oauth]').forEach((b) => b.onclick = () => {
        window.open('/api/oauth-start?provider=' + b.dataset.testOauth + '&state=test-' + Math.random().toString(36).slice(2), '_blank');
      });
    } catch (err) { showLoadError(err.message); }
  }

  /* ── Settings ── */
  async function renderSettings() {
    try {
      await loadApps();
      const app = selectedApp();
      const settings = app?.settings || {};
      if (!config) { const c = await api('config'); if (c.ok) config = c.data; }

      $('#pageContent').innerHTML = `
        ${pageHead('settings')}
        <div class="ax-tabs" id="settingsTabs">
          <button class="active" data-stab="general">General</button>
          <button data-stab="messages">Response Messages</button>
          <button data-stab="hash">Hash Management</button>
          <button data-stab="version">Version Whitelist</button>
          <button data-stab="panel">User Panel</button>
        </div>
        <div class="ax-panel" style="padding:24px" id="settingsContent">
          <div class="field"><label>App Version</label><input id="setVersion" value="${esc(app?.version || '1.0')}" /></div>
          <label class="ax-toggle"><input type="checkbox" id="setCheckHash" ${settings.check_hash ? 'checked' : ''} /><span class="ax-toggle-slider"></span> Check Hash</label>
          <label class="ax-toggle"><input type="checkbox" id="setAppLogs" ${settings.app_logs !== false ? 'checked' : ''} /><span class="ax-toggle-slider"></span> App Logs</label>
          <label class="ax-toggle"><input type="checkbox" id="setAutoUpdate" ${settings.auto_update ? 'checked' : ''} /><span class="ax-toggle-slider"></span> Auto Update</label>
          <label class="ax-toggle"><input type="checkbox" id="setDisableApp" ${settings.disable_app ? 'checked' : ''} /><span class="ax-toggle-slider"></span> Disable App</label>
          <div class="field" style="margin-top:16px"><label>Webhook URL</label><input id="setWebhook" value="${esc(settings.webhook_url || '')}" placeholder="https://discord.com/api/webhooks/..." /></div>
        </div>
        <div style="margin-top:16px"><button class="btn btn-primary" id="saveSettings">Save Settings</button></div>`;

      const tabContent = {
        general: $('#settingsContent').innerHTML,
        messages: `<div class="field"><label>Invalid Key Message</label><input id="msgInvalid" value="${esc(settings.msg_invalid || 'Invalid license key')}" /></div>
          <div class="field"><label>Expired Message</label><input id="msgExpired" value="${esc(settings.msg_expired || 'Your subscription has expired')}" /></div>
          <div class="field"><label>Banned Message</label><input id="msgBanned" value="${esc(settings.msg_banned || 'Your account has been banned')}" /></div>`,
        hash: `<div class="field"><label>Allowed Hashes (one per line)</label><textarea id="hashList" rows="6">${esc((settings.hash_whitelist || []).join('\n'))}</textarea></div>`,
        version: `<div class="field"><label>Allowed Versions (one per line)</label><textarea id="versionList" rows="6">${esc((settings.version_whitelist || ['1.0']).join('\n'))}</textarea></div>`,
        panel: `<label class="ax-toggle"><input type="checkbox" id="setUserPanel" ${settings.user_panel ? 'checked' : ''} /><span class="ax-toggle-slider"></span> Enable User Panel</label>
          <div class="field" style="margin-top:16px"><label>Panel URL</label><input id="setPanelUrl" value="${esc(settings.panel_url || '')}" /></div>`,
      };

      $$('#settingsTabs button').forEach((b) => {
        b.onclick = () => {
          $$('#settingsTabs button').forEach((x) => x.classList.remove('active'));
          b.classList.add('active');
          $('#settingsContent').innerHTML = tabContent[b.dataset.stab];
        };
      });

      $('#saveSettings').onclick = async () => {
        if (!app) return toast('Select an app first', 'error');
        const body = {
          id: app.id,
          version: $('#setVersion')?.value || app.version,
          settings: {
            check_hash: $('#setCheckHash')?.checked || false,
            app_logs: $('#setAppLogs')?.checked !== false,
            auto_update: $('#setAutoUpdate')?.checked || false,
            disable_app: $('#setDisableApp')?.checked || false,
            webhook_url: $('#setWebhook')?.value || '',
            msg_invalid: $('#msgInvalid')?.value,
            msg_expired: $('#msgExpired')?.value,
            msg_banned: $('#msgBanned')?.value,
            hash_whitelist: ($('#hashList')?.value || '').split('\n').map((s) => s.trim()).filter(Boolean),
            version_whitelist: ($('#versionList')?.value || '1.0').split('\n').map((s) => s.trim()).filter(Boolean),
            user_panel: $('#setUserPanel')?.checked || false,
            panel_url: $('#setPanelUrl')?.value || '',
          },
        };
        Object.keys(body.settings).forEach((k) => { if (body.settings[k] == null) delete body.settings[k]; });
        const { ok, data: d } = await api('applications', { method: 'PATCH', body: JSON.stringify(body) });
        if (!ok) return toast(d.error || 'Failed', 'error');
        toast('Settings saved');
        await loadApps(true);
      };
    } catch (err) { showLoadError(err.message); }
  }

  /* ── Team pages (generic CRUD) ── */
  async function renderTeamPage(type, label, gen = navGen) {
    try {
      const { ok, data } = await api('team?type=' + encodeURIComponent(type));
      if (stale(gen)) return;
      if (!ok) throw new Error(data.error || 'Failed');
      const items = data.items || [];
      const pageId = type === 'chats' ? 'chats' : type === 'files' ? 'files' : type;

      const columns = {
        staff: ['Name', 'Email', 'Role', 'Created'],
        resellers: ['Name', 'Email', 'Commission', 'Created'],
        bots: ['Name', 'Platform', 'Token', 'Created'],
        audit: ['Action', 'User', 'Details', 'Time'],
        apikey: ['Label', 'Key', 'Created'],
        files: ['Name', 'Size', 'URL', 'Created'],
        chats: ['User', 'Message', 'Time'],
      };
      const cols = columns[type] || ['Name', 'Details', 'Created'];

      $('#pageContent').innerHTML = `
        ${pageHead(pageId, `<span class="ax-badge">${items.length} TOTAL</span>`, `<button class="btn btn-primary" id="addTeamBtn">+ New ${esc(label.replace(/s$/, ''))}</button>`)}
        ${toolbar()}
        <div class="ax-panel"><table class="ax-table"><thead><tr>${cols.map((c) => `<th>${c}</th>`).join('')}<th></th></tr></thead>
        <tbody>${items.map((item) => {
          if (type === 'staff') return `<tr><td>${esc(item.name)}</td><td>${esc(item.email || '—')}</td><td>${esc(item.role || 'Staff')}</td><td>${fmtDate(item.created_at)}</td>
            <td><button class="btn btn-danger-ghost btn-sm" data-del-team="${esc(item.id)}">Delete</button></td></tr>`;
          if (type === 'resellers') return `<tr><td>${esc(item.name)}</td><td>${esc(item.email || '—')}</td><td>${esc(item.commission || '10')}%</td><td>${fmtDate(item.created_at)}</td>
            <td><button class="btn btn-danger-ghost btn-sm" data-del-team="${esc(item.id)}">Delete</button></td></tr>`;
          if (type === 'bots') return `<tr><td>${esc(item.name)}</td><td>${esc(item.platform || 'Discord')}</td><td><code>••••</code></td><td>${fmtDate(item.created_at)}</td>
            <td><button class="btn btn-danger-ghost btn-sm" data-del-team="${esc(item.id)}">Delete</button></td></tr>`;
          if (type === 'apikey') return `<tr><td>${esc(item.label || item.name)}</td><td><code>${esc(item.key || '—')}</code></td><td>${fmtDate(item.created_at)}</td>
            <td><button class="btn btn-danger-ghost btn-sm" data-del-team="${esc(item.id)}">Delete</button></td></tr>`;
          if (type === 'files') return `<tr><td>${esc(item.name)}</td><td>${esc(item.size || '—')}</td><td>${esc(item.url || '—')}</td><td>${fmtDate(item.created_at)}</td>
            <td><button class="btn btn-danger-ghost btn-sm" data-del-team="${esc(item.id)}">Delete</button></td></tr>`;
          if (type === 'chats') return `<tr><td>${esc(item.user || '—')}</td><td>${esc(item.message || '—')}</td><td>${fmtDate(item.created_at)}</td>
            <td><button class="btn btn-danger-ghost btn-sm" data-del-team="${esc(item.id)}">Delete</button></td></tr>`;
          return `<tr><td>${esc(item.action || item.name || '—')}</td><td>${esc(item.user || item.email || '—')}</td><td>${esc(item.details || '—')}</td><td>${fmtDate(item.created_at)}</td>
            <td><button class="btn btn-danger-ghost btn-sm" data-del-team="${esc(item.id)}">Delete</button></td></tr>`;
        }).join('') || `<tr><td colspan="${cols.length + 1}"><div class="ax-empty">No ${esc(label.toLowerCase())} yet</div></td></tr>`}
        </tbody></table></div>`;

      $('#addTeamBtn').onclick = () => {
        let fields = '';
        if (type === 'staff') fields = `<div class="field"><label>Name</label><input id="mName" /></div><div class="field"><label>Email</label><input id="mEmail" /></div><div class="field"><label>Role</label><input id="mRole" value="Staff" /></div>`;
        else if (type === 'resellers') fields = `<div class="field"><label>Name</label><input id="mName" /></div><div class="field"><label>Email</label><input id="mEmail" /></div><div class="field"><label>Commission %</label><input id="mCommission" value="10" /></div>`;
        else if (type === 'bots') fields = `<div class="field"><label>Name</label><input id="mName" /></div><div class="field"><label>Platform</label><select id="mPlatform"><option>Discord</option><option>Telegram</option></select></div><div class="field"><label>Bot Token</label><input id="mToken" /></div>`;
        else if (type === 'apikey') fields = `<div class="field"><label>Label</label><input id="mLabel" /></div>`;
        else if (type === 'files') fields = `<div id="fileDrop" style="border:2px dashed var(--ax-border);border-radius:12px;padding:40px;text-align:center;margin-bottom:16px;color:var(--ax-muted)">Drag & drop files here or click to browse<input type="file" id="fileInput" style="display:none" /></div><div class="field"><label>File Name</label><input id="mName" /></div><div class="field"><label>URL</label><input id="mUrl" placeholder="https://..." /></div><div class="field"><label>Size</label><input id="mSize" placeholder="1.2 MB" /></div>`;
        else if (type === 'variables') fields = `<div class="field"><label>Key</label><input id="mVarKey" /></div><div class="field"><label>Value</label><input id="mVarVal" /></div><label class="ax-toggle"><input type="checkbox" id="mVarSecret" /><span class="ax-toggle-slider"></span> Secret (masked in client)</label>`;
        else if (type === 'chats') fields = `<div class="field"><label>User</label><input id="mUser" /></div><div class="field"><label>Message</label><textarea id="mMessage" rows="3"></textarea></div>`;
        else fields = `<div class="field"><label>Action</label><input id="mAction" /></div><div class="field"><label>User</label><input id="mUser" /></div><div class="field"><label>Details</label><input id="mDetails" /></div>`;

        showModal(`<div class="modal"><h2>New ${esc(label.replace(/s$/, ''))}</h2>${fields}
          <div class="modal-actions"><button class="btn btn-ghost" data-close>Cancel</button><button class="btn btn-primary" id="mTeamSave">Create</button></div></div>`);

        if (type === 'files') {
          const drop = $('#fileDrop');
          const inp = $('#fileInput');
          if (drop && inp) {
            drop.onclick = () => inp.click();
            drop.ondragover = (e) => { e.preventDefault(); drop.style.borderColor = 'var(--ax-blue)'; };
            drop.ondragleave = () => { drop.style.borderColor = 'var(--ax-border)'; };
            drop.ondrop = (e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (f) { $('#mName').value = f.name; $('#mSize').value = (f.size / 1024 / 1024).toFixed(2) + ' MB'; toast('File ready: ' + f.name); }
            };
            inp.onchange = () => {
              const f = inp.files[0];
              if (f) { $('#mName').value = f.name; $('#mSize').value = (f.size / 1024 / 1024).toFixed(2) + ' MB'; }
            };
          }
        }

        $('#mTeamSave').onclick = async () => {
          const payload = { type };
          if (type === 'staff') Object.assign(payload, { name: $('#mName').value, email: $('#mEmail').value, role: $('#mRole').value });
          else if (type === 'resellers') Object.assign(payload, { name: $('#mName').value, email: $('#mEmail').value, commission: $('#mCommission').value });
          else if (type === 'bots') Object.assign(payload, { name: $('#mName').value, platform: $('#mPlatform').value, token: $('#mToken').value });
          else if (type === 'apikey') Object.assign(payload, { label: $('#mLabel').value, name: $('#mLabel').value, key: 'KERNEL-TEAM-' + randomKey().slice(7) });
          else if (type === 'files') Object.assign(payload, { name: $('#mName').value, url: $('#mUrl').value, size: $('#mSize').value });
          else if (type === 'chats') Object.assign(payload, { user: $('#mUser').value, message: $('#mMessage').value });
          else Object.assign(payload, { action: $('#mAction').value, user: $('#mUser').value, details: $('#mDetails').value });

          const { ok, data: d } = await api('team', { method: 'POST', body: JSON.stringify(payload) });
          if (!ok) return toast(d.error || 'Failed', 'error');
          toast('Created'); $('#modalRoot').innerHTML = '';
          renderTeamPage(type, label);
        };
      };

      $$('[data-del-team]').forEach((b) => b.onclick = async () => {
        if (!confirm('Delete?')) return;
        const { ok } = await api('team?type=' + encodeURIComponent(type) + '&id=' + encodeURIComponent(b.dataset.delTeam), { method: 'DELETE' });
        if (ok) { toast('Deleted'); renderTeamPage(type, label); }
      });
    } catch (err) { showLoadError(err.message); }
  }

  /* ── Auth ── */
  async function showApp() {
    $('#loginView').classList.add('hidden');
    $('#appView').classList.remove('hidden');
    updateUserUI();
    try { await loadApps(); } catch { apps = []; }
    renderNav();
    navigate(currentPage);
  }

  function logout() {
    token = '';
    userProfile = null;
    sessionStorage.removeItem(STORAGE_KEY);
    sessionStorage.removeItem(PROFILE_KEY);
    $('#appView').classList.add('hidden');
    $('#loginView').classList.remove('hidden');
  }

  async function login() {
    const pass = $('#loginPassword').value;
    const err = $('#loginError');
    err.classList.add('hidden');
    const { ok, data } = await api('admin-login', { method: 'POST', body: JSON.stringify({ password: pass }) });
    if (!ok) { err.textContent = data.error || 'Invalid password'; err.classList.remove('hidden'); return; }
    token = data.token;
    sessionStorage.setItem(STORAGE_KEY, token);
    await showApp();
  }

  function startGoogleLogin() {
    if (!config?.oauth?.google?.enabled) {
      toast('Google OAuth is not configured. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Netlify.', 'error');
      return;
    }
    const state = 'dashboard-' + crypto.randomUUID();
    sessionStorage.setItem('kernel_oauth_state', state);
    window.location.href = '/api/oauth-start?provider=google&state=' + encodeURIComponent(state);
  }

  function showOAuthLoginError() {
    const params = new URLSearchParams(location.search);
    const err = params.get('oauth_error');
    if (!err) return;
    const el = $('#loginError');
    if (!el) return;
    const messages = {
      google_not_configured: 'Google OAuth is not configured on the server. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in Netlify environment variables.',
    };
    el.textContent = messages[err] || decodeURIComponent(err);
    el.classList.remove('hidden');
    history.replaceState({}, '', location.pathname);
  }

  /* ── Init ── */
  $('#loginBtn').addEventListener('click', login);
  $('#loginPassword').addEventListener('keydown', (e) => { if (e.key === 'Enter') login(); });
  $('#googleLoginBtn').addEventListener('click', startGoogleLogin);
  $('#logoutBtn').addEventListener('click', logout);
  $('#linkInvites')?.addEventListener('click', (e) => { e.preventDefault(); toast('Invites coming soon — use Staff/Resellers for now'); });
  $('#linkSupport')?.addEventListener('click', (e) => { e.preventDefault(); window.open('https://discord.com', '_blank'); });

  $('#modeApp').addEventListener('click', () => {
    mode = 'app';
    sessionStorage.setItem('kernel_nav_mode', mode);
    $('#modeApp').classList.add('active');
    $('#modeTeam').classList.remove('active');
    if (!NAV_APP.find((n) => n.id === currentPage)) navigate('dashboard');
    else renderNav();
  });

  $('#modeTeam').addEventListener('click', () => {
    mode = 'team';
    sessionStorage.setItem('kernel_nav_mode', mode);
    $('#modeTeam').classList.add('active');
    $('#modeApp').classList.remove('active');
    if (!NAV_TEAM.find((n) => n.id === currentPage)) navigate('apikey');
    else renderNav();
  });

  if (mode === 'team') {
    $('#modeTeam').classList.add('active');
    $('#modeApp').classList.remove('active');
    currentPage = NAV_TEAM.find((n) => n.id === currentPage)?.id ? currentPage : 'apikey';
  }

  fetch('/api/config').then((r) => r.json()).then((d) => { config = d; showOAuthLoginError(); }).catch(() => {});

  if (token) {
    api('admin-keys?app_id=' + encodeURIComponent(selectedAppId || 'default')).then(({ ok }) => {
      if (ok) showApp();
      else logout();
    });
  } else {
    showOAuthLoginError();
  }
})();
