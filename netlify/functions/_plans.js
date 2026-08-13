const { store, getJson, setJson } = require('./_store');

const DEFAULT_PLANS = {
  free: {
    id: 'free',
    name: 'Free',
    label: 'Free',
    max_apps: 1,
    max_users: 5,
    max_licenses: 3,
    features: ['basic_oauth', 'basic_support'],
    price_monthly: 0,
    price_yearly: 0,
  },
  lite: {
    id: 'lite',
    name: 'Lite',
    label: 'Lite',
    max_apps: 3,
    max_users: 25,
    max_licenses: 10,
    features: ['oauth', 'hwid', 'email_support'],
    price_monthly: 5,
    price_yearly: 4,
  },
  plus: {
    id: 'plus',
    name: 'Plus',
    label: 'Plus',
    max_apps: 10,
    max_users: 100,
    max_licenses: 50,
    features: ['full_oauth', 'team', 'priority_support'],
    price_monthly: 9,
    price_yearly: 7.2,
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    label: 'Enterprise',
    max_apps: 999999,
    max_users: 999999,
    max_licenses: 999999,
    features: ['everything', 'white_label', 'reseller'],
    price_monthly: null,
    price_yearly: null,
  },
};

async function loadPlans() {
  try {
    const s = await store('kernel-plan-config');
    const overrides = await getJson(s, '__plans__');
    if (!overrides) return { ...DEFAULT_PLANS };
    const merged = { ...DEFAULT_PLANS };
    for (const [id, plan] of Object.entries(overrides)) {
      merged[id] = { ...(merged[id] || {}), ...plan, id };
    }
    return merged;
  } catch {
    return { ...DEFAULT_PLANS };
  }
}

async function savePlanOverrides(overrides) {
  const s = await store('kernel-plan-config');
  await setJson(s, '__plans__', overrides);
}

function getPlan(plans, tierId) {
  const id = String(tierId || 'free').toLowerCase();
  return plans[id] || plans.free;
}

function getLimitsForUser(user, plan) {
  return {
    max_apps: user.limits_override?.max_apps ?? plan.max_apps,
    max_users: user.limits_override?.max_users ?? plan.max_users,
    max_licenses: user.limits_override?.max_licenses ?? plan.max_licenses,
  };
}

function getUsage(user) {
  return {
    apps: user.usage?.apps ?? 0,
    users: user.usage?.users ?? 0,
    licenses: user.usage?.licenses ?? 0,
  };
}

function checkAccountActive(user) {
  if (user.status === 'suspended') {
    return { ok: false, error: 'Your account has been suspended. Please contact support.' };
  }
  return { ok: true };
}

function checkLimit(user, plan, resource, increment = 1) {
  const active = checkAccountActive(user);
  if (!active.ok) return active;

  const usage = getUsage(user);
  const limits = getLimitsForUser(user, plan);
  const key = resource === 'app' ? 'apps' : resource === 'user' ? 'users' : resource === 'license' ? 'licenses' : resource;

  if (!limits[`max_${key}`] && limits[`max_${key}`] !== 0) {
    return { ok: true, usage, limits, plan };
  }

  const maxKey = `max_${key}`;
  const max = limits[maxKey];
  if (usage[key] + increment > max) {
    const label = plan.label || plan.name;
    return {
      ok: false,
      error: `You have reached the maximum number of ${key} allowed by your ${label} plan (${max}). Upgrade your subscription to increase limits.`,
      code: 'LIMIT_REACHED',
      usage,
      limits,
      plan,
    };
  }
  return { ok: true, usage, limits, plan };
}

function applySubscription(user, tierId, plans, assignedBy) {
  const plan = getPlan(plans, tierId);
  user.subscription = plan.id;
  user.subscription_label = plan.label || plan.name;
  user.subscription_assigned_by = assignedBy || 'system';
  user.subscription_updated_at = new Date().toISOString();
  if (!user.usage) user.usage = { apps: 0, users: 0, licenses: 0 };
  return user;
}

function customerPayload(user, plans) {
  const plan = getPlan(plans, user.subscription);
  const usage = getUsage(user);
  const limits = getLimitsForUser(user, plan);
  return {
    id: user.id,
    email: user.email,
    display_name: user.display_name,
    avatar_url: user.avatar_url,
    provider: user.provider,
    status: user.status || 'active',
    subscription: user.subscription,
    subscription_label: user.subscription_label || plan.label,
    subscription_assigned_by: user.subscription_assigned_by,
    subscription_updated_at: user.subscription_updated_at,
    created_at: user.created_at,
    last_login: user.last_login,
    hwid: user.hwid || '',
    hwid_status: user.hwid_status || 'unbound',
    license_keys: user.license_keys || [],
    api_token: user.api_token,
    usage,
    limits,
    plan: {
      id: plan.id,
      name: plan.name,
      features: plan.features || [],
    },
  };
}

module.exports = {
  DEFAULT_PLANS,
  loadPlans,
  savePlanOverrides,
  getPlan,
  getLimitsForUser,
  getUsage,
  checkAccountActive,
  checkLimit,
  applySubscription,
  customerPayload,
};
