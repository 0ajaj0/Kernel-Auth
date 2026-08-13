const { json, readJsonBody, initBlobs } = require('./_shared');
const { store, getJson, setJson } = require('./_store');
const { adminOk } = require('./_auth');

function appIdFrom(event, body = {}) {
  return event.queryStringParameters?.app_id || body.app_id || 'default';
}

const defaultPolicies = () => ({
  ip_whitelist: [],
  ip_blacklist: [],
  hwid_whitelist: [],
  hwid_blacklist: [],
  vpn_block: false,
  country_block: [],
  updated_at: new Date().toISOString(),
});

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
    const body = event.httpMethod === 'GET' ? {} : await readJsonBody(event);
    const appId = appIdFrom(event, body);
    const s = await store('kernel-policies');
    const key = appId;

    if (event.httpMethod === 'GET') {
      const policies = (await getJson(s, key)) || defaultPolicies();
      return json(200, { ok: true, app_id: appId, policies });
    }

    if (!(await adminOk(event))) return json(401, { error: 'Unauthorized' });

    if (event.httpMethod === 'PUT' || event.httpMethod === 'PATCH') {
      const existing = (await getJson(s, key)) || defaultPolicies();
      const updated = {
        ...existing,
        ...(body.ip_whitelist != null ? { ip_whitelist: body.ip_whitelist } : {}),
        ...(body.ip_blacklist != null ? { ip_blacklist: body.ip_blacklist } : {}),
        ...(body.hwid_whitelist != null ? { hwid_whitelist: body.hwid_whitelist } : {}),
        ...(body.hwid_blacklist != null ? { hwid_blacklist: body.hwid_blacklist } : {}),
        ...(body.vpn_block != null ? { vpn_block: Boolean(body.vpn_block) } : {}),
        ...(body.country_block != null ? { country_block: body.country_block } : {}),
        updated_at: new Date().toISOString(),
      };
      await setJson(s, key, updated);
      return json(200, { ok: true, policies: updated });
    }

    return json(405, { error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Policies API failed' });
  }
};
