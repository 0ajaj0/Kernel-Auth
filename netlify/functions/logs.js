const { json, initBlobs } = require('./_shared');
const { store, getJson } = require('./_store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
    const s = await store('kernel-logs');
    const list = await s.list();
    const logs = [];
    for (const item of list.blobs.slice(-100).reverse()) {
      const e = await getJson(s, item.key);
      if (e) logs.push(e);
    }
    return json(200, { ok: true, logs });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Logs API failed' });
  }
};
