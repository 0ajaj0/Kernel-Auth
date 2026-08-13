const { getStore } = require('@netlify/blobs');
const { json, readJsonBody } = require('./_shared');

function normalizeKey(key) {
  return String(key || '').trim().toUpperCase();
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
    const licenseKey = normalizeKey(body.license_key);

    if (!licenseKey) return json(400, { error: 'Missing license_key' });

    const store = await getStore({ name: 'kernel-licenses', consistency: 'strong' });
    const recordRaw = await store.get(licenseKey, { type: 'json' });

    if (!recordRaw) {
      return json(200, { ok: true, licensed: false });
    }

    const record = typeof recordRaw === 'string' ? JSON.parse(recordRaw) : recordRaw;
    const valid = !record.revoked && (!record.expires_at || new Date(record.expires_at) > new Date());

    return json(200, {
      ok: true,
      licensed: valid,
      subscription: record.subscription || record.product || '',
      subscription_level: record.level || '',
      expiry_date: record.expires_at || '',
      products: record.products || [],
    });
  } catch (err) {
    return json(500, { error: err.message || 'Verification failed' });
  }
};
