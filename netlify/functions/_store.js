const { getStore } = require('@netlify/blobs');

async function store(name) {
  const opts = { name, consistency: 'strong' };
  if (process.env.NETLIFY_SITE_ID) opts.siteID = process.env.NETLIFY_SITE_ID;
  return getStore(opts);
}

function fallbackApp() {
  return {
    id: 'default',
    owner_id: process.env.KERNEL_DEFAULT_OWNER_ID || crypto.randomUUID(),
    app_name: process.env.KERNEL_DEFAULT_APP_NAME || 'KERNEL Loader',
    version: '1.0',
    secret: process.env.KERNEL_DEFAULT_SECRET || crypto.randomUUID().replace(/-/g, ''),
    created_at: new Date().toISOString(),
  };
}

async function getJson(s, key, fallback = null) {
  const raw = await s.get(key, { type: 'json' });
  if (raw == null) return fallback;
  return typeof raw === 'string' ? JSON.parse(raw) : raw;
}

async function setJson(s, key, value) {
  await s.setJSON(key, value);
}

async function appendLog(entry) {
  try {
    const s = await store('kernel-logs');
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    await setJson(s, id, { ...entry, id, at: new Date().toISOString() });
  } catch (err) {
    console.error('appendLog failed:', err.message);
  }
}

async function addToAppIndex(id) {
  const s = await store('kernel-apps');
  const index = await getJson(s, '__index__', { ids: [] });
  if (!index.ids.includes(id)) {
    index.ids.push(id);
    await setJson(s, '__index__', index);
  }
}

async function ensureDefaultApp() {
  try {
    const s = await store('kernel-apps');
    let app = await getJson(s, 'default');
    if (!app) {
      app = { ...fallbackApp(), id: 'default' };
      await setJson(s, 'default', app);
      await addToAppIndex('default');
    } else if (!app.id) {
      app.id = 'default';
      await setJson(s, 'default', app);
      await addToAppIndex('default');
    }
    return app;
  } catch (err) {
    console.error('ensureDefaultApp fallback:', err.message);
    return { ...fallbackApp(), id: 'default' };
  }
}

async function getApp() {
  return ensureDefaultApp();
}

async function listApps() {
  try {
    await ensureDefaultApp();
    const s = await store('kernel-apps');
    const index = await getJson(s, '__index__', { ids: ['default'] });
    const apps = [];
    for (const id of index.ids) {
      const app = await getJson(s, id);
      if (app) apps.push(app);
    }
    return apps.length ? apps : [{ ...fallbackApp(), id: 'default' }];
  } catch (err) {
    console.error('listApps fallback:', err.message);
    return [{ ...fallbackApp(), id: 'default' }];
  }
}

async function getAppById(id) {
  if (!id || id === 'default') return ensureDefaultApp();
  try {
    const s = await store('kernel-apps');
    return getJson(s, id);
  } catch (err) {
    console.error('getAppById fallback:', err.message);
    return null;
  }
}

async function findApp(ownerId, appName) {
  const apps = await listApps();
  return apps.find((a) => {
    const ownerOk = !ownerId || a.owner_id === ownerId;
    const nameOk = !appName || a.app_name === appName;
    return ownerOk && nameOk;
  }) || null;
}

async function createApp({ app_name, version = '1.0' }) {
  const s = await store('kernel-apps');
  const id = crypto.randomUUID();
  const app = {
    id,
    owner_id: crypto.randomUUID(),
    app_name: String(app_name || 'My Application').trim() || 'My Application',
    version: String(version || '1.0').trim() || '1.0',
    secret: crypto.randomUUID().replace(/-/g, ''),
    created_at: new Date().toISOString(),
  };
  await setJson(s, id, app);
  await addToAppIndex(id);
  await appendLog({ type: 'app_created', app_id: id, app_name: app.app_name });
  return app;
}

async function deleteApp(id) {
  if (id === 'default') throw new Error('Cannot delete the default application');
  const s = await store('kernel-apps');
  const existing = await getJson(s, id);
  if (!existing) throw new Error('Application not found');
  await s.delete(id);
  const index = await getJson(s, '__index__', { ids: [] });
  index.ids = index.ids.filter((item) => item !== id);
  await setJson(s, '__index__', index);
  await appendLog({ type: 'app_deleted', app_id: id, app_name: existing.app_name });
}

function licenseBlobKey(appId, licenseKey) {
  return `${appId || 'default'}:${licenseKey}`;
}

function userBlobKey(appId, userId) {
  return `${appId || 'default'}:${userId}`;
}

async function findLicense(licenseKey, appId = null) {
  const s = await store('kernel-licenses');
  const normalized = String(licenseKey || '').trim().toUpperCase();
  if (!normalized) return null;

  const candidates = [];
  if (appId) candidates.push(licenseBlobKey(appId, normalized));
  candidates.push(licenseBlobKey('default', normalized));
  candidates.push(normalized);

  for (const key of candidates) {
    const record = await getJson(s, key);
    if (record) return { blobKey: key, record, app_id: record.app_id || key.split(':')[0] || 'default' };
  }

  const list = await s.list();
  for (const item of list.blobs) {
    if (item.key.endsWith(`:${normalized}`)) {
      const record = await getJson(s, item.key);
      if (record) {
        return {
          blobKey: item.key,
          record,
          app_id: record.app_id || item.key.split(':')[0] || 'default',
        };
      }
    }
  }
  return null;
}

module.exports = {
  store,
  getJson,
  setJson,
  appendLog,
  getApp,
  listApps,
  getAppById,
  findApp,
  createApp,
  deleteApp,
  licenseBlobKey,
  userBlobKey,
  findLicense,
};
