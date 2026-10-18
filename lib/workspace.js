import { createHash, randomBytes } from 'node:crypto';
import { run } from './db.js';
import { BadRequest } from './http.js';

const hash = (k) => createHash('sha256').update(String(k)).digest('hex');

// A workspace is an organization's private corner of the graph: its community, its runs and its decisions.
// Access is by a secret key shown once at creation; only the key's hash is stored.
export async function createWorkspace(name) {
  const clean = String(name || '').trim().slice(0, 60);
  if (!clean) throw new BadRequest('Name your organization.');
  const id = 'org_' + randomBytes(6).toString('hex');
  const key = randomBytes(18).toString('base64url');
  await run('create workspace', 'CREATE (:Org {id:$id, name:$name, keyHash:$h, created:$at})', { id, name: clean, h: hash(key), at: new Date().toISOString() });
  return { id, key, name: clean };
}

export async function auth(ws) {
  if (!ws || !ws.id || !ws.key) return null;
  const r = await run('auth', 'MATCH (o:Org {id:$id}) RETURN o.keyHash AS h, o.name AS name', { id: String(ws.id) });
  if (!r[0] || r[0].h !== hash(ws.key)) throw new BadRequest('Workspace key is not valid.');
  return { id: String(ws.id), name: r[0].name };
}

export async function saveRun(org, counts, results, log) {
  await run('save community', 'MATCH (o:Org {id:$id})-[m:MEMBERS]->() DELETE m', { id: org.id }, log);
  await run('save community', 'MATCH (o:Org {id:$id}) UNWIND $rows AS r MATCH (c:Country {iso3:r.iso3}) CREATE (o)-[:MEMBERS {count:r.count}]->(c)',
    { id: org.id, rows: Object.entries(counts).map(([iso3, count]) => ({ iso3, count })) }, log);
  await run('log run', 'MATCH (o:Org {id:$id}) CREATE (o)-[:RAN]->(x:Run {at:$at, best:$best, keepsPct:$pct, cities:$cities, total:$total})',
    { id: org.id, at: new Date().toISOString(), best: results[0]?.city.name || '', pct: results[0]?.keepsPct || 0,
      cities: results.map((r) => `${r.city.name} ${r.keepsPct}%`).join(', '), total: results[0]?.total || 0 }, log);
}

export async function loadWorkspace(org) {
  const counts = await run('members', 'MATCH (:Org {id:$id})-[m:MEMBERS]->(c:Country) RETURN c.iso3 AS iso3, m.count AS count', { id: org.id });
  const runs = await run('runs', 'MATCH (:Org {id:$id})-[:RAN]->(x:Run) RETURN x.at AS at, x.best AS best, x.keepsPct AS keepsPct, x.cities AS cities ORDER BY x.at DESC LIMIT 8', { id: org.id });
  const decisions = await run('decisions', 'MATCH (:Org {id:$id})-[:DECIDED]->(x:Decision)-[:FOR]->(c:City) RETURN c.name AS city, x.reason AS reason, x.at AS at ORDER BY x.at DESC LIMIT 8', { id: org.id });
  return { name: org.name, counts: Object.fromEntries(counts.map((c) => [c.iso3, c.count])), runs, decisions };
}
