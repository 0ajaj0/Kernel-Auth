(function () {
  'use strict';

  const PLANS = {
    free: { name: 'Free', price: '$0' },
    lite: { name: 'Lite', price: '$5/mo' },
    plus: { name: 'Plus', price: '$9/mo' },
    enterprise: { name: 'Enterprise', price: 'Custom' },
  };

  function toast(msg, type) {
    const el = document.createElement('div');
    el.className = 'toast ' + (type || 'success');
    el.textContent = msg;
    el.style.cssText = 'position:fixed;bottom:24px;right:24px;background:#15181E;border:1px solid #1e293b;padding:12px 18px;border-radius:10px;font-size:13px;z-index:200;animation:toastIn .3s ease';
    document.body.appendChild(el);
    setTimeout(() => { el.style.opacity = '0'; el.style.transition = 'opacity .3s'; setTimeout(() => el.remove(), 300); }, 3500);
  }

  function headers() {
    return KernelAuth.authHeaders();
  }

  async function api(path, opts) {
    const res = await fetch('/api/' + path, { ...opts, headers: { ...headers(), ...(opts?.headers || {}) } });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  function showModal(html) {
    document.getElementById('modalRoot').innerHTML = '<div class="modal-bg fade-in" id="modalBg">' + html + '</div>';
    const bg = document.getElementById('modalBg');
    bg.addEventListener('click', (e) => { if (e.target === bg) close(); });
    document.querySelectorAll('[data-close]').forEach((b) => b.addEventListener('click', close));
    function close() { document.getElementById('modalRoot').innerHTML = ''; }
    return close;
  }

  function usageBar(used, max, label) {
    const pct = max > 0 ? Math.min(100, Math.round((used / max) * 100)) : 0;
    const color = pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#3b82f6';
    return `
      <div class="usage-row">
        <div class="usage-label"><span>${label}</span><span>${used} / ${max}</span></div>
        <div class="usage-track"><div class="usage-fill" style="width:${pct}%;background:${color}"></div></div>
      </div>`;
  }

  function renderKeys(keys) {
    const el = document.getElementById('keysList');
    if (!keys || !keys.length) {
      el.innerHTML = '<p style="color:var(--ax-muted);font-size:13px">No keys yet — create one below</p>';
      return;
    }
    el.innerHTML = keys.map((k, i) => {
      const key = typeof k === 'string' ? k : k.key || k.license_key || '';
      return `<div class="key-row fade-in"><span>${key}</span><button class="btn btn-ghost btn-sm" data-copy-key="${i}">Copy</button></div>`;
    }).join('');
    el.querySelectorAll('[data-copy-key]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const idx = Number(btn.dataset.copyKey);
        const key = typeof keys[idx] === 'string' ? keys[idx] : keys[idx].key || keys[idx].license_key;
        navigator.clipboard.writeText(key).then(() => {
          btn.textContent = '✓';
          toast('License key copied');
          setTimeout(() => { btn.textContent = 'Copy'; }, 2000);
        });
      });
    });
  }

  function renderVars(vars) {
    const el = document.getElementById('varsList');
    const entries = Object.entries(vars || {});
    if (!entries.length) {
      el.innerHTML = '<p style="color:var(--ax-muted)">None assigned</p>';
      return;
    }
    el.innerHTML = entries.map(([k, v]) => `<div><strong>${k}</strong>: ${v}</div>`).join('');
  }

  function renderDownloads(list) {
    const el = document.getElementById('downloadsList');
    el.innerHTML = (list || []).map((d) =>
      `<div class="download-item"><span>${d.name} <small style="color:var(--ax-muted)">v${d.version || '1.0'}</small></span><a class="btn btn-ghost btn-sm" href="${d.url || '#'}" ${d.url === '#' ? '' : 'download'}>Download</a></div>`
    ).join('') || '<p style="color:var(--ax-muted);font-size:13px">No downloads</p>';
  }

  function openUpgradeModal(current, plans) {
    const tiers = (plans || []).filter((p) => p.id !== 'enterprise');
    const close = showModal(`
      <div class="modal slide-up" style="max-width:420px">
        <h2>Upgrade Subscription</h2>
        <p style="color:var(--ax-muted);font-size:14px;margin:12px 0">Current plan: <strong>${current}</strong></p>
        <div style="display:flex;flex-direction:column;gap:10px;margin:16px 0">
          ${tiers.map((p) => `<button class="btn ${p.label === current ? 'btn-ghost' : 'btn-primary'}" data-tier="${p.id}" ${p.label === current ? 'disabled' : ''}>
            ${p.label} — ${p.max_users} users, ${p.max_licenses} licenses
          </button>`).join('')}
        </div>
        <p style="font-size:12px;color:var(--ax-muted)">Upgrade requests are reviewed by admin. Instant upgrades are applied when admin assigns your plan.</p>
        <button class="btn btn-ghost" data-close style="width:100%;margin-top:8px">Cancel</button>
      </div>
    `);
    document.querySelectorAll('[data-tier]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const { ok, data } = await api('customer-api', {
          method: 'POST',
          body: JSON.stringify({ action: 'upgrade_request', tier: btn.dataset.tier }),
        });
        close();
        toast(ok ? (data.message || 'Upgrade requested') : (data.error || 'Failed'), ok ? 'success' : 'error');
      });
    });
  }

  async function loadDashboard() {
    const session = await KernelAuth.guardRoute('CUSTOMER', '/admin/dashboard/');
    if (!session) return;

    const profile = session.session;
    document.getElementById('displayName').textContent = profile.name || profile.email || 'Customer';
    document.getElementById('userEmail').textContent = profile.email || '';
    if (profile.picture) {
      document.getElementById('avatar').innerHTML = `<img src="${profile.picture}" alt="" style="width:40px;height:40px;border-radius:50%" />`;
    } else {
      document.getElementById('avatar').textContent = (profile.name || 'U')[0].toUpperCase();
    }

    const { ok, data } = await api('customer-api');
    if (!ok) {
      toast(data.error || 'Failed to load dashboard', 'error');
      return;
    }

    const user = data.user || {};
    const status = user.status || 'active';
    document.getElementById('subLabel').textContent = user.subscription_label || 'Free';
    document.getElementById('hwidValue').textContent = user.hwid ? 'Bound: ' + user.hwid : 'No device bound';

    const pill = document.getElementById('hwidPill');
    pill.textContent = user.hwid_status === 'bound' ? 'Bound' : (user.hwid_reset_pending ? 'Reset Pending' : 'Unbound');
    pill.className = 'pill ' + (user.hwid_status === 'bound' ? 'active' : (user.hwid_reset_pending ? 'pending' : 'unbound'));

    const statusPill = document.getElementById('statusPill');
    if (statusPill) {
      statusPill.textContent = status === 'suspended' ? 'Suspended' : 'Active';
      statusPill.className = 'pill ' + (status === 'suspended' ? 'pending' : 'active');
    }

    const usage = user.usage || { apps: 0, users: 0, licenses: 0 };
    const limits = user.limits || { max_apps: 1, max_users: 5, max_licenses: 3 };
    document.getElementById('usageSection').innerHTML =
      usageBar(usage.users, limits.max_users, 'Users') +
      usageBar(usage.licenses, limits.max_licenses, 'Licenses') +
      usageBar(usage.apps, limits.max_apps, 'Apps');

    document.getElementById('apiToken').textContent = user.api_token || '—';
    renderKeys(user.license_keys);
    renderVars(data.variables);
    renderDownloads(data.downloads);

    window.__clientPlans = data.plans || [];

    const selectedPlan = sessionStorage.getItem('kernel_selected_plan');
    if (selectedPlan && selectedPlan !== 'free' && selectedPlan !== user.subscription) {
      sessionStorage.removeItem('kernel_selected_plan');
      setTimeout(() => openUpgradeModal(user.subscription_label || 'Free', data.plans), 600);
    }
  }

  document.getElementById('logoutBtn').onclick = () => {
    KernelAuth.clearSession();
    location.href = '/login/';
  };

  document.getElementById('copyTokenBtn').onclick = () => {
    const t = document.getElementById('apiToken').textContent;
    if (t && t !== '—') {
      navigator.clipboard.writeText(t).then(() => {
        document.getElementById('copyTokenBtn').textContent = '✓';
        toast('API token copied');
        setTimeout(() => { document.getElementById('copyTokenBtn').textContent = 'Copy'; }, 2000);
      });
    }
  };

  document.getElementById('upgradeBtn').onclick = () => {
    openUpgradeModal(document.getElementById('subLabel').textContent, window.__clientPlans);
  };

  document.getElementById('createLicenseBtn').onclick = async () => {
    const btn = document.getElementById('createLicenseBtn');
    btn.disabled = true;
    btn.textContent = 'Creating…';
    const { ok, data } = await api('customer-api', { method: 'POST', body: JSON.stringify({ action: 'create_license' }) });
    btn.disabled = false;
    btn.textContent = '+ Create License';
    if (!ok) { toast(data.error || 'Failed to create license', 'error'); return; }
    toast('License created: ' + data.license_key);
    loadDashboard();
  };

  document.getElementById('createUserBtn').onclick = async () => {
    const btn = document.getElementById('createUserBtn');
    btn.disabled = true;
    btn.textContent = 'Creating…';
    const { ok, data } = await api('customer-api', { method: 'POST', body: JSON.stringify({ action: 'create_user' }) });
    btn.disabled = false;
    btn.textContent = '+ Create User';
    if (!ok) { toast(data.error || 'Failed to create user', 'error'); return; }
    toast('User created successfully');
    loadDashboard();
  };

  document.getElementById('hwidResetBtn').onclick = async () => {
    const close = showModal(`
      <div class="modal slide-up" style="max-width:380px">
        <h2>Request HWID Reset</h2>
        <p style="color:var(--ax-muted);font-size:14px;margin:12px 0">This sends a reset request to the admin team.</p>
        <button class="btn btn-primary" id="confirmReset" style="width:100%;margin-bottom:8px">Submit Request</button>
        <button class="btn btn-ghost" data-close style="width:100%">Cancel</button>
      </div>
    `);
    document.getElementById('confirmReset').onclick = async () => {
      const { ok, data } = await api('customer-api', { method: 'POST', body: JSON.stringify({ action: 'hwid_reset_request' }) });
      close();
      toast(ok ? (data.message || 'Request submitted') : (data.error || 'Failed'), ok ? 'success' : 'error');
      if (ok) loadDashboard();
    };
  };

  loadDashboard();
})();
