export class BadRequest extends Error {}

export async function body(req) {
  let b;
  try { b = req.body; } catch { throw new BadRequest('Body must be JSON.'); }
  if (b == null || typeof b === 'string') {
    let s = typeof b === 'string' ? b : '';
    if (!s) for await (const c of req) s += c;
    try { b = s ? JSON.parse(s) : {}; } catch { throw new BadRequest('Body must be JSON.'); }
  }
  if (!b || typeof b !== 'object' || Array.isArray(b)) throw new BadRequest('Body must be a JSON object.');
  return b;
}
export function send(res, code, data) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}
export function fail(res, e) {
  if (e instanceof BadRequest) return send(res, 400, { error: e.message });
  console.error(e);
  return send(res, 500, { error: 'Something went wrong on our side. Try again.' });
}
export function cleanCities(raw) {
  if (!Array.isArray(raw)) throw new BadRequest('cities must be a list of city ids.');
  const c = raw.filter((x) => typeof x === 'string' && /^[a-z]+$/.test(x)).slice(0, 16);
  if (!c.length) throw new BadRequest('Pick at least one city.');
  return c;
}
export function cleanCounts(raw) {
  if (!raw || typeof raw !== 'object') throw new BadRequest('Add at least one country with a count.');
  const out = {};
  for (const [k, v] of Object.entries(raw)) {
    const n = Math.floor(Number(v));
    if (/^[A-Z]{3}$/.test(k) && n > 0 && n < 1e7) out[k] = n;
  }
  if (!Object.keys(out).length) throw new BadRequest('Add at least one country with a count.');
  if (Object.keys(out).length > 200) throw new BadRequest('Too many countries.');
  return out;
}
export function cleanHolders(h = {}) {
  const c = (x) => Math.min(1, Math.max(0, Number(x) || 0));
  return { us: c(h?.us), schengen: c(h?.schengen) };
}
// Best effort per instance limit, so one caller can't drain the model key.
const hits = new Map();
export function limited(req, max = 8, windowMs = 60000) {
  const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0] || 'anon';
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < windowMs);
  list.push(now); hits.set(ip, list);
  return list.length > max;
}
