const { json, readJsonBody, initBlobs } = require('./_shared');
const { store, getJson, setJson, appendLog } = require('./_store');

function adminOk(event) {
  const h = event.headers['x-kernel-admin-key'] || event.headers['X-Kernel-Admin-Key'];
  return h && h === process.env.KERNEL_ADMIN_PASSWORD;
}

function blobKey(type, id) {
  return `${type}:${id}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
    const body = event.httpMethod === 'GET' ? {} : await readJsonBody(event);
    const type = event.queryStringParameters?.type || body.type || 'staff';
    const allowed = ['staff', 'resellers', 'bots', 'audit', 'apikey', 'files', 'chats'];
    if (!allowed.includes(type)) return json(400, { error: 'Invalid type' });

    const s = await store('kernel-team');
    const prefix = `${type}:`;

    if (event.httpMethod === 'GET') {
      const list = await s.list();
      const items = [];
      for (const item of list.blobs.slice(0, 500)) {
        if (!item.key.startsWith(prefix)) continue;
        const row = await getJson(s, item.key);
        if (!row) continue;
        items.push({ id: item.key.slice(prefix.length), ...row });
      }
      items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      return json(200, { ok: true, type, items });
    }

    if (!adminOk(event)) return json(401, { error: 'Unauthorized' });

    if (event.httpMethod === 'POST') {
      const id = body.id || crypto.randomUUID();
      const record = {
        ...body,
        id: undefined,
        type: undefined,
        created_at: new Date().toISOString(),
      };
      await setJson(s, blobKey(type, id), record);
      await appendLog({ type: `team_${type}_created`, id });
      return json(201, { ok: true, item: { id, ...record } });
    }

    if (event.httpMethod === 'PATCH') {
      const id = body.id;
      if (!id) return json(400, { error: 'Missing id' });
      const key = blobKey(type, id);
      const existing = await getJson(s, key);
      if (!existing) return json(404, { error: 'Not found' });
      const updated = { ...existing, ...body, id: undefined, type: undefined, updated_at: new Date().toISOString() };
      await setJson(s, key, updated);
      return json(200, { ok: true, item: { id, ...updated } });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });
      await s.delete(blobKey(type, id));
      return json(200, { ok: true, deleted: id });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Team API failed' });
  }
};
