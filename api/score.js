import { body, send, fail, cleanCounts, cleanHolders, cleanCities, BadRequest } from '../lib/http.js';
import { scoreCities } from '../lib/score.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const b = await body(req);
    send(res, 200, await scoreCities(cleanCities(b.cities), cleanCounts(b.counts), cleanHolders(b.holders)));
  } catch (e) {
    fail(res, /unknown city/.test(e.message) ? new BadRequest(e.message) : e);
  }
}
