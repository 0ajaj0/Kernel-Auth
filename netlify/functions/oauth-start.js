const { json, getProviderConfig, netlifyCallback } = require('./_shared');
const { ROLES, buildOAuthState } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  const provider = (event.queryStringParameters?.provider || 'google').toLowerCase();
  let state = event.queryStringParameters?.state || '';
  const roleParam = (event.queryStringParameters?.role || 'customer').toLowerCase();
  const role = roleParam === 'admin' ? ROLES.ADMIN : ROLES.CUSTOMER;

  if (!state || state.startsWith('dashboard-')) {
    state = buildOAuthState(role, provider);
  }

  const cfg = await getProviderConfig(provider);

  if (!cfg || !cfg.clientId) {
    const isWeb = state.startsWith('kernel:') || (state && state.startsWith('dashboard-'));
    if (isWeb) {
      return {
        statusCode: 302,
        headers: { Location: `/login/?oauth_error=${provider}_not_configured` },
        body: '',
      };
    }
    return json(400, { error: `${provider} is not configured on KERNEL Auth` });
  }

  const redirectUri = netlifyCallback();
  const url = new URL(cfg.authUrl);
  url.searchParams.set('client_id', cfg.clientId);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', cfg.scope);
  url.searchParams.set('state', state);
  if (provider === 'google') url.searchParams.set('access_type', 'online');
  if (provider === 'discord') url.searchParams.set('prompt', 'consent');

  return {
    statusCode: 302,
    headers: { Location: url.toString() },
    body: '',
  };
};
