const { json, readJsonBody } = require('./_shared');
const { getApp, store, setJson, appendLog } = require('./_store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  const body = await readJsonBody(event);
  const app = await getApp();

  if (body.owner_id && body.owner_id !== app.owner_id) {
    return json(403, { success: false, message: 'Invalid owner_id' });
  }
  if (body.app_name && body.app_name !== app.app_name) {
    return json(403, { success: false, message: 'Invalid app_name' });
  }

  const sessionId = crypto.randomUUID();
  const sessions = await store('kernel-sessions');
  await setJson(sessions, sessionId, {
    created_at: new Date().toISOString(),
    ip: event.headers['x-forwarded-for'] || '',
  });

  await appendLog({ type: 'init', session_id: sessionId });

  return json(200, {
    success: true,
    message: 'Initialized',
    session_id: sessionId,
    app: { name: app.app_name, version: app.version },
  });
};
