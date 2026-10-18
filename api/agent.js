import { body, send, cleanCounts, cleanHolders } from '../lib/http.js';
import { ask } from '../lib/agent.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  try {
    const b = await body(req);
    if (!b.question) return send(res, 400, { error: 'Ask a question.' });
    const cities = (b.cities || []).filter((c) => /^[a-z]+$/.test(c)).slice(0, 16);
    send(res, 200, await ask({ question: b.question, counts: cleanCounts(b.counts), cities, holders: cleanHolders(b.holders) }));
  } catch (e) {
    send(res, 500, { error: e.message });
  }
}
