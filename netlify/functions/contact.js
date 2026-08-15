const { json, readJsonBody, initBlobs } = require('./_shared');
const { store, setJson } = require('./_store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    initBlobs(event);
    const body = await readJsonBody(event);
    
    if (!body.name || !body.email || !body.message) {
      return json(400, { error: 'Missing fields' });
    }

    const s = await store('kernel-contacts');
    const id = Date.now() + '-' + crypto.randomUUID().slice(0, 8);
    
    const record = {
      name: body.name,
      email: body.email,
      message: body.message,
      created_at: new Date().toISOString(),
    };

    await setJson(s, `msg:${id}`, record);

    return json(201, { ok: true, message: 'Message saved' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Contact API failed' });
  }
};
