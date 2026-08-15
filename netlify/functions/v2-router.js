const { json, readJsonBody, initBlobs } = require('./_shared');
const {
  findApp,
  store,
  getJson,
  setJson,
  appendLog,
  findLicense,
  userBlobKey,
  licenseBlobKey,
} = require('./_store');

function endpointFromEvent(event) {
  const q = event.queryStringParameters?.endpoint;
  if (q) return String(q).toLowerCase();
  const raw = event.rawUrl || event.path || '';
  const match = raw.match(/\/api\/v2\/([^/?]+)/i);
  if (match) return match[1].toLowerCase();
  return '';
}

async function getSession(sessionId) {
  if (!sessionId) return null;
  const sessions = await store('kernel-sessions');
  return getJson(sessions, sessionId);
}

function authlyxOk(message, extra = {}) {
  return json(200, { success: true, message: message || 'Success', ...extra });
}

function authlyxFail(status, message, extra = {}) {
  return json(status, { success: false, message: message || 'Request failed', ...extra });
}

async function handleInit(body, event) {
  const app = await findApp(body.owner_id, body.app_name);
  if (!app) return authlyxFail(403, 'Invalid owner_id or app_name');
  if (app.secret && body.secret && app.secret !== body.secret) {
    return authlyxFail(403, 'Invalid application secret');
  }

  const settings = app.settings || {};
  if (settings.disable_app) return authlyxFail(403, 'Application is disabled');

  const allowed = settings.version_whitelist || [app.version || '1.0'];
  if (body.version && allowed.length && !allowed.includes(body.version)) {
    return authlyxFail(403, 'Client version does not match server version.', { code: 'VERSION_MISMATCH' });
  }

  const sessionId = crypto.randomUUID();
  const sessions = await store('kernel-sessions');
  await setJson(sessions, sessionId, {
    app_id: app.id,
    owner_id: app.owner_id,
    app_name: app.app_name,
    created_at: new Date().toISOString(),
    ip: event.headers['x-forwarded-for'] || body.ip || '',
  });
  await appendLog({ type: 'v2_init', app_id: app.id, session_id: sessionId });
  return authlyxOk('Initialized', { session_id: sessionId });
}

async function handleLogin(body) {
  const session = await getSession(body.session_id);
  if (!session) return authlyxFail(403, 'Invalid session. Call init first.');
  const appId = session.app_id || 'default';

  if (body.license_key) {
    const key = String(body.license_key).trim().toUpperCase();
    const found = await findLicense(key, appId);
    if (!found || found.record.revoked) return authlyxFail(401, 'Invalid or revoked license key');
    const record = found.record;
    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      return authlyxFail(401, 'License expired');
    }
    record.activations = (record.activations || 0) + 1;
    record.last_hwid = body.sid || body.hwid || '';
    record.last_login = new Date().toISOString();
    await setJson(await store('kernel-licenses'), found.blobKey, record);
    return authlyxOk('License login successful', {
      license: {
        license_key: key,
        subscription: record.subscription || 'Active',
        subscription_level: String(record.level || 1),
        expiry_date: record.expires_at || '',
        days_left: record.days_left ?? 30,
      },
    });
  }

  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  if (!username || !password) return authlyxFail(400, 'Provide username and password');

  const users = await store('kernel-users');
  const blobKey = userBlobKey(appId, username);
  const user = await getJson(users, blobKey);
  if (!user || user.password_hash !== password || user.banned) {
    return authlyxFail(401, 'Invalid credentials');
  }
  if (user.expires_at && new Date(user.expires_at) < new Date()) {
    return authlyxFail(401, 'Account expired');
  }
  user.last_login = new Date().toISOString();
  user.hwid = body.sid || body.hwid || user.hwid;
  await setJson(users, blobKey, user);
  return authlyxOk('Login successful', {
    username: user.username,
    email: user.email || '',
    subscription: user.subscription || 'Standard',
    expiry_date: user.expires_at || '',
    days_left: user.duration_days || 0,
  });
}

