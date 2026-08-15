const { json, readJsonBody, initBlobs, getProviderConfig, netlifyCallback, parseProfile, sendDiscordWebhook } = require('./_shared');
const { store, getJson, setJson, appendLog } = require('./_store');
const { ROLES, signToken, parseOAuthState } = require('./_auth');
const { loadPlans, applySubscription, checkAccountActive } = require('./_plans');

async function exchangeCode(provider, code) {
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: body.toString(),
  });
  const tokenJson = await tokenRes.json();
  if (tokenJson.error) throw new Error(tokenJson.error_description || tokenJson.error);

  const accessToken = tokenJson.access_token;
  if (!accessToken) throw new Error('No access token returned');

  const profileRes = await fetch(cfg.profileUrl, {
    headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'User-Agent': 'KERNEL-Auth/1.0' },
  });
  let profileRaw = await profileRes.json();

  if (provider === 'github' && !profileRaw.email) {
    const emailsRes = await fetch('https://api.github.com/user/emails', {
      headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json', 'User-Agent': 'KERNEL-Auth/1.0' },
    });
    const emails = await emailsRes.json();
    const primary = Array.isArray(emails) ? emails.find((e) => e.primary) : null;
    if (primary) profileRaw.email = primary.email;
  }

  return parseProfile(provider, profileRaw);
}

async function upsertCustomer(profile, provider) {
  const s = await store('kernel-customers');
  const plans = await loadPlans();
  const email = (profile.email || '').toLowerCase();
  const key = email || `${provider}:${profile.provider_id}`;
  let user = await getJson(s, key);

  if (!user) {
    user = {
      id: crypto.randomUUID(),
      email: profile.email || '',
      display_name: profile.display_name,
      avatar_url: profile.avatar_url || '',
      provider,
      provider_id: profile.provider_id,
      role: ROLES.CUSTOMER,
      status: 'active',
      api_token: crypto.randomUUID().replace(/-/g, ''),
      hwid: '',
      hwid_status: 'unbound',
      license_keys: [],
      end_users: [],
      usage: { apps: 0, users: 0, licenses: 0 },
      created_at: new Date().toISOString(),
    };
    applySubscription(user, 'free', plans, 'auto');
  } else {
    user.display_name = profile.display_name || user.display_name;
    user.avatar_url = profile.avatar_url || user.avatar_url;
    user.provider = provider;
    user.provider_id = profile.provider_id;
    user.last_login = new Date().toISOString();
    if (!user.usage) user.usage = { apps: 0, users: 0, licenses: 0 };
    if (!user.status) user.status = 'active';
    if (!user.subscription) applySubscription(user, 'free', plans, 'auto');
  }

  await setJson(s, key, user);
  return user;
}

function resolveRole(profile, requestedRole) {
  const adminEmail = (process.env.KERNEL_ADMIN_EMAIL || '').trim().toLowerCase();
  const email = (profile.email || '').toLowerCase();

  if (adminEmail && email === adminEmail) return ROLES.ADMIN;
  if (requestedRole === ROLES.ADMIN && !adminEmail) {
    return ROLES.ADMIN;
  }
  return ROLES.CUSTOMER;
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

    const stateInfo = parseOAuthState(state);
    if (stateInfo.kind === 'loader') {
      return json(400, { error: 'Use loader callback for non-web OAuth state' });
    }

    const profile = await exchangeCode(provider, code);
    if (!profile?.email && provider !== 'discord') {
      return json(400, { error: 'Could not retrieve email from provider' });
    }

    const role = resolveRole(profile, stateInfo.role);
    let userRecord;
    let redirect = '/client/dashboard/';

    if (role === ROLES.ADMIN) {
      const s = await store('kernel-dashboard-users');
      const userId = `${provider}:${profile.provider_id}`;
      userRecord = {
        ...profile,
        provider,
        role: ROLES.ADMIN,
        last_login: new Date().toISOString(),
      };
      await setJson(s, userId, userRecord);
      redirect = '/admin/dashboard/';
    } else {
      userRecord = await upsertCustomer(profile, provider);
      const suspended = checkAccountActive(userRecord);
      if (!suspended.ok) {
        return json(403, { error: suspended.error });
      }
      redirect = '/client/dashboard/';
    }

    const token = await signToken({
      sub: userRecord.id || `${provider}:${profile.provider_id}`,
      email: profile.email || userRecord.email,
      name: profile.display_name,
      role,
      provider,
      picture: profile.avatar_url || '',
    });

    await appendLog({ type: 'oauth_login', role, provider, email: profile.email });
    await sendDiscordWebhook('New Login', [
      { name: 'Role', value: role },
      { name: 'Provider', value: provider },
      { name: 'Email', value: profile.email || '—' },
    ]);

    return json(200, {
      ok: true,
      token,
      role,
      redirect,
      profile: {
        display_name: profile.display_name,
        email: profile.email,
        avatar_url: profile.avatar_url,
        provider,
      },
      user: role === ROLES.CUSTOMER ? {
        subscription: userRecord.subscription,
        subscription_label: userRecord.subscription_label,
        api_token: userRecord.api_token,
        hwid_status: userRecord.hwid_status,
        license_keys: userRecord.license_keys || [],
      } : null,
    });
  } catch (err) {
    return json(400, { error: err.message || 'OAuth failed' });
  }
};
