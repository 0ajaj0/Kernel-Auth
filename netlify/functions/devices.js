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
    const s = await store('kernel-devices');
    const prefix = `${appId}:`;

    if (event.httpMethod === 'GET') {
      const list = await s.list();
      const devices = [];
      for (const item of list.blobs.slice(0, 500)) {
        if (!item.key.startsWith(prefix)) continue;
        const d = await getJson(s, item.key);
        if (!d) continue;
        devices.push({ id: item.key.slice(prefix.length), ...d, app_id: appId });
      }
      return json(200, { ok: true, app_id: appId, devices });
    }

    if (!adminOk(event)) return json(401, { error: 'Unauthorized' });

    if (event.httpMethod === 'POST') {
      const hwid = String(body.hwid || body.system_id || '').trim();
      if (!hwid) return json(400, { error: 'HWID / System ID required' });
      const id = body.id || crypto.randomUUID();
      const record = {
        hwid,
        username: body.username || '',
        ip: body.ip || '',
        device_type: body.device_type || 'motherboard',
        status: body.status || 'active',
        created_at: new Date().toISOString(),
        app_id: appId,
      };
      await setJson(s, blobKey(appId, id), record);
      await appendLog({ type: 'device_added', app_id: appId, hwid });
      return json(201, { ok: true, device: { id, ...record } });
    }

    if (event.httpMethod === 'PATCH') {
      const id = body.id;
      if (!id) return json(400, { error: 'Missing device id' });
      const key = blobKey(appId, id);
      const existing = await getJson(s, key);
      if (!existing) return json(404, { error: 'Device not found' });
      const updated = {
        ...existing,
        ...(body.status != null ? { status: body.status } : {}),
        ...(body.username != null ? { username: body.username } : {}),
        updated_at: new Date().toISOString(),
      };
      await setJson(s, key, updated);
      return json(200, { ok: true, device: { id, ...updated } });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });
      await s.delete(blobKey(appId, id));
      await appendLog({ type: 'device_deleted', app_id: appId, id });
      return json(200, { ok: true, deleted: id });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Devices API failed' });
  }
};
