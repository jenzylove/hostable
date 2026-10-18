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

// One legal connection: direct, or one stop at a hub this nationality may transit.
// Schengen hubs need an airport transit visa for the EU Annex IV list (unless flying into Schengen anyway);
// US, Canada and UK hubs are treated conservatively: you must be allowed to enter.
const ROUTE_Q = `
MATCH (city:City {id:$city})-[:SERVED_BY]->(t:Airport), (city)-[:IN]->(d:Country)
UNWIND $isos AS iso
MATCH (n:Country {iso3:iso})-[:MAIN_AIRPORT]->(o:Airport)
OPTIONAL MATCH (o)-[dir:FLIES_TO]->(t)
OPTIONAL MATCH (o)-[:FLIES_TO]->(h:Airport)-[:FLIES_TO]->(t)
OPTIONAL MATCH (h)-[:IN]->(hc:Country)
OPTIONAL MATCH (n)-[he:ENTRY]->(hc)
OPTIONAL MATCH (n)-[atv:NEEDS_TRANSIT_VISA]->(:Regime {id:'SCHENGEN'})
WITH iso, o, t, d, dir, h, hc, he, atv
WITH iso, o.iata AS origin, t.iata AS dest, o = t AS same, dir IS NOT NULL AS direct,
  collect(CASE WHEN h IS NULL THEN NULL
    WHEN hc.iso3 = iso OR hc.iso3 = d.iso3 THEN h.iata
    WHEN hc.schengen AND (d.schengen OR atv IS NULL) THEN h.iata
    WHEN hc.iso3 IN ['USA','CAN','GBR'] AND NOT he.req IN ['visa required','no admission'] THEN h.iata
    WHEN NOT hc.schengen AND NOT hc.iso3 IN ['USA','CAN','GBR'] THEN h.iata
    ELSE NULL END) AS hubs,
  collect(CASE WHEN h IS NOT NULL AND hc.schengen AND NOT d.schengen AND atv IS NOT NULL THEN h.iata ELSE NULL END) AS blocked
RETURN iso, origin, dest, same, direct, hubs[0..3] AS hubs, blocked[0..3] AS blocked`;

export async function scoreCity(cityId, counts, holders, log) {
  const members = Object.entries(counts).map(([iso3, count]) => ({ iso3, count: Number(count) }));
  const rows = await run(`entry rules and refusal rates for ${cityId}`, ENTRY_Q, { city: cityId, members }, log);
  const routes = await run(`legal connections to ${cityId}`, ROUTE_Q, { city: cityId, isos: members.map((m) => m.iso3) }, log);
  const byIso = Object.fromEntries(routes.map((r) => [r.iso, r]));
  const cityRow = await run('city', 'MATCH (c:City {id:$id})-[:IN]->(d:Country) RETURN c.id AS id, c.name AS name, d.name AS country, d.iso3 AS iso3', { id: cityId });
  const city = cityRow[0];
  if (!city) throw new Error(`unknown city ${cityId}`);
  const classified = rows.map((r) => {
    const rt = byIso[r.iso3];
    let route;
    if (!rt) route = null;
    else if (rt.same || r.home) route = `${rt.origin} (home)`;
    else if (rt.direct) route = `${rt.origin} → ${rt.dest}`;
    else if (rt.hubs?.length) route = `${rt.origin} → ${rt.hubs[0]} → ${rt.dest}`;
    else route = null;
    const c = classify({ ...r, unlocks: (r.unlocks || []).filter((u) => u.visa), route }, holders);
    if (route === null && rt?.blocked?.length) c.route = `no legal one stop route (${rt.blocked.join(', ')} need an airport transit visa)`;
    return c;
  });
  return summarise(city, classified);
}

export async function scoreCities(cities, counts, holders = {}) {
  const log = [];
  const t = Date.now();
  const results = [];
  for (const c of cities) results.push(await scoreCity(c, counts, holders, log));
  results.sort((a, b) => b.keepsPct - a.keepsPct || a.unknownRisk - b.unknownRisk);
  return { results, meta: { queries: log, totalMs: Date.now() - t } };
}
