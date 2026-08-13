const { json, readJsonBody, initBlobs } = require('./_shared');
const { store, getJson, setJson } = require('./_store');
const { adminOk } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
    const s = await store('kernel-variables');

    if (event.httpMethod === 'GET') {
      const list = await s.list();
      const vars = [];
      for (const item of list.blobs) {
        const v = await getJson(s, item.key);
        if (v) vars.push({ key: item.key, ...v });
      }
      return json(200, { ok: true, variables: vars });
    }

    if (!(await adminOk(event))) return json(401, { error: 'Unauthorized' });

    if (event.httpMethod === 'POST') {
      const body = await readJsonBody(event);
      const key = body.key?.trim();
      if (!key) return json(400, { error: 'Missing key' });
      await setJson(s, key, { value: body.value || '', updated_at: new Date().toISOString() });
      return json(201, { ok: true, key });
    }

    if (event.httpMethod === 'DELETE') {
      const key = event.queryStringParameters?.key;
      if (!key) return json(400, { error: 'Missing key' });
      await s.delete(key);
      return json(200, { ok: true });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Variables API failed' });
  }
};
