import { body, send, cleanCounts, cleanHolders } from '../lib/http.js';
import { scoreCities } from '../lib/score.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const b = await body(req);
    const cities = (b.cities || []).filter((c) => /^[a-z]+$/.test(c)).slice(0, 16);
    if (!cities.length) return send(res, 400, { error: 'Pick at least one city.' });
    send(res, 200, await scoreCities(cities, cleanCounts(b.counts), cleanHolders(b.holders)));
  } catch (e) {
    send(res, /count|countries|city/.test(e.message) ? 400 : 500, { error: e.message });
  }
}
