// Example communities. These are sample inputs for trying the tool, not data about a real group.
export const PRESETS = [
  { id: 'global-dev', label: 'Example: global developer community (sample, edit it)',
    counts: { IND: 260, NGA: 120, USA: 110, PAK: 60, KEN: 55, BRA: 50, DEU: 45, GBR: 40, BGD: 35, GHA: 30, EGY: 25, PHL: 25, IDN: 25, VNM: 20, MEX: 20 } },
  { id: 'africa-builders', label: 'Example: African builders network (sample, edit it)',
    counts: { NGA: 300, KEN: 140, GHA: 110, ZAF: 80, EGY: 60, ETH: 45, UGA: 40, RWA: 30, CMR: 30, SEN: 25 } },
  { id: 'asia-ai', label: 'Example: South and Southeast Asia AI meetup network (sample, edit it)',
    counts: { IND: 400, PAK: 90, BGD: 70, LKA: 40, NPL: 35, IDN: 60, VNM: 50, PHL: 45, MYS: 30, THA: 25 } },
];
export const SOURCES = [
  { label: 'Passport Index dataset (entry rules, 199 passports)', url: 'https://github.com/ilyankou/passport-index-dataset' },
  { label: 'EU Commission, Schengen visa statistics 2024 (by consulate)', url: 'https://home-affairs.ec.europa.eu/policies/schengen/visa-policy/short-stay-visas-issued-schengen-countries_en' },
  { label: 'US State Dept, B visa adjusted refusal rates by nationality FY2024', url: 'https://travel.state.gov/content/travel/en/legal/visa-law0/visa-statistics/nonimmigrant-visa-statistics.html' },
  { label: 'EU Visa Code Annex IV, airport transit visa list', url: 'https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:02009R0810-20200202' },
  { label: 'OpenFlights route network (2014 snapshot, used only to check a legal connection exists)', url: 'https://openflights.org/data.php' },
];
