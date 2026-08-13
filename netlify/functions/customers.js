const { json, readJsonBody, initBlobs, sendDiscordWebhook } = require('./_shared');
const { store, getJson, setJson, appendLog } = require('./_store');
const { adminOk } = require('./_auth');
const {
  loadPlans, savePlanOverrides, applySubscription, customerPayload, getPlan,
} = require('./_plans');

async function listCustomers(search = '') {
  const s = await store('kernel-customers');
  const list = await s.list();
  const q = search.trim().toLowerCase();
  const customers = [];

  for (const item of list.blobs.slice(0, 500)) {
    const u = await getJson(s, item.key);
    if (!u || !u.email) continue;
    if (q && !u.email.toLowerCase().includes(q) && !(u.display_name || '').toLowerCase().includes(q)) {
      continue;
    }
    customers.push({ key: item.key, ...u });
  }

  customers.sort((a, b) => (b.last_login || b.created_at || '').localeCompare(a.last_login || a.created_at || ''));
  return customers;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
    if (!(await adminOk(event))) {
      return json(401, { error: 'Unauthorized. Admin access required.' });
    }

    const plans = await loadPlans();
    const body = event.httpMethod === 'GET' ? {} : await readJsonBody(event);
    const s = await store('kernel-customers');

    if (event.httpMethod === 'GET' && event.queryStringParameters?.plans === '1') {
      return json(200, { ok: true, plans: Object.values(plans) });
    }

    if (event.httpMethod === 'PUT' && body.action === 'update_plans') {
      const overrides = body.plans || {};
      await savePlanOverrides(overrides);
      await appendLog({ type: 'plans_updated', admin: true });
      const updated = await loadPlans();
      return json(200, { ok: true, plans: Object.values(updated) });
    }

    const emailParam = (event.queryStringParameters?.email || body.email || '').trim().toLowerCase();
    const search = event.queryStringParameters?.q || event.queryStringParameters?.search || '';

    if (event.httpMethod === 'GET' && emailParam) {
      const user = await getJson(s, emailParam);
      if (!user) return json(404, { error: `No customer found for ${emailParam}` });
      return json(200, { ok: true, customer: customerPayload(user, plans) });
    }

    if (event.httpMethod === 'GET') {
      const raw = await listCustomers(search);
      return json(200, {
        ok: true,
        customers: raw.map((u) => customerPayload(u, plans)),
        total: raw.length,
        plans: Object.values(plans),
      });
    }

    if (event.httpMethod === 'PATCH' || event.httpMethod === 'POST') {
      const email = (body.email || emailParam || '').trim().toLowerCase();
      if (!email) return json(400, { error: 'Email is required' });

      let user = await getJson(s, email);
      if (!user) return json(404, { error: `Customer not found: ${email}` });

      if (body.action === 'assign_subscription' || body.subscription) {
        const tier = (body.subscription || body.tier || 'free').toLowerCase();
        if (!plans[tier]) return json(400, { error: `Invalid subscription tier: ${tier}` });
        const prev = user.subscription;
        applySubscription(user, tier, plans, 'admin');
        if (body.status) user.status = body.status;
        await setJson(s, email, user);
        await appendLog({
          type: 'subscription_assigned',
          email,
          from: prev,
          to: tier,
          admin: true,
        });
        await sendDiscordWebhook('Subscription Changed', [
          { name: 'Customer', value: email },
          { name: 'Previous', value: prev || 'free' },
          { name: 'New Plan', value: tier },
        ]);
        return json(200, {
          ok: true,
          message: `Subscription updated to ${getPlan(plans, tier).label}`,
          customer: customerPayload(user, plans),
        });
      }

      if (body.action === 'suspend') {
        user.status = 'suspended';
        user.suspended_at = new Date().toISOString();
        await setJson(s, email, user);
        await appendLog({ type: 'customer_suspended', email });
        return json(200, { ok: true, message: 'Account suspended', customer: customerPayload(user, plans) });
      }

      if (body.action === 'activate') {
        user.status = 'active';
        delete user.suspended_at;
        await setJson(s, email, user);
        await appendLog({ type: 'customer_activated', email });
        return json(200, { ok: true, message: 'Account activated', customer: customerPayload(user, plans) });
      }

      if (body.action === 'update_limits') {
        user.limits_override = {
          max_apps: body.max_apps != null ? Number(body.max_apps) : user.limits_override?.max_apps,
          max_users: body.max_users != null ? Number(body.max_users) : user.limits_override?.max_users,
          max_licenses: body.max_licenses != null ? Number(body.max_licenses) : user.limits_override?.max_licenses,
        };
        await setJson(s, email, user);
        await appendLog({ type: 'customer_limits_updated', email, limits: user.limits_override });
        return json(200, { ok: true, customer: customerPayload(user, plans) });
      }

      if (body.display_name) user.display_name = body.display_name;
      if (body.status && !body.action) user.status = body.status;
      await setJson(s, email, user);
      return json(200, { ok: true, customer: customerPayload(user, plans) });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Customers API failed' });
  }
};