async function handleRegister(body) {
  const session = await getSession(body.session_id);
  if (!session) return authlyxFail(403, 'Invalid session. Call init first.');
  const appId = session.app_id || 'default';
  const key = String(body.key || body.license_key || '').trim().toUpperCase();
  const username = String(body.username || '').trim().toLowerCase();
  const password = String(body.password || '');
  const email = String(body.email || '').trim();

  if (!key || !username || !password) return authlyxFail(400, 'Missing registration fields');

  const found = await findLicense(key, appId);
  if (!found || found.record.revoked) return authlyxFail(401, 'Invalid or revoked license key');

  const users = await store('kernel-users');
  const blobKey = userBlobKey(appId, username);
  if (await getJson(users, blobKey)) return authlyxFail(409, 'Username already exists');

  const record = found.record;
  const user = {
    username,
    email,
    password_hash: password,
    subscription: record.subscription || 'Standard',
    duration_days: record.duration_days || 30,
    expires_at: record.expires_at || null,
    created_at: new Date().toISOString(),
    app_id: appId,
    hwid: body.sid || body.hwid || '',
  };
  await setJson(users, blobKey, user);
  record.bound_username = username;
  record.bound_email = email || record.bound_email || '';
  await setJson(await store('kernel-licenses'), found.blobKey, record);
  await appendLog({ type: 'v2_register', app_id: appId, username });

  return authlyxOk('Registration successful', {
    username,
    email,
    subscription: user.subscription,
    expiry_date: user.expires_at || '',
    days_left: user.duration_days || 0,
  });
}

async function handleLicenses(body) {
  return handleLogin({ ...body, license_key: body.license_key || body.key });
}

async function handleExtend(body) {
  const session = await getSession(body.session_id);
  if (!session) return authlyxFail(403, 'Invalid session. Call init first.');
  const appId = session.app_id || 'default';
  const username = String(body.username || '').trim().toLowerCase();
  const key = String(body.license_key || body.key || '').trim().toUpperCase();
  if (!username || !key) return authlyxFail(400, 'Missing username or license key');

  const found = await findLicense(key, appId);
  if (!found || found.record.revoked) return authlyxFail(401, 'Invalid or revoked license key');

  const users = await store('kernel-users');
  const blobKey = userBlobKey(appId, username);
  const user = await getJson(users, blobKey);
  if (!user) return authlyxFail(404, 'User not found');

  const record = found.record;
  user.subscription = record.subscription || user.subscription;
  if (record.duration_days) user.duration_days = record.duration_days;
  if (record.expires_at) user.expires_at = record.expires_at;
  user.updated_at = new Date().toISOString();
  await setJson(users, blobKey, user);
  record.bound_username = username;
  await setJson(await store('kernel-licenses'), found.blobKey, record);
  await appendLog({ type: 'v2_extend', app_id: appId, username, key });

  return authlyxOk('Subscription extended', {
    username,
    subscription: user.subscription,
    expiry_date: user.expires_at || '',
    days_left: user.duration_days || 0,
  });
}

async function handleValidateSession(body) {
  const session = await getSession(body.session_id);
  if (!session) return authlyxFail(403, 'Invalid session', { valid: 'false' });
  return authlyxOk('Session valid', { valid: 'true' });
}

async function handleVariables(body, event) {
  const session = await getSession(body.session_id);
  if (!session) return authlyxFail(403, 'Invalid session');
  const vars = await store('kernel-variables');
  const list = await vars.list();
  const result = {};
  for (const item of list.blobs.slice(0, 100)) {
    const v = await getJson(vars, item.key);
    if (v?.key) result[v.key] = v.value;
  }
  return authlyxOk('Variables loaded', { variables: result });
}

async function handleLogs(body) {
  await appendLog({
    type: 'client_log',
    message: body.message || body.log || '',
    level: body.level || 'info',
    app_id: body.app_id,
  });
  return authlyxOk('Log recorded');
}

async function handleChangePassword(body) {
  const session = await getSession(body.session_id);
  if (!session) return authlyxFail(403, 'Invalid session');
  const appId = session.app_id || 'default';
  const username = String(body.username || '').trim().toLowerCase();
  const oldPassword = String(body.old_password || '');
  const newPassword = String(body.new_password || '');

  if (!username || !oldPassword || !newPassword) return authlyxFail(400, 'Missing fields');

  const users = await store('kernel-users');
  const blobKey = userBlobKey(appId, username);
  const user = await getJson(users, blobKey);

  if (!user || user.password_hash !== oldPassword) {
    return authlyxFail(401, 'Invalid credentials');
  }

  user.password_hash = newPassword;
  user.updated_at = new Date().toISOString();
  await setJson(users, blobKey, user);
  await appendLog({ type: 'password_changed', app_id: appId, username });

  return authlyxOk('Password changed successfully');
}

