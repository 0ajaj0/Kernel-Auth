const { json } = require('./_shared');
const { store, getJson } = require('./_store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  const s = await store('kernel-logs');
  const list = await s.list();
  const logs = [];
  for (const item of list.blobs.slice(-100).reverse()) {
    const e = await getJson(s, item.key);
    if (e) logs.push(e);
  }
  return json(200, { ok: true, logs });
};
