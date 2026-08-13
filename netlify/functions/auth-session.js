const { json, initBlobs } = require('./_shared');
const { authenticate, ROLES } = require('./_auth');
const { store, getJson } = require('./_store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
    const auth = await authenticate(event);
    if (!auth) return json(401, { ok: false, error: 'Unauthorized' });

    let customer = null;
    if (auth.role === ROLES.CUSTOMER && auth.email) {
      const s = await store('kernel-customers');
      customer = await getJson(s, auth.email.toLowerCase());
    }

    return json(200, {
      ok: true,
      session: {
        sub: auth.sub,
        email: auth.email,
        name: auth.name,
        role: auth.role,
        provider: auth.provider,
        picture: auth.picture,
      },
      customer: customer ? {
        subscription: customer.subscription,
        subscription_label: customer.subscription_label,
        hwid: customer.hwid,
        hwid_status: customer.hwid_status,
        license_keys: customer.license_keys || [],
        api_token: customer.api_token,
      } : null,
    });
  } catch (err) {
    return json(401, { ok: false, error: err.message || 'Invalid session' });
  }
};
