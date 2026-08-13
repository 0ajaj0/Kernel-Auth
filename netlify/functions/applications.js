const { json, readJsonBody } = require('./_shared');
const { listApps, getAppById, createApp, deleteApp, appendLog } = require('./_store');

function adminOk(event) {
  const h = event.headers['x-kernel-admin-key'] || event.headers['X-Kernel-Admin-Key'];
  return h && h === process.env.KERNEL_ADMIN_PASSWORD;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    if (event.httpMethod === 'GET') {
      const id = event.queryStringParameters?.id;
      if (id) {
        const app = await getAppById(id);
        if (!app) return json(404, { ok: false, error: 'Application not found' });
        return json(200, { ok: true, app });
      }
      const apps = await listApps();
      return json(200, { ok: true, apps });
    }

    if (!adminOk(event)) return json(401, { ok: false, error: 'Unauthorized' });

    if (event.httpMethod === 'POST') {
      const body = await readJsonBody(event);
      const app = await createApp({
        app_name: body.app_name,
        version: body.version,
      });
      return json(201, { ok: true, app });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { ok: false, error: 'Missing id' });
      await deleteApp(id);
      return json(200, { ok: true, deleted: id });
    }

    return json(405, { ok: false, error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Applications API failed' });
  }
};
