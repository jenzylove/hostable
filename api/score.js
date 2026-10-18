import { body, send, fail, cleanCounts, cleanHolders, cleanCities, BadRequest } from '../lib/http.js';
import { scoreCities } from '../lib/score.js';
import { auth, saveRun } from '../lib/workspace.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const b = await body(req);
    const org = await auth(b.workspace);
    const counts = cleanCounts(b.counts);
    const out = await scoreCities(cleanCities(b.cities), counts, cleanHolders(b.holders));
    if (org) { await saveRun(org, counts, out.results, out.meta.queries); out.workspace = org.name; }
    send(res, 200, out);
  } catch (e) {
    fail(res, /unknown city/.test(e.message) ? new BadRequest(e.message) : e);
  }
}
