const { json, providerConfig, netlifyCallback, readJsonBody, parseProfile } = require('./_shared');

async function exchangeCode(provider, code) {
  const cfg = providerConfig(provider);
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
  if (tokenJson.error) {
    throw new Error(tokenJson.error_description || tokenJson.error);
  }

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
    const primary = Array.isArray(emails) ? emails.find(e => e.primary) : null;
    if (primary) profileRaw.email = primary.email;
  }

  return parseProfile(provider, profileRaw);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  if (event.httpMethod !== 'POST') {
    return json(405, { error: 'Method not allowed' });
  }

  try {
    const body = await readJsonBody(event);
    const provider = (body.provider || 'google').toLowerCase();
    const code = body.code || '';

    if (!code) return json(400, { error: 'Missing authorization code' });

    const profile = await exchangeCode(provider, code);
    if (!profile) return json(500, { error: 'Could not parse profile' });

    return json(200, {
      ok: true,
      profile,
    });
  } catch (err) {
    return json(400, { error: err.message || 'OAuth exchange failed' });
  }
};
