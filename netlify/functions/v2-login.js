const { json, readJsonBody } = require('./_shared');
const { store, getJson, setJson, appendLog } = require('./_store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'POST only' });

  const body = await readJsonBody(event);
  const sessionId = body.session_id;
  if (!sessionId) return json(400, { success: false, message: 'Missing session_id' });

  const sessions = await store('kernel-sessions');
  const session = await getJson(sessions, sessionId);
  if (!session) return json(403, { success: false, message: 'Invalid session. Call init first.' });

  // License key login
  if (body.license_key) {
    const key = String(body.license_key).trim().toUpperCase();
    const licenses = await store('kernel-licenses');
    const record = await getJson(licenses, key);
    if (!record || record.revoked) {
      return json(401, { success: false, message: 'Invalid or revoked license key' });
    }
    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      return json(401, { success: false, message: 'License expired' });
    }
    record.activations = (record.activations || 0) + 1;
    record.last_hwid = body.hwid || body.sid || '';
    record.last_login = new Date().toISOString();
    await setJson(licenses, key, record);
    await appendLog({ type: 'license_login', key });

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

  // Username/password login
  if (body.username && body.password) {
    const users = await store('kernel-users');
    const id = body.username.trim().toLowerCase();
    const user = await getJson(users, id);
    if (!user || user.password_hash !== body.password || user.banned) {
      return json(401, { success: false, message: 'Invalid credentials' });
    }
    user.last_login = new Date().toISOString();
    user.hwid = body.hwid || body.sid || user.hwid;
    await setJson(users, id, user);
    await appendLog({ type: 'user_login', username: user.username });

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
};
