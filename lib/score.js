import { run } from './db.js';
import { classify, summarise } from './classify.js';

const ENTRY_Q = `
MATCH (city:City {id:$city})-[:IN]->(d:Country)
UNWIND $members AS m
MATCH (n:Country {iso3:m.iso3})
OPTIONAL MATCH (n)-[e:ENTRY]->(d)
OPTIONAL MATCH (d)-[:MEMBER_OF]->(reg:Regime)
OPTIONAL MATCH (n)-[sr:SCHENGEN_REFUSAL]->(d)
OPTIONAL MATCH (n)-[rr:REFUSED_BY]->(reg)
OPTIONAL MATCH (v:Regime)-[u:UNLOCKS]->(d)
RETURN n.iso3 AS iso3, n.name AS name, m.count AS count, n.iso3 = d.iso3 AS home, e.req AS req,
       reg.id AS regime, sr.rate AS stateRate, rr.rate AS regimeRate,
       collect(DISTINCT {visa: v.id, only: u.only}) AS unlocks`;

// Route search uses FalkorDB's algo.SPpaths: the shortest flight paths (up to 3 legs) from each
// nationality's main airport to the city. Each path's hubs are then checked against the transit rules:
// Schengen hubs need an airport transit visa for the EU Annex IV list (unless flying into Schengen anyway);
// US, Canada and UK hubs are treated conservatively: you must be allowed to enter.
const ROUTE_Q = `
MATCH (city:City {id:$city})-[:SERVED_BY]->(t:Airport)
UNWIND $isos AS iso
MATCH (n:Country {iso3:iso})-[:MAIN_AIRPORT]->(o:Airport)
OPTIONAL MATCH (n)-[atv:NEEDS_TRANSIT_VISA]->(:Regime {id:'SCHENGEN'})
CALL algo.SPpaths({sourceNode:o, targetNode:t, relTypes:['FLIES_TO'], maxLen:3, pathCount:6}) YIELD path
WITH iso, o, t, atv IS NOT NULL AS atv, [h IN nodes(path)[1..-1] | h] AS hubs
UNWIND (CASE WHEN size(hubs) = 0 THEN [null] ELSE hubs END) AS h
OPTIONAL MATCH (h)-[:IN]->(hc:Country)
OPTIONAL MATCH (:Country {iso3:iso})-[he:ENTRY]->(hc)
WITH iso, o, t, atv, hubs, collect({iata:h.iata, c:hc.iso3, schengen:hc.schengen, req:he.req}) AS info
RETURN iso, o.iata AS origin, t.iata AS dest, o = t AS same, atv, [x IN info WHERE x.iata IS NOT NULL] AS hops`;

const ENTRY_EU = (x, nat, dest, destSchengen, atv) => {
  if (x.c === nat || x.c === dest) return true;
  if (x.schengen) return destSchengen || !atv;
  if (['USA', 'CAN', 'GBR'].includes(x.c)) return !['visa required', 'no admission'].includes(x.req);
  return true;
};

function pickRoute(rows, nat, dest, destSchengen) {
  const mine = rows.filter((r) => r.iso === nat);
  if (!mine.length) return { route: null, checked: 0, blocked: [] };
  if (mine[0].same) return { route: `${mine[0].origin} (home)`, checked: 0, blocked: [] };
  const sorted = mine.sort((a, b) => a.hops.length - b.hops.length);
  const blocked = new Set();
  for (const r of sorted) {
    const bad = r.hops.filter((x) => !ENTRY_EU(x, nat, dest, destSchengen, r.atv));
    if (!bad.length) return { route: [r.origin, ...r.hops.map((x) => x.iata), r.dest].join(' → '), checked: mine.length, blocked: [...blocked] };
    bad.forEach((x) => blocked.add(x.iata));
  }
  return { route: null, checked: mine.length, blocked: [...blocked] };
}

export async function scoreCity(cityId, counts, holders, log) {
  const members = Object.entries(counts).map(([iso3, count]) => ({ iso3, count: Number(count) }));
  const rows = await run(`entry rules and refusal rates for ${cityId}`, ENTRY_Q, { city: cityId, members }, log);
  const routes = await run(`algo.SPpaths routes to ${cityId}`, ROUTE_Q, { city: cityId, isos: members.map((m) => m.iso3) }, log);
  const cityRow = await run('city', 'MATCH (c:City {id:$id})-[:IN]->(d:Country) RETURN c.id AS id, c.name AS name, d.name AS country, d.iso3 AS iso3, d.schengen AS schengen', { id: cityId });
  const city = cityRow[0];
  if (!city) throw new Error(`unknown city ${cityId}`);
  const classified = rows.map((r) => {
    const pr = r.home ? { route: 'home', blocked: [] } : pickRoute(routes, r.iso3, city.iso3, city.schengen);
    const c = classify({ ...r, unlocks: (r.unlocks || []).filter((u) => u.visa), route: pr.route }, holders);
    if (pr.route === null && pr.blocked.length) c.route = `no legal route found (${pr.blocked.slice(0, 3).join(', ')} need a transit visa)`;
    return c;
  });
  delete city.schengen;
  return summarise(city, classified);
}

export async function scoreCities(cities, counts, holders = {}) {
  const log = [];
  const t = Date.now();
  const results = [];
  results.push(...(await Promise.all(cities.map((c) => scoreCity(c, counts, holders, log)))));
  results.sort((a, b) => b.keepsPct - a.keepsPct || a.unknownRisk - b.unknownRisk);
  return { results, meta: { queries: log, totalMs: Date.now() - t } };
}
