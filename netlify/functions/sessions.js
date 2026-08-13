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
  if (!adminOk(event)) return json(401, { error: 'Unauthorized' });

  try {
    initBlobs(event);
    const s = await store('kernel-sessions');

    if (event.httpMethod === 'GET') {
      const list = await s.list();
      const sessions = [];
      for (const item of list.blobs.slice(-200).reverse()) {
        const row = await getJson(s, item.key);
        if (row) sessions.push({ id: item.key, ...row });
      }
      return json(200, { ok: true, sessions });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { error: 'Missing id' });
      await s.delete(id);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Sessions API failed' });
  }
};
