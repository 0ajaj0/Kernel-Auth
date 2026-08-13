const { getStore } = require('@netlify/blobs');

async function store(name) {
  return getStore({ name, consistency: 'strong' });
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
  const s = await store('kernel-logs');
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  await setJson(s, id, { ...entry, id, at: new Date().toISOString() });
}

async function getApp() {
  const s = await store('kernel-apps');
  let app = await getJson(s, 'default');
  if (!app) {
    app = {
      owner_id: crypto.randomUUID(),
      app_name: 'KERNEL Loader',
      version: '1.0',
      secret: crypto.randomUUID().replace(/-/g, ''),
      created_at: new Date().toISOString(),
    };
    await setJson(s, 'default', app);
  }
  return app;
}

module.exports = { store, getJson, setJson, appendLog, getApp };
