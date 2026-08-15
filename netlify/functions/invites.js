const { json, readJsonBody, initBlobs } = require('./_shared');
const { store, getJson, setJson, appendLog } = require('./_store');
const { adminOk } = require('./_auth');

function blobKey(id) {
  return `invite:${id}`;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
    const s = await store('kernel-invites');

    if (event.httpMethod === 'GET') {
      if (!(await adminOk(event))) return json(401, { error: 'Unauthorized' });
      const list = await s.list();
      const items = [];
      for (const item of list.blobs.slice(0, 500)) {
        if (!item.key.startsWith('invite:')) continue;
        const row = await getJson(s, item.key);
        if (!row) continue;
        items.push({ id: item.key.slice(7), ...row });
      }
      items.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));
      return json(200, { ok: true, items });
    }

    if (!(await adminOk(event))) return json(401, { error: 'Unauthorized' });

    if (event.httpMethod === 'POST') {
      const body = await readJsonBody(event);
      const code = body.code || 'INVITE-' + crypto.randomUUID().slice(0, 8).toUpperCase();
      const record = {
        code,
        uses: 0,
        max_uses: Number(body.max_uses) || 1,
        created_at: new Date().toISOString(),
      };
      await setJson(s, blobKey(code), record);
      await appendLog({ type: `invite_created`, code });
      return json(201, { ok: true, item: { id: code, ...record } });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });
      await s.delete(blobKey(id));
      await appendLog({ type: `invite_deleted`, code: id });
      return json(200, { ok: true, deleted: id });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Invites API failed' });
  }
};
