const { json, initBlobs } = require('./_shared');
const { authenticate, ROLES } = require('./_auth');
const { store, getJson } = require('./_store');
const { loadPlans, customerPayload } = require('./_plans');

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
      const raw = await getJson(s, auth.email.toLowerCase());
      if (raw) {
        const plans = await loadPlans();
        customer = customerPayload(raw, plans);
      }
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
      customer,
    });
  } catch (err) {
    return json(401, { ok: false, error: err.message || 'Invalid session' });
  }
};
