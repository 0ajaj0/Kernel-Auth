const { json, readJsonBody } = require('./_shared');
const { store, getJson, setJson, appendLog } = require('./_store');

function adminOk(event) {
  const h = event.headers['x-kernel-admin-key'] || event.headers['X-Kernel-Admin-Key'];
  return h && h === process.env.KERNEL_ADMIN_PASSWORD;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  if (!adminOk(event) && event.httpMethod !== 'GET') {
    return json(401, { error: 'Unauthorized' });
  }

  const s = await store('kernel-users');

  if (event.httpMethod === 'GET') {
    const list = await s.list();
    const users = [];
    for (const item of list.blobs.slice(0, 200)) {
      const u = await getJson(s, item.key);
      if (u) users.push({ id: item.key, ...u });
    }
    return json(200, { ok: true, users });
  }

  if (event.httpMethod === 'POST') {
    const body = await readJsonBody(event);
    const id = body.username?.trim().toLowerCase() || crypto.randomUUID();
    const record = {
      username: body.username || id,
      email: body.email || '',
      password_hash: body.password || '',
      subscription: body.subscription || 'Standard',
      hwid: body.hwid || '',
      banned: false,
      created_at: new Date().toISOString(),
      provider: body.provider || '',
      provider_id: body.provider_id || '',
    };
    await setJson(s, id, record);
    await appendLog({ type: 'user_created', username: record.username });
    return json(201, { ok: true, id, user: record });
  }

  if (event.httpMethod === 'PATCH') {
    const body = await readJsonBody(event);
    const id = body.id || event.queryStringParameters?.id;
    if (!id) return json(400, { error: 'Missing id' });
    const existing = await getJson(s, id);
    if (!existing) return json(404, { error: 'User not found' });
    if (typeof body.banned === 'boolean') existing.banned = body.banned;
    if (body.subscription) existing.subscription = body.subscription;
    await setJson(s, id, existing);
    await appendLog({ type: 'user_updated', id, banned: existing.banned });
    return json(200, { ok: true, user: { id, ...existing } });
  }

  if (event.httpMethod === 'DELETE') {
    const id = event.queryStringParameters?.id;
    if (!id) return json(400, { error: 'Missing id' });
    await s.delete(id);
    await appendLog({ type: 'user_deleted', id });
    return json(200, { ok: true });
  }

  return json(405, { error: 'Method not allowed' });
};
