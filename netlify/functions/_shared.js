const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Kernel-Admin-Key',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, DELETE, OPTIONS',
};

function json(statusCode, body) {
  return {
    statusCode,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

function env(name, fallback = '') {
  return process.env[name] || fallback;
}

function siteUrl() {
  return env('KERNEL_SITE_URL', env('URL', 'http://localhost:8888')).replace(/\/$/, '');
}

function loaderCallback() {
  return env('KERNEL_LOADER_CALLBACK', 'http://127.0.0.1:42891/callback');
}

function providerConfig(provider) {
  const map = {
    google: {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: env('GOOGLE_CLIENT_ID'),
      clientSecret: env('GOOGLE_CLIENT_SECRET'),
      scope: 'openid email profile',
      profileUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    },
    discord: {
      authUrl: 'https://discord.com/api/oauth2/authorize',
      tokenUrl: 'https://discord.com/api/oauth2/token',
      clientId: env('DISCORD_CLIENT_ID'),
      clientSecret: env('DISCORD_CLIENT_SECRET'),
      scope: 'identify email',
      profileUrl: 'https://discord.com/api/users/@me',
    },
    github: {
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      clientId: env('GITHUB_CLIENT_ID'),
      clientSecret: env('GITHUB_CLIENT_SECRET'),
      scope: 'read:user user:email',
      profileUrl: 'https://api.github.com/user',
    },
  };
  return map[provider] || null;
}

function netlifyCallback() {
  return `${siteUrl()}/oauth/callback.html`;
}

async function readJsonBody(event) {
  if (!event.body) return {};
  try {
    return JSON.parse(event.body);
  } catch {
    return {};
  }
}

function parseProfile(provider, raw, emailFallback = '') {
  if (provider === 'google') {
    return {
      provider: 'Google',
      provider_id: raw.id || '',
      display_name: raw.name || raw.email || 'User',
      email: raw.email || emailFallback,
      avatar_url: raw.picture || '',
    };
  }
  if (provider === 'discord') {
    const avatar = raw.avatar && raw.id
      ? `https://cdn.discordapp.com/avatars/${raw.id}/${raw.avatar}.png?size=128`
      : '';
    return {
      provider: 'Discord',
      provider_id: raw.id || '',
      display_name: raw.global_name || raw.username || 'User',
      email: raw.email || emailFallback,
      avatar_url: avatar,
    };
  }
  if (provider === 'github') {
    return {
      provider: 'GitHub',
      provider_id: String(raw.id || ''),
      display_name: raw.name || raw.login || 'User',
      email: raw.email || emailFallback,
      avatar_url: raw.avatar_url || '',
    };
  }
  return null;
}

module.exports = {
  corsHeaders,
  json,
  env,
  siteUrl,
  loaderCallback,
  providerConfig,
  netlifyCallback,
  readJsonBody,
  parseProfile,
};
