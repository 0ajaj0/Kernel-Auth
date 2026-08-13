const { json } = require('./_shared');

exports.handler = async () => json(200, {
  ok: true,
  service: 'KERNEL Auth',
  version: '1.0.0',
  timestamp: new Date().toISOString(),
});
