const { json, readJsonBody } = require('./_shared');
const { ROLES, signToken } = require('./_auth');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }
  if (event.httpMethod !== 'POST') return json(405, { error: 'Method not allowed' });

  const body = await readJsonBody(event);
  const email = (body.email || '').trim().toLowerCase();
  const pass = process.env.KERNEL_ADMIN_PASSWORD;

  if (!email) return json(400, { error: 'Admin email required' });
  if (!pass) return json(500, { error: 'Admin password not configured' });
  if (body.password !== pass) return json(401, { error: 'Invalid password' });

  const adminEmail = (process.env.KERNEL_ADMIN_EMAIL || 'admin@kernel.local').toLowerCase();
  
  let role = ROLES.ADMIN;
  let name = 'Administrator';
  
  if (email !== adminEmail) {
    const { getStore } = require('@netlify/blobs');
    const store = getStore('kernel-team');
    try {
      const staffList = JSON.parse(await store.get('staff') || '[]');
      const staffUser = staffList.find(s => s.email.toLowerCase() === email);
      if (!staffUser) return json(401, { error: 'Not an authorized admin or staff email' });
      name = staffUser.name || 'Staff';
      role = staffUser.role === 'Admin' ? ROLES.ADMIN : ROLES.SUPPORT;
    } catch(err) {
      return json(401, { error: 'Not an authorized admin or staff email' });
    }
  }

  const token = await signToken({
    sub: email === adminEmail ? 'admin-local' : 'staff-' + email,
    email: email,
    name: name,
    role: role,
    provider: 'password',
  });

  return json(200, {
    ok: true,
    token,
    role: role,
    redirect: '/admin/dashboard/',
  });
};
