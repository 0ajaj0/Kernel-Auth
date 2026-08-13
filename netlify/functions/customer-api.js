const { json, readJsonBody, initBlobs } = require('./_shared');
const { authenticate, isCustomer, ROLES } = require('./_auth');
const { store, getJson, setJson, appendLog } = require('./_store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
    const auth = await authenticate(event);
    if (!auth || !isCustomer(auth)) {
      return json(403, { error: 'Customer access required' });
    }

    const email = (auth.email || '').toLowerCase();
    const s = await store('kernel-customers');
    const user = await getJson(s, email);
    if (!user) return json(404, { error: 'Customer not found' });

    if (event.httpMethod === 'GET') {
      const vars = await store('kernel-variables');
      const varList = await vars.list();
      const variables = {};
      for (const item of varList.blobs.slice(0, 50)) {
        const v = await getJson(vars, item.key);
        if (v && !v.secret) variables[v.key] = v.value;
      }

      return json(200, {
        ok: true,
        user: {
          email: user.email,
          display_name: user.display_name,
          avatar_url: user.avatar_url,
          subscription: user.subscription,
          subscription_label: user.subscription_label || 'Free',
          hwid: user.hwid || '',
          hwid_status: user.hwid_status || 'unbound',
          license_keys: user.license_keys || [],
          api_token: user.api_token,
        },
        variables,
        downloads: user.downloads || [
          { name: 'KERNEL Loader', url: '#', version: '1.0.0' },
        ],
      });
    }

    const body = await readJsonBody(event);

    if (event.httpMethod === 'POST' && body.action === 'hwid_reset_request') {
      user.hwid_reset_pending = true;
      user.hwid_reset_requested_at = new Date().toISOString();
      await setJson(s, email, user);
      await appendLog({ type: 'hwid_reset_request', email, customer_id: user.id });
      const { sendDiscordWebhook } = require('./_shared');
      await sendDiscordWebhook('HWID Reset Request', [
        { name: 'Customer', value: user.email },
        { name: 'Current HWID', value: user.hwid || 'none' },
      ]);
      return json(200, { ok: true, message: 'HWID reset request submitted to admin' });
    }

    if (event.httpMethod === 'POST' && body.action === 'upgrade_request') {
      const tier = body.tier || 'plus';
      user.pending_upgrade = tier;
      await setJson(s, email, user);
      await appendLog({ type: 'upgrade_request', email, tier });
      return json(200, { ok: true, message: `Upgrade to ${tier} requested` });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Customer API failed' });
  }
};
