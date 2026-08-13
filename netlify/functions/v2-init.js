const { json, readJsonBody } = require('./_shared');
const { findApp, store, setJson, appendLog } = require('./_store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  try {
    const body = await readJsonBody(event);
    const app = await findApp(body.owner_id, body.app_name);
    if (!app) {
      return json(403, { success: false, message: 'Invalid owner_id or app_name' });
    }

    const sessionId = crypto.randomUUID();
    const sessions = await store('kernel-sessions');
    await setJson(sessions, sessionId, {
      app_id: app.id,
      owner_id: app.owner_id,
      app_name: app.app_name,
      created_at: new Date().toISOString(),
      ip: event.headers['x-forwarded-for'] || '',
    });

    await appendLog({ type: 'init', app_id: app.id, session_id: sessionId });

    return json(200, {
      success: true,
      message: 'Initialized',
      session_id: sessionId,
      app: { name: app.app_name, version: app.version },
    });
  } catch (err) {
    return json(500, { success: false, message: err.message || 'Init failed' });
  }
};
