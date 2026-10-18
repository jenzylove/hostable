import { body, send, fail, cleanCounts, cleanHolders, cleanCities, limited } from '../lib/http.js';
import { ask } from '../lib/agent.js';
import { auth } from '../lib/workspace.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  if (limited(req)) return send(res, 429, { error: 'Too many questions in a minute. Wait a moment and ask again.' });
  try {
    const b = await body(req);
    if (typeof b.question !== 'string' || !b.question.trim()) return send(res, 400, { error: 'Ask a question.' });
    const org = await auth(b.workspace);
    send(res, 200, await ask({ org, question: b.question, counts: cleanCounts(b.counts), cities: cleanCities(b.cities), holders: cleanHolders(b.holders) }));
  } catch (e) {
    fail(res, e);
  }
}
