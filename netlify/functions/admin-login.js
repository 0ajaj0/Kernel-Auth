const { json, readJsonBody } = require('./_shared');
const { ROLES, signToken } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const body = await readJsonBody(event);
  const pass = process.env.KERNEL_ADMIN_PASSWORD;
  if (!pass) return json(500, { error: 'Admin password not configured' });
  if (body.password !== pass) return json(401, { error: 'Invalid password' });

  const token = await signToken({
    sub: 'admin-local',
    email: process.env.KERNEL_ADMIN_EMAIL || 'admin@kernel.local',
    name: 'Administrator',
    role: ROLES.ADMIN,
    provider: 'password',
  });

  return json(200, {
    ok: true,
    token,
    role: ROLES.ADMIN,
    redirect: '/admin/dashboard/',
  });
};
