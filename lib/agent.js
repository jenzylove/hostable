import { run } from './db.js';
import { scoreCities } from './score.js';
import { loadWorkspace } from './workspace.js';

const TOOLS = [
  { type: 'function', function: { name: 'score_cities', description: 'Score candidate host cities for this community: share kept, expected people lost to visa refusals, unknown risk, and who is lost per nationality with route. Use for any comparison or recommendation.', parameters: { type: 'object', properties: { cities: { type: 'array', items: { type: 'string' }, description: 'city ids' } }, required: ['cities'] } } },
  { type: 'function', function: { name: 'explain_path', description: 'Show the graph path for one nationality and one city: entry rule, refusal rate edge with its source, unlock rules, and the flight connection.', parameters: { type: 'object', properties: { iso3: { type: 'string' }, city: { type: 'string' } }, required: ['iso3', 'city'] } } },
  { type: 'function', function: { name: 'remember_decision', description: 'Save the recommended city and the reason to this community\'s decision log in the graph.', parameters: { type: 'object', properties: { city: { type: 'string' }, reason: { type: 'string' } }, required: ['city', 'reason'] } } },
  { type: 'function', function: { name: 'what_if', description: 'Rescore cities assuming a share of members already hold a US or Schengen visa (0 to 1). Use for questions about visa holders or invitation strategy.', parameters: { type: 'object', properties: { cities: { type: 'array', items: { type: 'string' } }, us: { type: 'number' }, schengen: { type: 'number' } }, required: ['cities'] } } },
  { type: 'function', function: { name: 'hub_rank', description: 'Rank the flight hubs that routes into a city depend on, using FalkorDB PageRank over the route network.', parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] } } },
  { type: 'function', function: { name: 'org_history', description: 'Read this organization workspace from the graph: its saved community, past scoring runs and past decisions.', parameters: { type: 'object', properties: {} } } },
  { type: 'function', function: { name: 'past_decisions', description: 'Read this community\'s earlier decisions from the graph.', parameters: { type: 'object', properties: {} } } },
];

const EXPLAIN_Q = `
MATCH (n:Country {iso3:$iso3}), (c:City {id:$city})-[:IN]->(d:Country)
OPTIONAL MATCH p1 = (n)-[:ENTRY]->(d)
OPTIONAL MATCH (d)-[:MEMBER_OF]->(reg:Regime)
OPTIONAL MATCH (n)-[sr:SCHENGEN_REFUSAL]->(d)
OPTIONAL MATCH (n)-[rr:REFUSED_BY]->(reg)
OPTIONAL MATCH (v:Regime)-[u:UNLOCKS]->(d)
RETURN n.name AS nationality, d.name AS country, [r IN relationships(p1) | r.req][0] AS entry,
  reg.name AS regime, sr.rate AS rateAtThisCountry, sr.decided AS decidedHere, rr.rate AS regimeRate, rr.source AS rateSource,
  collect(DISTINCT {visa:v.id, only:u.only, source:u.source}) AS unlocks`;

function communityId(counts) {
  const s = Object.entries(counts).sort().map(([k, v]) => `${k}${v}`).join('');
  let h = 0;
  for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return `c${h.toString(36)}`;
}

