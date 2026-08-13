const { json, providerConfig, netlifyCallback } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  const provider = (event.queryStringParameters?.provider || 'google').toLowerCase();
  const state = event.queryStringParameters?.state || crypto.randomUUID();
  const cfg = providerConfig(provider);

  if (!cfg || !cfg.clientId) {
    const state = event.queryStringParameters?.state || '';
    if (state.startsWith('dashboard-')) {
      return {
        statusCode: 302,
        headers: { Location: '/dashboard/?oauth_error=google_not_configured' },
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
