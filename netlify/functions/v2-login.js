const { json, readJsonBody } = require('./_shared');
const { store, getJson, setJson, appendLog, findLicense, userBlobKey } = require('./_store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  try {
    const body = await readJsonBody(event);
    const sessionId = body.session_id;
    if (!sessionId) return json(400, { success: false, message: 'Missing session_id' });

    const sessions = await store('kernel-sessions');
    const session = await getJson(sessions, sessionId);
    if (!session) return json(403, { success: false, message: 'Invalid session. Call init first.' });

    const appId = session.app_id || body.app_id || 'default';

    if (body.license_key) {
      const key = String(body.license_key).trim().toUpperCase();
      const found = await findLicense(key, appId);
      if (!found || found.record.revoked) {
        return json(401, { success: false, message: 'Invalid or revoked license key' });
      }
      const record = found.record;
      if (record.expires_at && new Date(record.expires_at) < new Date()) {
        return json(401, { success: false, message: 'License expired' });
      }
      record.activations = (record.activations || 0) + 1;
      record.last_hwid = body.hwid || body.sid || '';
      record.last_login = new Date().toISOString();
      await setJson(await store('kernel-licenses'), found.blobKey, record);
      await appendLog({ type: 'license_login', app_id: appId, key });

      return json(200, {
        success: true,
        message: 'License login successful',
        license: {
          license_key: key,
          subscription: record.subscription || 'Active',
          subscription_level: record.level || 1,
          expiry_date: record.expires_at || '',
          days_left: record.days_left ?? 30,
        },
      });
    }

    if (body.username && body.password) {
      const users = await store('kernel-users');
      const id = body.username.trim().toLowerCase();
      const blobKey = userBlobKey(appId, id);
      const user = await getJson(users, blobKey);
      if (!user || user.password_hash !== body.password || user.banned) {
        return json(401, { success: false, message: 'Invalid credentials' });
      }
      user.last_login = new Date().toISOString();
      user.hwid = body.hwid || body.sid || user.hwid;
      await setJson(users, blobKey, user);
      await appendLog({ type: 'user_login', app_id: appId, username: user.username });

      return json(200, {
        success: true,
        message: 'Login successful',
        user: {
          username: user.username,
          email: user.email,
          subscription: user.subscription,
        },
      });
    }

    return json(400, { success: false, message: 'Provide license_key or username+password' });
  } catch (err) {
    return json(500, { success: false, message: err.message || 'Login failed' });
  }
};
