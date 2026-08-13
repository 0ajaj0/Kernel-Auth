const { json, env } = require('./_shared');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  const body = event.body ? JSON.parse(event.body) : {};
  const pass = env('KERNEL_ADMIN_PASSWORD');
  if (!pass) return json(500, { error: 'Admin password not configured' });
  if (body.password !== pass) return json(401, { error: 'Invalid password' });
  return json(200, { ok: true, token: pass });
};
