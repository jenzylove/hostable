<div align="center">

<img src="docs/media/brand/mark.svg" width="84" alt="Hostable">

# Hostable

**Pick the host city your people can actually reach.**

Before you book a venue, Hostable scores every candidate city by how many of your community can get in, using official visa refusal rates, real entry rules and legal flight routes, all in a FalkorDB graph.

[![Live](https://img.shields.io/badge/live-hostable--umber.vercel.app-ff5a1f)](https://hostable-umber.vercel.app) [![Demo video](https://img.shields.io/badge/demo-YouTube-131210)](https://youtu.be/LSHR5l9eWs0) [![FalkorDB](https://img.shields.io/badge/graph-FalkorDB%20Cloud-ff5a1f)](https://www.falkordb.com) [![Built for](https://img.shields.io/badge/built%20for-Graph%20Hacks%202026-131210)](https://www.wemakedevs.org/hackathons/falkordb) [![License](https://img.shields.io/badge/license-MIT-131210)](LICENSE)

</div>

![Hostable](docs/media/hero.png)

## Start here

| | |
|---|---|
| **Live app** | https://hostable-umber.vercel.app |
| **Demo video** | https://youtu.be/LSHR5l9eWs0 |
| **Try it in 2 minutes** | [Judge fast path](#judge-fast-path-2-minutes-no-sign-up) |
| **The Cypher it runs on** | [Queries and algorithms](#the-cypher-the-product-depends-on) |
| **Graph data model** | [How it works](#how-it-works) |
| **Data sources** | [Data](#data-all-public-all-sourced) |
| **Security** | [SECURITY.md](SECURITY.md) |

---

## The problem

Global events lose people at the border, and organizers find out after the venue is booked.

- NeurIPS 2018 in Montreal: more than 100 attendees were refused visas.
- ICLR moved to Addis Ababa for 2020 over visa access, then held 2023 in Kigali.
- The IAS AIDS conference chose Kigali after Montreal refusals; African participation rose from 26% to nearly 50%.
- In 2024, Schengen consulates refused 45.9% of applications made in Nigeria (EU Commission statistics).

Every one of those decisions was made by hand, after the losses. Hostable makes it a number you see before you sign the venue contract.

## Judge fast path (2 minutes, no sign up)

1. Open **https://hostable-umber.vercel.app**.
2. Keep the sample community (or paste your own country counts) and the eight preselected cities. Press **Score cities**.
3. The departure board ranks cities by the share of your community that can be shown to get in. Tap any row to see **who you lose**: each nationality, its entry rule, the published refusal rate and its source, and a legal flight connection.
4. Move **Members holding a US visa** up and rescore: cities that admit US visa holders (Mexico City, Tbilisi) climb.
5. In **Ask the agent**, ask "Lisbon or Dubai for our people?". The agent answers from graph tools only; open the tool calls to see every Cypher query it ran.
6. **Proof** lists every query behind the last score and every data source.

![The departure board](docs/media/board.png)

## How it works

```
Community ──HAS {count}──▶ Country (nationality)
Country ──ENTRY {req}──▶ Country (destination)            199 x 199 entry rules
Country ──SCHENGEN_REFUSAL {rate}──▶ Schengen state       refusal rate at that state's consulates
Country ──REFUSED_BY {rate}──▶ Regime (Schengen, US)       overall published refusal rate
Country ──MEMBER_OF──▶ Regime                              which visa a city needs
Regime ──UNLOCKS──▶ Country                                e.g. a US visa admits you to Mexico
Country ──NEEDS_TRANSIT_VISA──▶ Regime                     EU airport transit visa list
Country ──MAIN_AIRPORT──▶ Airport ──FLIES_TO──▶ Airport    legal connection search
City ──IN──▶ Country, City ──SERVED_BY──▶ Airport
Community ──DECIDED──▶ Decision ──FOR──▶ City              the agent's decision log
```

For each candidate city, one Cypher query walks every nationality in the community to the city's country: entry rule, the refusal rate at that destination's own consulates (falling back to the regime wide rate), and any visa that unlocks entry. A second query searches for a direct flight or a one stop route through a hub that nationality is allowed to transit. Scoring then reports:

- **Keeps**: people who can be shown to get in.
- **Lost**: people who need a consular visa times the published refusal rate.
- **Unknown**: people who need a visa where no refusal rate is published, or with no legal route in the data. They are never counted as kept.

The agent (Track 01) decides with four graph tools: `score_cities`, `explain_path`, `remember_decision`, `past_decisions`. Decisions are written back to the graph, so the community's choices and their reasons persist across sessions (Track 03).

**Why only on a graph:** whether a person can attend is a chain (nationality, entry rule, refusal rate at that consulate, transit hub rule, a visa they already hold, the city), summed across a whole community for every city. In FalkorDB that is one traversal per city, and every number on screen maps back to a path you can inspect.

## The Cypher the product depends on

All scoring runs in FalkorDB. Remove the graph and nothing on the board can be computed. Full source: [`lib/score.js`](lib/score.js), [`lib/agent.js`](lib/agent.js), loader [`scripts/load.mjs`](scripts/load.mjs).

**1. Entry and refusal, one traversal per city** (every nationality in the community to the city's country):

```cypher
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
       collect(DISTINCT {visa: v.id, only: u.only}) AS unlocks
```

**2. Legal route search with `algo.SPpaths`**: FalkorDB's shortest paths algorithm returns up to six shortest flight paths (up to three legs) from each nationality's main airport. Every hub on each path is checked against the transit rules (EU airport transit visa list; US, UK and Canada hubs need entry eligibility) and the shortest legal path wins. Example: for Nigerians to Tbilisi the shortest path LOS → CDG → TBS is blocked (Paris needs an airport transit visa), so Hostable routes LOS → IST → TBS. See `lib/score.js` for the live query.

```cypher
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
    ELSE NULL END) AS hubs
RETURN iso, origin, dest, same, direct, hubs[0..3] AS hubs
```

**3. `algo.pageRank`**: the `hub_rank` agent tool ranks the hubs that feed a host city by PageRank over the route network.

**4. Organization workspaces**: `(:Org)-[:MEMBERS {count}]->(:Country)`, `(:Org)-[:RAN]->(:Run)`, `(:Org)-[:DECIDED]->(:Decision)-[:FOR]->(:City)`. An organization creates a private workspace (secret key shown once, only its hash stored); every score and agent decision is saved to its part of the graph.

**5. Agent tools** (`score_cities`, `explain_path`, `what_if`, `hub_rank`, `org_history`, `remember_decision`, `past_decisions`): `explain_path` returns the entry edge, the refusal edges with their sources and the unlock edges for one nationality and city; `remember_decision` writes `(:Community)-[:DECIDED]->(:Decision)-[:FOR]->(:City)`; `past_decisions` reads them back so a community's choices and reasons persist across sessions.

The live app shows the exact queries and their timings for every score under **Data and proof**.

## Data (all public, all sourced)

| Data | Source |
|---|---|
| Entry rules, 199 passports | [Passport Index dataset](https://github.com/ilyankou/passport-index-dataset) |
| Schengen refusal rates by country of application and Schengen state, 2024 | [EU Commission visa statistics](https://home-affairs.ec.europa.eu/policies/schengen/visa-policy/short-stay-visas-issued-schengen-countries_en) |
| US B visa adjusted refusal rates by nationality, FY2024 | [US State Department](https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics/nonimmigrant-visa-statistics.html) |
| Airport transit visa list | EU Visa Code, Annex IV |
| Flight routes | [OpenFlights](https://openflights.org/data.php) (2014 snapshot, used only to check a legal connection exists) |

`data/build_data.py` rebuilds `data/seed.json` from the raw files; `scripts/load.mjs` loads it into FalkorDB (1,156 nodes, 69,284 edges).

## Scope and limits

- Refusal rates are published for Schengen and the US. Other visa countries (UK, Canada, Thailand and more) show as **unknown**, not as kept.
- EU statistics are by country where people apply, the EU's own measure, used as a proxy for nationality.
- UK, US and Canadian hubs are treated conservatively: a connection there needs entry eligibility.
- Route data is a 2014 snapshot; it confirms a legal connection can exist, not today's schedule.
- Only country counts are entered. No names, passports or personal data are collected or stored.

## Run it yourself

```bash
npm install
# .env: FALKORDB_URL=falkor://user:pass@host:port, LLM_API_KEY, LLM_BASE_URL, LLM_MODEL (any OpenAI compatible endpoint)
node --env-file=.env scripts/load.mjs
node --test test/
npx vercel dev
```

## Tracks

- **Company Brain**: the community, its nationalities, candidate cities and the decisions made about them live in one graph, and the agent answers and acts across all of it.
- **Agents That Act on Connected Data**: the agent decides from multi hop graph queries and records its decision, with every step traceable.

## How this was built

Built during Graph Hacks (Oct 15 to 18, 2026). AI coding assistants were used for parts of the code and UI; the idea, the graph model, the data sourcing and every number were designed and checked by the author.

## License

MIT
