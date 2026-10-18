// Loads data/seed.json into FalkorDB. Run: node --env-file=.env scripts/load.mjs
import { readFileSync } from 'node:fs';
import { graph } from '../lib/db.js';

const seed = JSON.parse(readFileSync(new URL('../data/seed.json', import.meta.url), 'utf8'));
const g = await graph();
const q = (c, params) => g.query(c, { params });

async function batched(label, rows, cypher, size = 2000) {
  for (let i = 0; i < rows.length; i += size) await q(cypher, { rows: rows.slice(i, i + size) });
  console.log(label, rows.length);
}

try { await g.delete(); } catch {}
const g2 = await graph();
await g2.query("CREATE (:Regime {id:'SCHENGEN', name:'Schengen area'}), (:Regime {id:'US', name:'United States'})");
for (const idx of ['CREATE INDEX FOR (c:Country) ON (c.iso3)', 'CREATE INDEX FOR (a:Airport) ON (a.iata)',
  'CREATE INDEX FOR (c:City) ON (c.id)', 'CREATE INDEX FOR (m:Community) ON (m.id)']) await q(idx);

const schengen = new Set(seed.schengenStates);
await batched('countries', seed.countries.map((c) => ({ ...c, schengen: schengen.has(c.iso3) })),
  'UNWIND $rows AS r CREATE (:Country {iso3:r.iso3, name:r.name, schengen:r.schengen})');
await q("MATCH (c:Country {schengen:true}), (s:Regime {id:'SCHENGEN'}) CREATE (c)-[:MEMBER_OF]->(s)");
await q("MATCH (c:Country {iso3:'USA'}), (s:Regime {id:'US'}) CREATE (c)-[:MEMBER_OF]->(s)");
await batched('entry rules', seed.entry.map(([p, d, r]) => ({ p, d, r })),
  'UNWIND $rows AS r MATCH (a:Country {iso3:r.p}), (b:Country {iso3:r.d}) CREATE (a)-[:ENTRY {req:r.r}]->(b)', 4000);
await batched('schengen refusal by state', seed.schengenRefusal,
  'UNWIND $rows AS r MATCH (a:Country {iso3:r.apply}), (b:Country {iso3:r.state}) CREATE (a)-[:SCHENGEN_REFUSAL {rate:r.rate, decided:r.decided, refused:r.refused, year:2024}]->(b)');
await batched('schengen refusal overall', Object.entries(seed.schengenAll).map(([iso, v]) => ({ iso, ...v })),
  "UNWIND $rows AS r MATCH (a:Country {iso3:r.iso}), (s:Regime {id:'SCHENGEN'}) CREATE (a)-[:REFUSED_BY {rate:r.rate, decided:r.decided, refused:r.refused, year:2024, source:'EU Commission Schengen visa statistics 2024'}]->(s)");
await batched('us refusal', Object.entries(seed.usRefusal).map(([iso, rate]) => ({ iso, rate })),
  "UNWIND $rows AS r MATCH (a:Country {iso3:r.iso}), (s:Regime {id:'US'}) CREATE (a)-[:REFUSED_BY {rate:r.rate, year:2024, source:'US State Dept B visa adjusted refusal rate FY2024'}]->(s)");
await batched('schengen ATV list', seed.schengenAtv.map((iso) => ({ iso })),
  "UNWIND $rows AS r MATCH (a:Country {iso3:r.iso}), (s:Regime {id:'SCHENGEN'}) CREATE (a)-[:NEEDS_TRANSIT_VISA {source:'EU Visa Code Annex IV'}]->(s)");
await batched('visa unlocks', seed.unlocks,
  'UNWIND $rows AS r MATCH (s:Regime {id:r.visa}), (d:Country {iso3:r.dest}) CREATE (s)-[:UNLOCKS {only:r.only, source:r.source, url:r.url}]->(d)');
await batched('airports', seed.airports,
  'UNWIND $rows AS r MATCH (c:Country {iso3:r.iso3}) CREATE (a:Airport {iata:r.iata, name:r.name, city:r.city, lat:r.lat, lon:r.lon})-[:IN]->(c)');
await batched('main airports', Object.entries(seed.mainAirport).map(([iso, iata]) => ({ iso, iata })),
  'UNWIND $rows AS r MATCH (c:Country {iso3:r.iso}), (a:Airport {iata:r.iata}) CREATE (c)-[:MAIN_AIRPORT]->(a)');
await batched('routes', seed.routes.map(([a, b]) => ({ a, b })),
  'UNWIND $rows AS r MATCH (x:Airport {iata:r.a}), (y:Airport {iata:r.b}) CREATE (x)-[:FLIES_TO]->(y)', 5000);
await batched('cities', seed.cities,
  'UNWIND $rows AS r MATCH (c:Country {iso3:r.iso3}), (a:Airport {iata:r.airport}) CREATE (x:City {id:r.id, name:r.name})-[:IN]->(c), (x)-[:SERVED_BY]->(a)');
const n = await q('MATCH (n) RETURN count(n) AS nodes');
const e = await q('MATCH ()-[r]->() RETURN count(r) AS edges');
console.log('done', n.data[0], e.data[0]);
process.exit(0);
