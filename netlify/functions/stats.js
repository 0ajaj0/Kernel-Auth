const { json, initBlobs } = require('./_shared');
const { store, getJson } = require('./_store');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
    const { listApps } = require('./_store');
    const licenses = await store('kernel-licenses');
    const users = await store('kernel-users');
    const logs = await store('kernel-logs');
    const devices = await store('kernel-devices');
    const team = await store('kernel-team');

    const licenseList = await licenses.list();
    const userList = await users.list();
    const logList = await logs.list();
    const deviceList = await devices.list();
    const teamList = await team.list();
    const apps = await listApps();
    const staff = teamList.blobs.filter((b) => b.key.startsWith('staff:')).length;
    const resellers = teamList.blobs.filter((b) => b.key.startsWith('resellers:')).length;

    return json(200, {
      ok: true,
      stats: {
        apps: apps.length,
        users: userList.blobs.length,
        licenses: licenseList.blobs.length,
        active_licenses: licenseList.blobs.length,
        devices: deviceList.blobs.length,
        staff,
        resellers,
        logs: logList.blobs.length,
      },
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Stats API failed' });
  }
};
