const { json, readJsonBody } = require('./_shared');
const { store, getJson, setJson, appendLog, userBlobKey } = require('./_store');

function adminOk(event) {
  const h = event.headers['x-kernel-admin-key'] || event.headers['X-Kernel-Admin-Key'];
  return h && h === process.env.KERNEL_ADMIN_PASSWORD;
}

function appIdFrom(event, body = {}) {
  return event.queryStringParameters?.app_id || body.app_id || 'default';
}

function displayUserId(blobKey) {
  const parts = String(blobKey).split(':');
  return parts.length > 1 ? parts.slice(1).join(':') : blobKey;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    const body = event.httpMethod === 'GET' ? {} : await readJsonBody(event);
    const appId = appIdFrom(event, body);
    const s = await store('kernel-users');

    if (event.httpMethod === 'GET') {
      const list = await s.list();
      const prefix = `${appId}:`;
      const users = [];
      for (const item of list.blobs.slice(0, 500)) {
        if (!item.key.startsWith(prefix) && !(appId === 'default' && !item.key.includes(':'))) continue;
        const u = await getJson(s, item.key);
        if (!u) continue;
        users.push({
          id: displayUserId(item.key),
          blob_key: item.key,
          app_id: u.app_id || appId,
          ...u,
        });
      }
      return json(200, { ok: true, app_id: appId, users });
    }

    if (!adminOk(event)) return json(401, { error: 'Unauthorized' });

    if (event.httpMethod === 'POST') {
      const username = body.username?.trim();
      const id = username?.toLowerCase() || crypto.randomUUID();
      const blobKey = userBlobKey(appId, id);
      const record = {
        app_id: appId,
        username: username || id,
        email: body.email || '',
        password_hash: body.password || '',
        subscription: body.subscription || 'Standard',
        hwid: body.hwid || '',
        banned: false,
        created_at: new Date().toISOString(),
        provider: body.provider || '',
        provider_id: body.provider_id || '',
      };
      await setJson(s, blobKey, record);
      await appendLog({ type: 'user_created', app_id: appId, username: record.username });
      return json(201, { ok: true, app_id: appId, id, user: record });
    }

    if (event.httpMethod === 'PATCH') {
      const id = body.id || event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });
      const blobKey = userBlobKey(appId, id);
      const existing = await getJson(s, blobKey);
      if (!existing) return json(404, { error: 'User not found' });
      if (typeof body.banned === 'boolean') existing.banned = body.banned;
      if (body.subscription) existing.subscription = body.subscription;
      await setJson(s, blobKey, existing);
      await appendLog({ type: 'user_updated', app_id: appId, id, banned: existing.banned });
      return json(200, { ok: true, user: { id, ...existing } });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });
      const blobKey = userBlobKey(appId, id);
      await s.delete(blobKey);
      await appendLog({ type: 'user_deleted', app_id: appId, id });
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Users API failed' });
  }
};
