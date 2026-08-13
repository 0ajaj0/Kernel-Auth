const { json, readJsonBody, initBlobs } = require('./_shared');
const { listApps, getAppById, createApp, deleteApp, appendLog, store, setJson } = require('./_store');

function adminOk(event) {
  const h = event.headers['x-kernel-admin-key'] || event.headers['X-Kernel-Admin-Key'];
  return h && h === process.env.KERNEL_ADMIN_PASSWORD;
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: { 'Access-Control-Allow-Origin': '*' } };
  }

  try {
    initBlobs(event);
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

    if (event.httpMethod === 'PATCH') {
      const body = await readJsonBody(event);
      const id = body.id || event.queryStringParameters?.id;
      if (!id) return json(400, { ok: false, error: 'Missing id' });
      const s = await store('kernel-apps');
      const app = await getAppById(id);
      if (!app) return json(404, { ok: false, error: 'Application not found' });
      const settings = body.settings || {};
      const updated = {
        ...app,
        ...(body.app_name != null ? { app_name: String(body.app_name).trim() } : {}),
        ...(body.version != null ? { version: String(body.version).trim() } : {}),
        settings: {
          ...(app.settings || {}),
          ...settings,
          updated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      };
      await setJson(s, id, updated);
      await appendLog({ type: 'app_updated', app_id: id });
      return json(200, { ok: true, app: updated });
    }

    if (event.httpMethod === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return json(400, { ok: false, error: 'Missing id' });
      await deleteApp(id);
      const apps = await listApps();
      return json(200, { ok: true, deleted: id, apps });
    }

    return json(405, { ok: false, error: 'Method not allowed' });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Applications API failed' });
  }
};
