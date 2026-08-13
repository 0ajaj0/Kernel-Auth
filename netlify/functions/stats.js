const { json, initBlobs } = require('./_shared');
const { store, getJson } = require('./_store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
    const licenses = await store('kernel-licenses');
    const users = await store('kernel-users');
    const logs = await store('kernel-logs');

    const licenseList = await licenses.list();
    const userList = await users.list();
    const logList = await logs.list();

    let activeLicenses = 0;
    for (const b of licenseList.blobs) {
      const r = await getJson(licenses, b.key);
      if (r && !r.revoked) activeLicenses++;
    }

    return json(200, {
      ok: true,
      stats: {
        users: userList.blobs.length,
        licenses: licenseList.blobs.length,
        active_licenses: activeLicenses,
        logs: logList.blobs.length,
      },
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Stats API failed' });
  }
};
