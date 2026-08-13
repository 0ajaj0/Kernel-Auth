const { json } = require('./_shared');
const { getApp } = require('./_store');

exports.handler = async () => {
  try {
    const app = await getApp();
    return json(200, { ok: true, app });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Failed to load application' });
  }
};
