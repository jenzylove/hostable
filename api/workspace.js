import { body, send, fail, limited } from '../lib/http.js';
import { createWorkspace, auth, loadWorkspace } from '../lib/workspace.js';

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
    const b = await body(req);
    if (b.action === 'create') {
      if (limited(req, 5)) return send(res, 429, { error: 'Too many new workspaces. Wait a minute.' });
      return send(res, 200, await createWorkspace(b.name));
    }
    const org = await auth(b.workspace);
    if (!org) return send(res, 400, { error: 'Workspace id and key are required.' });
    send(res, 200, await loadWorkspace(org));
  } catch (e) { fail(res, e); }
}
