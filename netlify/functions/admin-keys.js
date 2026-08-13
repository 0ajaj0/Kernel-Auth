const { json, env, readJsonBody, initBlobs } = require('./_shared');
const { store, getJson, setJson, appendLog, licenseBlobKey, findLicense } = require('./_store');

function isAdmin(event) {
  const header = event.headers['x-kernel-admin-key'] || event.headers['X-Kernel-Admin-Key'];
  const adminPass = env('KERNEL_ADMIN_PASSWORD');
  return adminPass && header === adminPass;
}

function normalizeKey(key) {
  return String(key || '').trim().toUpperCase();
}

function appIdFrom(event, body = {}) {
  return event.queryStringParameters?.app_id
    || body.app_id
    || 'default';
}

function displayKey(blobKey) {
  const parts = String(blobKey).split(':');
  return parts.length > 1 ? parts.slice(1).join(':') : blobKey;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  if (!isAdmin(event)) {
    return json(401, { error: 'Unauthorized admin request' });
  }

  try {
    initBlobs(event);
    const body = event.httpMethod === 'GET' ? {} : await readJsonBody(event);
    const appId = appIdFrom(event, body);
    const s = await store('kernel-licenses');

    if (event.httpMethod === 'GET') {
      const list = await s.list();
      const prefix = `${appId}:`;
      const keys = [];
      for (const item of list.blobs.slice(0, 500)) {
        if (appId !== 'all' && !item.key.startsWith(prefix) && item.key.includes(':')) continue;
        if (appId !== 'all' && !item.key.includes(':') && appId !== 'default') continue;
        const data = await getJson(s, item.key);
        if (!data) continue;
        if (appId !== 'all') {
          if (item.key.startsWith(prefix)) {
            keys.push({ key: displayKey(item.key), blob_key: item.key, app_id: appId, ...data });
          } else if (appId === 'default' && !item.key.includes(':')) {
            keys.push({ key: item.key, blob_key: item.key, app_id: 'default', ...data });
          }
        } else {
          keys.push({
            key: displayKey(item.key),
            blob_key: item.key,
            app_id: data.app_id || (item.key.includes(':') ? item.key.split(':')[0] : 'default'),
            ...data,
          });
        }
      }
      return json(200, { ok: true, app_id: appId, keys });
    }

    if (event.httpMethod === 'POST') {
      const licenseKey = normalizeKey(body.license_key || body.key);
      if (!licenseKey) return json(400, { error: 'Missing license_key' });

      const blobKey = licenseBlobKey(appId, licenseKey);
      const record = {
        app_id: appId,
        subscription: body.subscription || 'KERNEL Premium',
        product: body.product || 'all',
        level: body.level || 'premium',
        products: body.products || ['Counter-Strike 2', 'Apex Legends', 'Fortnite', 'PUBG'],
        max_activations: body.max_activations ?? 999999,
        activations: 0,
        expires_at: body.expires_at || null,
        revoked: false,
        created_at: new Date().toISOString(),
      };

      await setJson(s, blobKey, record);
      await appendLog({ type: 'license_created', app_id: appId, key: licenseKey });
      return json(201, { ok: true, app_id: appId, license_key: licenseKey, record });
    }

    if (event.httpMethod === 'PATCH') {
      const licenseKey = normalizeKey(body.key || body.license_key);
      if (!licenseKey) return json(400, { error: 'Missing key' });
      const found = await findLicense(licenseKey, appId);
      if (!found) return json(404, { error: 'Key not found' });
      const record = found.record;
      if (typeof body.revoked === 'boolean') record.revoked = body.revoked;
      if (body.subscription) record.subscription = body.subscription;
      await setJson(s, found.blobKey, record);
      return json(200, { ok: true, key: licenseKey, record });
    }

    if (event.httpMethod === 'DELETE') {
      const licenseKey = normalizeKey(event.queryStringParameters?.key);
      if (!licenseKey) return json(400, { error: 'Missing key query param' });
      const found = await findLicense(licenseKey, appId);
      if (!found) return json(404, { error: 'Key not found' });
      await s.delete(found.blobKey);
      await appendLog({ type: 'license_deleted', app_id: appId, key: licenseKey });
      return json(200, { ok: true, deleted: licenseKey });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'License API failed' });
  }
};
