const { json, readJsonBody, initBlobs, sendDiscordWebhook } = require('./_shared');
const { store, getJson, setJson, appendLog } = require('./_store');
const { authenticate, isCustomer } = require('./_auth');
const {
  loadPlans, getPlan, checkLimit, checkAccountActive, customerPayload, applySubscription,
} = require('./_plans');

function randomKey() {
  const p = () => Math.random().toString(36).slice(2, 6).toUpperCase();
  return `KERNEL-${p()}-${p()}-${p()}`;
}

async function incrementUsage(s, email, user, field) {
  if (!user.usage) user.usage = { apps: 0, users: 0, licenses: 0 };
  user.usage[field] = (user.usage[field] || 0) + 1;
  await setJson(s, email, user);
  return user;
}

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
    let user = await getJson(s, email);
    if (!user) return json(404, { error: 'Customer not found' });

    const plans = await loadPlans();
    const plan = getPlan(plans, user.subscription);

    const activeCheck = checkAccountActive(user);
    if (!activeCheck.ok && event.httpMethod !== 'GET') {
      return json(403, { error: activeCheck.error });
    }

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
        user: customerPayload(user, plans),
        variables,
        downloads: user.downloads || [
          { name: 'KERNEL Loader', url: '#', version: '1.0.0' },
        ],
        plans: Object.values(plans).map((p) => ({
          id: p.id,
          name: p.name,
          label: p.label,
          max_apps: p.max_apps,
          max_users: p.max_users,
          max_licenses: p.max_licenses,
          price_monthly: p.price_monthly,
        })),
      });
    }

    const body = await readJsonBody(event);

    if (event.httpMethod === 'POST' && body.action === 'hwid_reset_request') {
      user.hwid_reset_pending = true;
      user.hwid_reset_requested_at = new Date().toISOString();
      await setJson(s, email, user);
      await appendLog({ type: 'hwid_reset_request', email, customer_id: user.id });
      await sendDiscordWebhook('HWID Reset Request', [
        { name: 'Customer', value: user.email },
        { name: 'Current HWID', value: user.hwid || 'none' },
      ]);
      return json(200, { ok: true, message: 'HWID reset request submitted to admin' });
    }

    if (event.httpMethod === 'POST' && body.action === 'create_license') {
      const check = checkLimit(user, plan, 'licenses');
      if (!check.ok) return json(403, { error: check.error, code: check.code });

      const key = body.license_key || randomKey();
      if (!user.license_keys) user.license_keys = [];
      user.license_keys.push({ key, created_at: new Date().toISOString() });
      user = await incrementUsage(s, email, user, 'licenses');

      await appendLog({ type: 'customer_license_created', email, key });
      return json(201, {
        ok: true,
        message: 'License created',
        license_key: key,
        user: customerPayload(user, plans),
      });
    }

    if (event.httpMethod === 'POST' && body.action === 'create_user') {
      const check = checkLimit(user, plan, 'users');
      if (!check.ok) return json(403, { error: check.error, code: check.code });

      if (!user.end_users) user.end_users = [];
      const endUser = {
        id: crypto.randomUUID(),
        username: body.username || `user_${user.end_users.length + 1}`,
        created_at: new Date().toISOString(),
      };
      user.end_users.push(endUser);
      user = await incrementUsage(s, email, user, 'users');

      await appendLog({ type: 'customer_user_created', email, username: endUser.username });
      return json(201, {
        ok: true,
        message: 'User created',
        end_user: endUser,
        user: customerPayload(user, plans),
      });
    }

    if (event.httpMethod === 'POST' && body.action === 'upgrade_request') {
      const tier = (body.tier || 'plus').toLowerCase();
      if (!plans[tier]) return json(400, { error: 'Invalid tier' });
      user.pending_upgrade = tier;
      await setJson(s, email, user);
      await appendLog({ type: 'upgrade_request', email, tier });
      await sendDiscordWebhook('Upgrade Request', [
        { name: 'Customer', value: email },
        { name: 'Requested Plan', value: tier },
      ]);
      return json(200, { ok: true, message: `Upgrade to ${plans[tier].label} requested. Admin will review.` });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Customer API failed' });
  }
};