export async function ask({ org, question, counts, cities, holders = {} }) {
  const key = process.env.LLM_API_KEY || process.env.OPENAI_API_KEY;
  if (!key) throw new Error('The agent has no model key set (LLM_API_KEY). Scoring still works.');
  const base = process.env.LLM_BASE_URL || 'https://api.openai.com/v1';
  const cid = org ? org.id : communityId(counts);
  const toolCalls = [];
  const cityList = (await run('cities', 'MATCH (c:City)-[:IN]->(d:Country) RETURN c.id AS id, c.name AS name, d.name AS country')).map((c) => `${c.id} (${c.name}, ${c.country})`).join('; ');
  const messages = [
    { role: 'system', content: `You are Hostable, an agent that helps event organizers pick a host city their community can actually reach. Every fact must come from your tools, which query a FalkorDB graph of entry rules, official refusal rates (EU Schengen 2024, US FY2024) and flight connections. Never invent numbers. Expected lost = people needing a visa x published refusal rate. Use each requirement exactly as given: "online visa" and "online travel authorisation" still require an application, so never call them "no visa". "Unknown risk" means a visa is needed but no refusal rate is published, or no route was found. Answer in short plain sentences, name the cities and nationalities, give the numbers, and say which rule drives each loss. When you recommend a city, call remember_decision. Available cities: ${cityList}. Candidate cities the organizer selected: ${cities.join(', ')}. Organization: ${org ? org.name + ' (private workspace; call org_history for its past runs and decisions)' : 'anonymous, no workspace'}. Community country counts: ${JSON.stringify(counts)}. Share holding a US visa: ${holders.us || 0}, Schengen visa: ${holders.schengen || 0}.` },
    { role: 'user', content: String(question).slice(0, 500) },
  ];
  for (let step = 0; step < 5; step++) {
    const r = await fetch(`${base}/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: process.env.LLM_MODEL || 'gpt-4.1-mini', messages, tools: TOOLS, temperature: 0.2 }),
    });
    if (!r.ok) throw new Error(`model error ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const msg = (await r.json()).choices[0].message;
    messages.push(msg);
    if (!msg.tool_calls?.length) return { answer: msg.content, toolCalls };
    for (const tc of msg.tool_calls) {
      const args = JSON.parse(tc.function.arguments || '{}');
      const log = [];
      const t = Date.now();
      let result;
      try {
        if (tc.function.name === 'score_cities') {
          const s = await scoreCities(args.cities?.length ? args.cities : cities, counts, holders);
          log.push(...s.meta.queries);
          result = s.results.map((x) => ({ city: x.city.name, keepsPct: x.keepsPct, expectedLost: x.expectedLost, unknownRisk: x.unknownRisk, total: x.total,
            lostBy: x.lostBy.filter((l) => l.expectedLost > 0 || l.unknownRisk > 0).slice(0, 6).map((l) => ({ nationality: l.name, count: l.count, status: l.status, requirement: l.requirement, refusalRate: l.refusalRate, rateSource: l.rateSource, expectedLost: l.expectedLost, unknownRisk: l.unknownRisk, route: l.route })) }));
        } else if (tc.function.name === 'what_if') {
          const h = { us: Math.min(1, Math.max(0, Number(args.us) || 0)), schengen: Math.min(1, Math.max(0, Number(args.schengen) || 0)) };
          const s = await scoreCities(args.cities?.length ? args.cities : cities, counts, h);
          log.push(...s.meta.queries);
          result = { assumed: h, results: s.results.map((x) => ({ city: x.city.name, keepsPct: x.keepsPct, expectedLost: x.expectedLost, unknownRisk: x.unknownRisk })) };
        } else if (tc.function.name === 'hub_rank') {
          result = await run(`PageRank hubs for ${args.city}`, `CALL algo.pageRank('Airport','FLIES_TO') YIELD node, score
            WITH node, score MATCH (node)-[:FLIES_TO]->(:Airport)<-[:SERVED_BY]-(:City {id:$city})
            MATCH (node)-[:IN]->(c:Country) RETURN node.iata AS hub, node.city AS city, c.name AS country, score AS pagerank ORDER BY score DESC LIMIT 8`, { city: String(args.city) }, log);
        } else if (tc.function.name === 'org_history') {
          result = org ? await loadWorkspace(org) : { note: 'No workspace. The organizer can create one to keep runs and decisions.' };
        } else if (tc.function.name === 'explain_path') {
          result = await run(`path ${args.iso3} to ${args.city}`, EXPLAIN_Q, args, log);
        } else if (tc.function.name === 'remember_decision') {
          result = await run('remember decision', `MERGE (m:Org {id:$cid}) WITH m MATCH (c:City {id:$city})
            OPTIONAL MATCH (m)-[:DECIDED]->(old:Decision)-[:FOR]->(c) WITH m, c, count(old) AS prior WHERE prior < 20
            CREATE (m)-[:DECIDED]->(x:Decision {reason:$reason, at:$at})-[:FOR]->(c) RETURN x.at AS saved`, { cid, city: String(args.city), reason: String(args.reason).slice(0, 400), at: new Date().toISOString() }, log);
          if (!result.length) result = { saved: false, error: 'not saved: unknown city or decision limit reached' };
        } else if (tc.function.name === 'past_decisions') {
          result = await run('past decisions', 'MATCH (:Org {id:$cid})-[:DECIDED]->(x:Decision)-[:FOR]->(c:City) RETURN c.name AS city, x.reason AS reason, x.at AS at ORDER BY x.at DESC LIMIT 5', { cid }, log);
        } else result = { error: 'unknown tool' };
      } catch (e) {
        result = { error: e.message };
      }
      toolCalls.push({ tool: tc.function.name, args, cypher: log.map((l) => l.cypher).join('\n\n'), ms: Date.now() - t });
      messages.push({ role: 'tool', tool_call_id: tc.id, content: JSON.stringify(result).slice(0, 12000) });
    }
  }
  return { answer: 'I ran out of steps before finishing. Try a narrower question.', toolCalls };
}
