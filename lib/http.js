export async function body(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  let s = '';
  for await (const c of req) s += c;
  return s ? JSON.parse(s) : {};
}
export function send(res, code, data) {
  res.statusCode = code;
  res.setHeader('content-type', 'application/json');
  res.setHeader('cache-control', 'no-store');
  res.end(JSON.stringify(data));
}
export function cleanCounts(raw) {
  const out = {};
  for (const [k, v] of Object.entries(raw || {})) {
    const n = Math.floor(Number(v));
    if (/^[A-Z]{3}$/.test(k) && n > 0 && n < 1e7) out[k] = n;
  }
  if (!Object.keys(out).length) throw new Error('Add at least one country with a count.');
  if (Object.keys(out).length > 200) throw new Error('Too many countries.');
  return out;
}
export function cleanHolders(h = {}) {
  const c = (x) => Math.min(1, Math.max(0, Number(x) || 0));
  return { us: c(h.us), schengen: c(h.schengen) };
}
