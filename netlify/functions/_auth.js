const { SignJWT, jwtVerify } = require('jose');

const ROLES = { ADMIN: 'ADMIN', CUSTOMER: 'CUSTOMER' };

function jwtSecret() {
  const s = process.env.KERNEL_JWT_SECRET || process.env.KERNEL_ADMIN_PASSWORD || 'kernel-dev-secret-change-me';
  return new TextEncoder().encode(s);
}

async function signToken(payload, expiresIn = '7d') {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(expiresIn)
    .sign(jwtSecret());
}

async function verifyToken(token) {
  if (!token) throw new Error('Missing token');
  const { payload } = await jwtVerify(token, jwtSecret());
  return payload;
}

function getBearer(event) {
  const auth = event.headers.authorization || event.headers.Authorization || '';
  if (auth.startsWith('Bearer ')) return auth.slice(7).trim();
  return '';
}

async function authenticate(event) {
  const bearer = getBearer(event);
  if (bearer) {
    try {
      return await verifyToken(bearer);
    } catch {
      /* fall through */
    }
  }
  const adminKey = event.headers['x-kernel-admin-key'] || event.headers['X-Kernel-Admin-Key'];
  if (adminKey && adminKey === process.env.KERNEL_ADMIN_PASSWORD) {
    return { sub: 'admin-local', role: ROLES.ADMIN, email: process.env.KERNEL_ADMIN_EMAIL || 'admin@kernel.local' };
  }
  return null;
}

function isAdmin(auth) {
  return auth && auth.role === ROLES.ADMIN;
}

function isCustomer(auth) {
  return auth && auth.role === ROLES.CUSTOMER;
}

function parseOAuthState(state) {
  if (!state) return { kind: 'loader' };
  if (state.startsWith('kernel:')) {
    const parts = state.split(':');
    return {
      kind: 'web',
      role: parts[1] === 'admin' ? ROLES.ADMIN : ROLES.CUSTOMER,
      provider: parts[2] || 'google',
      nonce: parts[3] || '',
    };
  }
  if (state.startsWith('dashboard-')) {
    return { kind: 'web', role: ROLES.ADMIN, provider: 'google', nonce: state };
  }
  return { kind: 'loader' };
}

function buildOAuthState(role, provider) {
  const r = role === ROLES.ADMIN ? 'admin' : 'customer';
  return `kernel:${r}:${provider}:${crypto.randomUUID()}`;
}

async function adminOk(event) {
  const auth = await authenticate(event);
  return isAdmin(auth);
}

module.exports = {
  ROLES,
  signToken,
  verifyToken,
  getBearer,
  authenticate,
  isAdmin,
  isCustomer,
  adminOk,
  parseOAuthState,
  buildOAuthState,
};
