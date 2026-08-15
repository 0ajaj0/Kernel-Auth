const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Kernel-Admin-Key, X-Kernel-Token',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
};

const { connectLambda } = require('@netlify/blobs');

function initBlobs(event) {
  if (event) connectLambda(event);
}

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

async function getOAuthSettings() {
  const { getStore } = require('@netlify/blobs');
  try {
    const store = getStore('kernel-settings');
    const data = await store.get('oauth');
    return data ? JSON.parse(data) : {};
  } catch (err) {
    return {};
  }
}

async function getProviderConfig(provider) {
  const dbSettings = await getOAuthSettings();
  
  function getCred(providerId, fieldName) {
    return dbSettings[providerId]?.[fieldName] || env(`${providerId.toUpperCase()}_${fieldName.toUpperCase()}`);
  }

  const map = {
    google: {
      authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      clientId: getCred('google', 'client_id'),
      clientSecret: getCred('google', 'client_secret'),
      scope: 'openid email profile',
      profileUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
    },
    discord: {
      authUrl: 'https://discord.com/api/oauth2/authorize',
      tokenUrl: 'https://discord.com/api/oauth2/token',
      clientId: getCred('discord', 'client_id'),
      clientSecret: getCred('discord', 'client_secret'),
      scope: 'identify email',
      profileUrl: 'https://discord.com/api/users/@me',
    },
    github: {
      authUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      clientId: getCred('github', 'client_id'),
      clientSecret: getCred('github', 'client_secret'),
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

async function sendDiscordWebhook(title, fields = []) {
  const url = env('DISCORD_WEBHOOK_URL');
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        embeds: [{
          title,
          color: 0x3b82f6,
          fields: fields.map((f) => ({ name: f.name, value: String(f.value), inline: f.inline !== false })),
          timestamp: new Date().toISOString(),
        }],
      }),
    });
  } catch (err) {
    console.error('Discord webhook failed:', err.message);
  }
}

module.exports = {
  corsHeaders,
  json,
  env,
  siteUrl,
  loaderCallback,
  getProviderConfig,
  getOAuthSettings,
  netlifyCallback,
  readJsonBody,
  parseProfile,
  initBlobs,
  sendDiscordWebhook,
};
