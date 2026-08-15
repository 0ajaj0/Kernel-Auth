const { json, readJsonBody, initBlobs } = require('./_shared');
const { store, getJson, setJson, appendLog } = require('./_store');

async function exchangeCode(provider, code) {
  const { getProviderConfig, netlifyCallback, parseProfile } = require('./_shared');
  const cfg = await getProviderConfig(provider);
  if (!cfg?.clientId || !cfg?.clientSecret) {
    throw new Error(`${provider} OAuth is not configured`);
  }

  const body = new URLSearchParams({
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    code,
    grant_type: 'authorization_code',
    redirect_uri: netlifyCallback(),
  });

  const tokenRes = await fetch(cfg.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  const tokenJson = await tokenRes.json();
  if (tokenJson.error) throw new Error(tokenJson.error_description || tokenJson.error);

  const accessToken = tokenJson.access_token;
  if (!accessToken) throw new Error('No access token returned');

  const profileRes = await fetch(cfg.profileUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
      'User-Agent': 'KERNEL-Auth/1.0',
    },
  });

  let profileRaw = await profileRes.json();
  if (provider === 'github' && !profileRaw.email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
        'User-Agent': 'KERNEL-Auth/1.0',
      },
    });
    const emails = await emailsRes.json();
    const primary = Array.isArray(emails) ? emails.find((e) => e.primary) : null;
    if (primary) profileRaw.email = primary.email;
  }

  return parseProfile(provider, profileRaw);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  try {
    initBlobs(event);
    const body = await readJsonBody(event);
    const provider = (body.provider || 'google').toLowerCase();
    const code = body.code || '';
    const state = body.state || '';

    if (!code) return json(400, { error: 'Missing authorization code' });
    if (!state.startsWith('dashboard-')) return json(400, { error: 'Invalid OAuth state' });

    const profile = await exchangeCode(provider, code);
    if (!profile?.email) return json(400, { error: 'Could not retrieve email from provider' });

    const adminEmail = (process.env.KERNEL_ADMIN_EMAIL || '').trim();
    const adminPass = process.env.KERNEL_ADMIN_PASSWORD || '';
    if (!adminPass) return json(500, { error: 'Admin password not configured (set KERNEL_ADMIN_PASSWORD in Netlify)' });

    // Only restrict when KERNEL_ADMIN_EMAIL is explicitly set.
    if (adminEmail && profile.email.toLowerCase() !== adminEmail.toLowerCase()) {
      return json(403, {
        error: `Google account ${profile.email} is not authorized. Set KERNEL_ADMIN_EMAIL to this address in Netlify, or remove KERNEL_ADMIN_EMAIL to allow any Google account.`,
      });
    }

    const s = await store('kernel-dashboard-users');
    const userId = `${provider}:${profile.provider_id}`;
    await setJson(s, userId, {
      ...profile,
      provider,
      last_login: new Date().toISOString(),
    });
    await appendLog({ type: 'dashboard_oauth_login', email: profile.email, provider });

    return json(200, {
      ok: true,
      token: adminPass,
      profile,
    });
  } catch (err) {
    return json(400, { error: err.message || 'Dashboard OAuth failed' });
  }
};
