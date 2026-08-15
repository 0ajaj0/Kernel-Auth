const { json, readJsonBody, initBlobs, getOAuthSettings } = require('./_shared');
const { getStore } = require('@netlify/blobs');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  
  try {
    initBlobs(event);

    if (event.httpMethod === 'GET') {
      const settings = await getOAuthSettings();
      // Mask the secrets when sending to frontend for security
      const masked = JSON.parse(JSON.stringify(settings));
      Object.keys(masked).forEach(provider => {
        if (masked[provider].client_secret) {
          masked[provider].client_secret = '••••••••••••••••';
        }
      });
      return json(200, { ok: true, data: masked });
    }

    if (event.httpMethod === 'POST') {
      const body = await readJsonBody(event);
      const store = getStore('kernel-settings');
      
      const current = await getOAuthSettings();
      
      // Update with new values, but preserve existing secret if not changed
      const updated = { ...current };
      
      for (const provider of ['google', 'discord', 'github']) {
        if (body[provider]) {
          updated[provider] = updated[provider] || {};
          if (body[provider].client_id !== undefined) {
            updated[provider].client_id = body[provider].client_id.trim();
          }
          if (body[provider].client_secret !== undefined && body[provider].client_secret !== '••••••••••••••••') {
            updated[provider].client_secret = body[provider].client_secret.trim();
          }
        }
      }

      await store.setJSON('oauth', updated);
      return json(200, { ok: true, message: 'Settings saved' });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { error: err.message || 'Server error' });
  }
};
