const { getStore } = require('@netlify/blobs');
const { json, env, readJsonBody } = require('./_shared');

function isAdmin(event) {
  const header = event.headers['x-kernel-admin-key'] || event.headers['X-Kernel-Admin-Key'];
  const adminPass = env('KERNEL_ADMIN_PASSWORD');
  return adminPass && header === adminPass;
}

function normalizeKey(key) {
  return String(key || '').trim().toUpperCase();
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  if (!isAdmin(event)) {
    return json(401, { error: 'Unauthorized admin request' });
  }

  const store = await getStore({ name: 'kernel-licenses', consistency: 'strong' });

  if (event.httpMethod === 'GET') {
    const list = await store.list();
    const keys = [];
    for (const item of list.blobs.slice(0, 100)) {
      const data = await store.get(item.key, { type: 'json' });
      if (data) keys.push({ key: item.key, ...data });
    }
    return json(200, { ok: true, keys });
  }

  if (event.httpMethod === 'POST') {
    const body = await readJsonBody(event);
    const licenseKey = normalizeKey(body.license_key || body.key);
    if (!licenseKey) return json(400, { error: 'Missing license_key' });

    const record = {
      subscription: body.subscription || 'KERNEL Premium',
      product: body.product || 'all',
      level: body.level || 'premium',
      products: body.products || ['Counter-Strike 2', 'Apex Legends', 'Fortnite', 'PUBG'],
      max_activations: body.max_activations ?? 1,
      activations: 0,
      expires_at: body.expires_at || null,
      revoked: false,
      created_at: new Date().toISOString(),
    };

    await store.setJSON(licenseKey, record);
    return json(201, { ok: true, license_key: licenseKey, record });
  }

  if (event.httpMethod === 'PATCH') {
    const body = await readJsonBody(event);
    const key = normalizeKey(body.key || body.license_key);
    if (!key) return json(400, { error: 'Missing key' });
    const existing = await store.get(key, { type: 'json' });
    if (!existing) return json(404, { error: 'Key not found' });
    const record = typeof existing === 'string' ? JSON.parse(existing) : existing;
    if (typeof body.revoked === 'boolean') record.revoked = body.revoked;
    if (body.subscription) record.subscription = body.subscription;
    await store.setJSON(key, record);
    return json(200, { ok: true, key, record });
  }

  if (event.httpMethod === 'DELETE') {
    const key = normalizeKey(event.queryStringParameters?.key);
    if (!key) return json(400, { error: 'Missing key query param' });
    await store.delete(key);
    return json(200, { ok: true, deleted: key });
  }

  return json(405, { error: 'Method not allowed' });
};
