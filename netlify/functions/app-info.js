const { json, initBlobs } = require('./_shared');
const { getApp } = require('./_store');

exports.handler = async (event) => {
  try {
    initBlobs(event);
    const app = await getApp();
    if (!app) return json(200, { ok: true, app: null });
    return json(200, { ok: true, app });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Failed to load application' });
  }
};
