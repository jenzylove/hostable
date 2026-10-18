<div align="center">

# Hostable

**Pick the city your people can actually reach.**

Before you book a venue, Hostable scores every candidate host city by how many of your own community can get in, using official visa refusal rates and real entry rules, and shows who you lose and why.

[**Live app**](https://hostable-umber.vercel.app) · Built on **FalkorDB** for Graph Hacks: Context for AI Agents (WeMakeDevs × FalkorDB)

![FalkorDB](https://img.shields.io/badge/graph-FalkorDB%20Cloud-ff5a1f) ![Tracks](https://img.shields.io/badge/tracks-Company%20Brain%20%C2%B7%20Agents%20That%20Act-1b1a17) ![License](https://img.shields.io/badge/license-MIT-1b1a17)

</div>

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

## License

MIT
