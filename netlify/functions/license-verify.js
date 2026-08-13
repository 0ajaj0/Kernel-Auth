const { json, readJsonBody } = require('./_shared');
const { findLicense } = require('./_store');

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
    const appId = body.app_id || null;

    if (!licenseKey) return json(400, { error: 'Missing license_key' });

    const found = await findLicense(licenseKey, appId);
    if (!found) return json(200, { ok: true, licensed: false });

    const record = found.record;
    const valid = !record.revoked && (!record.expires_at || new Date(record.expires_at) > new Date());

    return json(200, {
      ok: true,
      licensed: valid,
      app_id: found.app_id,
      subscription: record.subscription || record.product || '',
      subscription_level: record.level || '',
      expiry_date: record.expires_at || '',
      products: record.products || [],
    });
  } catch (err) {
    return json(500, { error: err.message || 'Verification failed' });
  }
};