async function handleDeviceAuth(body, event) {
  const session = await getSession(body.session_id);
  if (!session) return authlyxFail(403, 'Invalid session');
  const appId = session.app_id || 'default';
  const hwid = String(body.hwid || body.sid || '').trim();
  const ip = event.headers['x-forwarded-for'] || body.ip || '';
  
  if (!hwid) return authlyxFail(400, 'Missing HWID');

  const devices = await store('kernel-devices');
  const list = await devices.list();
  
  let found = false;
  for (const item of list.blobs) {
    if (!item.key.startsWith(appId + ':')) continue;
    const d = await getJson(devices, item.key);
    if (d && d.hwid === hwid) {
      if (d.status === 'banned') return authlyxFail(403, 'Device is banned');
      found = true;
      break;
    }
  }

  if (!found) {
    const id = crypto.randomUUID();
    await setJson(devices, `${appId}:${id}`, {
      id,
      hwid,
      ip,
      app_id: appId,
      status: 'active',
      created_at: new Date().toISOString()
    });
    await appendLog({ type: 'device_registered', app_id: appId, hwid });
  }

  return authlyxOk('Device authorized', { authorized: true });
}

async function handleVariablesSet(body) {
  const session = await getSession(body.session_id);
  if (!session) return authlyxFail(403, 'Invalid session');
  
  const key = String(body.key || '').trim();
  const value = String(body.value || '');
  if (!key) return authlyxFail(400, 'Missing key');

  const vars = await store('kernel-variables');
  await setJson(vars, key, {
    key,
    value,
    secret: body.secret || false,
    updated_at: new Date().toISOString()
  });

  return authlyxOk('Variable saved');
}

async function handleChatsGet(body) {
  const session = await getSession(body.session_id);
  if (!session) return authlyxFail(403, 'Invalid session');

  const s = await store('kernel-team');
  const prefix = 'chats:';
  const list = await s.list();
  const items = [];
  
  for (const item of list.blobs.slice(0, 100)) {
    if (!item.key.startsWith(prefix)) continue;
    const row = await getJson(s, item.key);
    if (row) items.push(row);
  }
  
  items.sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
  return authlyxOk('Chats loaded', { chats: items });
}

async function handleChatsSend(body) {
  const session = await getSession(body.session_id);
  if (!session) return authlyxFail(403, 'Invalid session');
  
  const message = String(body.message || '').trim();
  const user = String(body.username || body.user || 'Unknown User');
  if (!message) return authlyxFail(400, 'Message cannot be empty');

  const s = await store('kernel-team');
  const id = crypto.randomUUID();
  const record = {
    id,
    user,
    message,
    created_at: new Date().toISOString()
  };
  
  await setJson(s, `chats:${id}`, record);
  return authlyxOk('Message sent', { chat: record });
}

async function handleBlacklistCheck(body, event) {
  const session = await getSession(body.session_id);
  if (!session) return authlyxFail(403, 'Invalid session');
  const appId = session.app_id || 'default';
  
  const ip = event.headers['x-forwarded-for'] || body.ip || '';
  const hwid = String(body.hwid || body.sid || '').trim();

  const policiesStore = await store('kernel-policies');
  const policies = await getJson(policiesStore, appId) || {};
  
  if (ip && (policies.ip_blacklist || []).includes(ip)) {
    return authlyxFail(403, 'IP is blacklisted', { blacklisted: true, reason: 'IP' });
  }
  if (hwid && (policies.hwid_blacklist || []).includes(hwid)) {
    return authlyxFail(403, 'HWID is blacklisted', { blacklisted: true, reason: 'HWID' });
  }

  if (hwid) {
    const devices = await store('kernel-devices');
    const list = await devices.list();
    for (const item of list.blobs) {
      if (!item.key.startsWith(appId + ':')) continue;
      const d = await getJson(devices, item.key);
      if (d && d.hwid === hwid && d.status === 'banned') {
        return authlyxFail(403, 'Device is banned', { blacklisted: true, reason: 'Device Banned' });
      }
    }
  }

  return authlyxOk('Not blacklisted', { blacklisted: false });
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  if (event.httpMethod !== 'POST') return authlyxFail(405, 'POST only');

  try {
    initBlobs(event);
    const endpoint = endpointFromEvent(event);
    const body = await readJsonBody(event);

    switch (endpoint) {
      case 'init': return handleInit(body, event);
      case 'login': return handleLogin(body);
      case 'register': return handleRegister(body);
      case 'licenses': return handleLicenses(body);
      case 'extend': return handleExtend(body);
      case 'validate-session': return handleValidateSession(body);
      case 'variables': return handleVariables(body, event);
      case 'logs': return handleLogs(body);
      case 'change-password': return handleChangePassword(body);
      case 'device-auth': return handleDeviceAuth(body, event);
      case 'variables/set': return handleVariablesSet(body);
      case 'chats/get': return handleChatsGet(body);
      case 'chats/send': return handleChatsSend(body);
      case 'blacklist/check': return handleBlacklistCheck(body, event);
      default:
        return authlyxFail(404, `Unknown v2 endpoint: ${endpoint || '(empty)'}`);
    }
  } catch (err) {
    return authlyxFail(500, err.message || 'V2 API failed');
  }
};
