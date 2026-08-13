const { json, readJsonBody, initBlobs } = require('./_shared');
const { store, getJson, setJson, appendLog } = require('./_store');

function adminOk(event) {
  const h = event.headers['x-kernel-admin-key'] || event.headers['X-Kernel-Admin-Key'];
  return h && h === process.env.KERNEL_ADMIN_PASSWORD;
}

function appIdFrom(event, body = {}) {
  return event.queryStringParameters?.app_id || body.app_id || 'default';
}

function blobKey(appId, id) {
  return `${appId}:${id}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
    const body = event.httpMethod === 'GET' ? {} : await readJsonBody(event);
    const appId = appIdFrom(event, body);
    const s = await store('kernel-subscriptions');
    const prefix = `${appId}:`;

    if (event.httpMethod === 'GET') {
      const list = await s.list();
      const subs = [];
      for (const item of list.blobs.slice(0, 200)) {
        if (!item.key.startsWith(prefix)) continue;
        const sub = await getJson(s, item.key);
        if (!sub) continue;
        subs.push({ id: item.key.slice(prefix.length), ...sub, app_id: appId });
      }
      return json(200, { ok: true, app_id: appId, subscriptions: subs });
    }

    if (!adminOk(event)) return json(401, { error: 'Unauthorized' });

    if (event.httpMethod === 'POST') {
      const name = String(body.name || '').trim();
      if (!name) return json(400, { error: 'Subscription name required' });
      const id = body.id || crypto.randomUUID();
      const record = {
        name,
        level: Number(body.level) || 1,
        duration_days: Number(body.duration_days) || 30,
        price: body.price || '0',
        features: body.features || '',
        active: body.active !== false,
        created_at: new Date().toISOString(),
        app_id: appId,
      };
      await setJson(s, blobKey(appId, id), record);
      await appendLog({ type: 'subscription_created', app_id: appId, name });
      return json(201, { ok: true, subscription: { id, ...record } });
    }

    if (event.httpMethod === 'PATCH') {
      const id = body.id;
      if (!id) return json(400, { error: 'Missing id' });
      const key = blobKey(appId, id);
      const existing = await getJson(s, key);
      if (!existing) return json(404, { error: 'Not found' });
      const updated = { ...existing, ...body, id: undefined, app_id: appId, updated_at: new Date().toISOString() };
      delete updated.id;
      await setJson(s, key, updated);
      return json(200, { ok: true, subscription: { id, ...updated } });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });
      await s.delete(blobKey(appId, id));
      return json(200, { ok: true, deleted: id });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Subscriptions API failed' });
  }
};
