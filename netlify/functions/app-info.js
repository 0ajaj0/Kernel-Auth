const { json } = require('./_shared');
const { getApp } = require('./_store');

exports.handler = async () => {
  const app = await getApp();
  return json(200, { ok: true, app });
};
