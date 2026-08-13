const { json, readJsonBody, initBlobs } = require('./_shared');
const { findApp, store, getJson, setJson, appendLog, findLicense, userBlobKey } = require('./_store');

function endpointFromEvent(event) {
  const q = event.queryStringParameters?.endpoint;
  if (q) return String(q).toLowerCase();
  const raw = event.rawUrl || event.path || '';
  const m = raw.match(/\/api\/v1\/([^/?]+(?:\/[^/?]+)?)/i);
  return m ? m[1].toLowerCase() : '';
}

async function getSession(sessionId) {
  if (!sessionId) return null;
  return getJson(await store('kernel-sessions'), sessionId);
}

function ok(message, extra = {}) {
  return json(200, { success: true, message: message || 'Success', ...extra });
}

function fail(status, message) {
  return json(status, { success: false, message: message || 'Failed' });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
    const ep = endpointFromEvent(event);
    const body = event.httpMethod === 'GET' ? {} : await readJsonBody(event);

    if (ep === 'auth/init' && event.httpMethod === 'POST') {
      const app = await findApp(body.owner_id, body.app_name);
      if (!app) return fail(403, 'Invalid application');
      const sessionId = crypto.randomUUID();
      await setJson(await store('kernel-sessions'), sessionId, {
        app_id: app.id, owner_id: app.owner_id, app_name: app.app_name,
        created_at: new Date().toISOString(),
      });
      return ok('Session initialized', { session_id: sessionId });
    }

    if (ep === 'auth/login' && event.httpMethod === 'POST') {
      const session = await getSession(body.session_id);
      if (!session) return fail(403, 'Invalid session');
      const appId = session.app_id || 'default';

      if (body.license_key) {
        const key = String(body.license_key).trim().toUpperCase();
        const found = await findLicense(key, appId);
        if (!found || found.record.revoked) return fail(401, 'Invalid license');
        return ok('License authenticated', { license_key: key, subscription: found.record.subscription || 'Active' });
      }

      const users = await store('kernel-users');
      const u = await getJson(users, userBlobKey(appId, String(body.username || '').trim().toLowerCase()));
      if (!u || u.password_hash !== body.password) return fail(401, 'Invalid credentials');
      return ok('Login successful', { username: u.username, email: u.email, subscription: u.subscription });
    }

    if (ep === 'auth/hwid-check' && event.httpMethod === 'POST') {
      const hwid = String(body.hwid || body.sid || '').trim();
      if (!hwid) return fail(400, 'HWID required');
      const devices = await store('kernel-devices');
      const list = await devices.list();
      const appId = body.app_id || 'default';
      for (const item of list.blobs) {
        if (!item.key.startsWith(appId + ':')) continue;
        const d = await getJson(devices, item.key);
        if (d && d.hwid === hwid && d.status !== 'banned') {
          return ok('HWID authorized', { authorized: true, device_id: item.key.split(':').pop() });
        }
      }
      return ok('HWID not registered', { authorized: false });
    }

    if (ep === 'var/get' && event.httpMethod === 'GET') {
      const key = event.queryStringParameters?.key;
      const vars = await store('kernel-variables');
      if (key) {
        const v = await getJson(vars, key);
        return ok('Variable fetched', { key, value: v?.value ?? null });
      }
      const list = await vars.list();
      const result = {};
      for (const item of list.blobs.slice(0, 100)) {
        const v = await getJson(vars, item.key);
        if (v?.key) result[v.key] = v.value;
      }
      return ok('Variables loaded', { variables: result });
    }

    return fail(404, 'Unknown v1 endpoint: ' + ep);
  } catch (err) {
    return fail(500, err.message || 'V1 API failed');
  }
};
