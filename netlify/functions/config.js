const { json, env, siteUrl, loaderCallback, getProviderConfig } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  const googleConfig = await getProviderConfig('google');
  const discordConfig = await getProviderConfig('discord');
  const githubConfig = await getProviderConfig('github');

  return json(200, {
    ok: true,
    site_url: siteUrl(),
    loader_callback: loaderCallback(),
    oauth: {
      google: {
        enabled: Boolean(googleConfig?.clientId),
        start_url: `${siteUrl()}/api/oauth-start?provider=google`,
        callback_url: `${siteUrl()}/oauth/callback.html`,
      },
      discord: {
        enabled: Boolean(discordConfig?.clientId),
        start_url: `${siteUrl()}/api/oauth-start?provider=discord`,
        callback_url: `${siteUrl()}/oauth/callback.html`,
      },
      github: {
        enabled: Boolean(githubConfig?.clientId),
        start_url: `${siteUrl()}/api/oauth-start?provider=github`,
        callback_url: `${siteUrl()}/oauth/callback.html`,
      },
    },
    license_api: {
      activate: `${siteUrl()}/api/license-activate`,
      verify: `${siteUrl()}/api/license-verify`,
    },
    authlyx_configured: Boolean(env('AUTHLYX_SECRET') && env('AUTHLYX_OWNER_ID')),
  });
};
