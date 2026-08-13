const { json, initBlobs } = require('./_shared');
const { store, getJson } = require('./_store');

function adminOk(event) {
  const h = event.headers['x-kernel-admin-key'] || event.headers['X-Kernel-Admin-Key'];
  return h && h === process.env.KERNEL_ADMIN_PASSWORD;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
    const s = await store('kernel-logs');

    if (event.httpMethod === 'GET') {
      const type = event.queryStringParameters?.type || '';
      const list = await s.list();
      const logs = [];
      for (const item of list.blobs.slice(-200).reverse()) {
        const e = await getJson(s, item.key);
        if (!e) continue;
        if (type && e.type !== type) continue;
        logs.push(e);
      }
      return json(200, { ok: true, logs });
    }

    if (event.httpMethod === 'DELETE') {
      if (!adminOk(event)) return json(401, { error: 'Unauthorized' });
      const all = event.queryStringParameters?.all === '1';
      if (all) {
        const list = await s.list();
        for (const item of list.blobs) await s.delete(item.key);
        return json(200, { ok: true, deleted: list.blobs.length });
      }
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id or all=1' });
      await s.delete(id);
      return json(200, { ok: true, deleted: id });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Logs API failed' });
  }
};
