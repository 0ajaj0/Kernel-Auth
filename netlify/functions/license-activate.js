const { json, readJsonBody } = require('./_shared');
const { findLicense, store, setJson } = require('./_store');

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
    const email = (body.email || '').trim().toLowerCase();
    const providerId = body.provider_id || '';
    const appId = body.app_id || null;

    if (!licenseKey) return json(400, { error: 'Missing license_key' });

    const found = await findLicense(licenseKey, appId);
    if (!found) return json(404, { error: 'Invalid or unknown license key' });

    const record = found.record;
    if (record.revoked) return json(403, { error: 'This license key has been revoked' });
    if (record.expires_at && new Date(record.expires_at) < new Date()) {
      return json(403, { error: 'This license key has expired' });
    }
    if (record.bound_email && email && record.bound_email !== email) {
      return json(403, { error: 'This key is bound to a different account' });
    }
    if (record.max_activations && record.activations >= record.max_activations && !record.bound_email) {
      return json(403, { error: 'Activation limit reached for this key' });
    }

    record.activations = (record.activations || 0) + 1;
    if (email && !record.bound_email) record.bound_email = email;
    if (providerId) record.provider_id = providerId;
    record.last_used_at = new Date().toISOString();

    await setJson(await store('kernel-licenses'), found.blobKey, record);

    return json(200, {
      ok: true,
      licensed: true,
      app_id: found.app_id,
      subscription: record.subscription || record.product || 'Active Subscription',
      subscription_level: record.level || '',
      days_left: record.days_left ?? null,
      expiry_date: record.expires_at || '',
      products: record.products || ['all'],
    });
  } catch (err) {
    return json(500, { error: err.message || 'License activation failed' });
  }
};
