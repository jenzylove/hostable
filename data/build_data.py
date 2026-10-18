"""Build data/seed.json from the raw public sources in data/raw.

Sources:
  passport-index-tidy-iso3.csv  Passport Index dataset (github.com/ilyankou/passport-index-dataset)
  schengen-2024-consulates.xlsx EU Commission, Schengen visa statistics 2024, by consulate
  us-b-refusal-fy24.pdf         US State Dept, adjusted refusal rate B visas by nationality FY2024
  airports.dat, routes.dat      OpenFlights route network (2014 snapshot)
"""
import csv, json, re, collections, pathlib
import openpyxl, pycountry, pypdf

RAW = pathlib.Path(__file__).parent / "raw"
OUT = pathlib.Path(__file__).parent / "seed.json"

OVERRIDES = {
    "BAHAMAS, THE": "BHS", "BURMA": "MMR", "CONGO, DEMOCRATIC REPUBLIC OF THE": "COD",
    "CONGO, REPUBLIC OF THE": "COG", "COTE D'IVOIRE": "CIV", "GAMBIA, THE": "GMB",
    "KOREA, NORTH": "PRK", "KOREA, SOUTH": "KOR", "LAOS": "LAO", "MICRONESIA": "FSM",
    "RUSSIA": "RUS", "SYRIA": "SYR", "TURKEY": "TUR", "TURKIYE": "TUR", "VIETNAM": "VNM",
    "IRAN": "IRN", "BOLIVIA": "BOL", "VENEZUELA": "VEN", "TANZANIA": "TZA", "MOLDOVA": "MDA",
    "BOSNIA-HERZEGOVINA": "BIH", "BOSNIA AND HERZEGOVINA": "BIH", "MACEDONIA": "MKD",
    "NORTH MACEDONIA": "MKD", "CABO VERDE": "CPV", "CAPE VERDE": "CPV", "ESWATINI": "SWZ",
    "TIMOR-LESTE": "TLS", "BRUNEI": "BRN", "KOSOVO": "XKX", "PALESTINIAN AUTHORITY": "PSE",
    "PALESTINE": "PSE", "TAIWAN": "TWN", "VATICAN CITY": "VAT", "HOLY SEE": "VAT",
    "SAINT KITTS AND NEVIS": "KNA", "SAINT LUCIA": "LCA", "SAINT VINCENT AND THE GRENADINES": "VCT",
    "SAO TOME AND PRINCIPE": "STP", "CZECH REPUBLIC": "CZE", "CZECHIA": "CZE",
    "DEMOCRATIC REPUBLIC OF THE CONGO": "COD", "CONGO (BRAZZAVILLE)": "COG",
    "CONGO (KINSHASA)": "COD", "IVORY COAST": "CIV", "HONG KONG": "HKG", "MACAU": "MAC",
    "MACAO": "MAC", "CONGO (DEMOCRATIC REPUBLIC)": "COD", "GUINEA - BISSAU": "GNB", "HONG KONG S. A. R.": "HKG", "HONG KONG S.A.R.": "HKG", "MACAO S.A.R.": "MAC", "MACAU S.A.R.": "MAC", "MARSHALL ISLANDS, REPUBLIC OF THE": "MHL", "ST LUCIA": "LCA", "ST. KITTS AND NEVIS": "KNA", "ST. VINCENT AND THE GRENADINES": "VCT", "UNITED KINGDOM": "GBR", "UNITED STATES": "USA",
}

def iso3(name):
    n = name.strip().upper()
    if n in OVERRIDES:
        return OVERRIDES[n]
    try:
        return pycountry.countries.lookup(name.strip()).alpha_3
    except LookupError:
        try:
            return pycountry.countries.search_fuzzy(name.strip())[0].alpha_3
        except LookupError:
            return None

# 1. Entry rules
entry = []
codes = set()
with open(RAW / "passport-index-tidy-iso3.csv", encoding="utf-8") as f:
    for r in csv.DictReader(f):
        codes.update([r["Passport"], r["Destination"]])
        entry.append([r["Passport"], r["Destination"], r["Requirement"]])

def cname(c):
    if c == "XKX": return "Kosovo"
    if c == "PSE": return "Palestine"
    if c == "TWN": return "Taiwan"
    k = pycountry.countries.get(alpha_3=c)
    return getattr(k, "common_name", None) or (k.name if k else c)

countries = sorted(({"iso3": c, "name": cname(c)} for c in codes), key=lambda x: x["name"])

# 2. Schengen refusal by (country where people apply, Schengen state)
wb = openpyxl.load_workbook(RAW / "schengen-2024-consulates.xlsx", read_only=True)
ws = wb["Data for consulates"]
pair = collections.defaultdict(lambda: [0, 0])  # (apply, state) -> [decided, refused]
unmatched = set()
for i, row in enumerate(ws.iter_rows(values_only=True)):
    if i == 0 or not row[0]:
        continue
    state, where = row[0], row[1]
    issued, ltv, refused = row[9] or 0, row[12] or 0, row[13] or 0
    a, s = iso3(where), iso3(state)
    if not a:
        unmatched.add(where); continue
    decided = issued + ltv + refused
    if decided:
        pair[(a, s)][0] += decided
        pair[(a, s)][1] += refused
schengen_states = sorted({s for (_, s) in pair})
schengen_refusal = [
    {"apply": a, "state": s, "decided": d, "refused": r, "rate": round(r / d, 4)}
    for (a, s), (d, r) in pair.items() if d >= 20
]
tot = collections.defaultdict(lambda: [0, 0])
for (a, s), (d, r) in pair.items():
    tot[a][0] += d; tot[a][1] += r
schengen_all = {a: {"decided": d, "refused": r, "rate": round(r / d, 4)} for a, (d, r) in tot.items() if d >= 20}

# 3. US B visa refusal FY2024
txt = "\n".join(p.extract_text() for p in pypdf.PdfReader(RAW / "us-b-refusal-fy24.pdf").pages)
us = {}
for m in re.finditer(r"^([A-Z][A-Z ,.'\-()&]+?)\s+(\d+\.\d+)%\s*$", txt, re.M):
    c = iso3(m.group(1))
    if c: us[c] = round(float(m.group(2)) / 100, 4)
    else: unmatched.add(m.group(1))

# 4. Airports and routes
airports = {}
with open(RAW / "airports.dat", encoding="utf-8") as f:
    for row in csv.reader(f):
        if len(row) < 8 or row[4] in ("\\N", ""): continue
        c = iso3(row[3])
        if c: airports[row[4]] = {"iata": row[4], "name": row[1], "city": row[2], "iso3": c,
                                  "lat": float(row[6]), "lon": float(row[7])}
deg = collections.Counter(); routes = set()
with open(RAW / "routes.dat", encoding="utf-8") as f:
    for row in csv.reader(f):
        a, b = row[2], row[4]
        if a in airports and b in airports and a != b:
            routes.add((a, b)); deg[a] += 1; deg[b] += 1
major = {a for a, n in deg.items() if n >= 20}
main_airport = {}
for a, n in deg.most_common():
    c = airports[a]["iso3"]
    main_airport.setdefault(c, a); major.add(main_airport[c])
routes = sorted((a, b) for a, b in routes if a in major and b in major)

CITIES = [
    ("lisbon", "Lisbon", "PRT", "LIS"), ("berlin", "Berlin", "DEU", "TXL"),
    ("amsterdam", "Amsterdam", "NLD", "AMS"), ("london", "London", "GBR", "LHR"),
    ("toronto", "Toronto", "CAN", "YYZ"), ("sanfrancisco", "San Francisco", "USA", "SFO"),
    ("mexicocity", "Mexico City", "MEX", "MEX"), ("dubai", "Dubai", "ARE", "DXB"),
    ("istanbul", "Istanbul", "TUR", "IST"), ("tbilisi", "Tbilisi", "GEO", "TBS"),
    ("bangkok", "Bangkok", "THA", "BKK"), ("singapore", "Singapore", "SGP", "SIN"),
    ("bengaluru", "Bengaluru", "IND", "BLR"), ("nairobi", "Nairobi", "KEN", "NBO"),
    ("kigali", "Kigali", "RWA", "KGL"), ("lagos", "Lagos", "NGA", "LOS"),
]
for _, _, _, ap in CITIES:
    major.add(ap)

# 5. Curated rules, each with its official source
SCHENGEN_ATV = ["AFG", "BGD", "COD", "ERI", "ETH", "GHA", "IRN", "IRQ", "NGA", "PAK", "SOM", "LKA"]
UNLOCKS = [
    {"visa": "US", "dest": "MEX", "only": None, "source": "Mexico INM: holders of a valid US visa enter without a Mexican visa",
     "url": "https://www.gob.mx/inm"},
    {"visa": "SCHENGEN", "dest": "MEX", "only": None, "source": "Mexico INM: holders of a valid Schengen visa enter without a Mexican visa",
     "url": "https://www.gob.mx/inm"},
    {"visa": "US", "dest": "GEO", "only": None, "source": "Georgia MFA: holders of a valid US visa enter visa free",
     "url": "https://www.geoconsul.gov.ge/en/NonVisaCountries"},
    {"visa": "SCHENGEN", "dest": "GEO", "only": None, "source": "Georgia MFA: holders of a valid Schengen visa enter visa free",
     "url": "https://www.geoconsul.gov.ge/en/NonVisaCountries"},
    {"visa": "US", "dest": "ARE", "only": ["IND"], "source": "UAE ICP: Indian nationals with a valid US visa get a visa on arrival",
     "url": "https://icp.gov.ae"},
]

seed = {
    "countries": countries,
    "entry": entry,
    "schengenStates": schengen_states,
    "schengenRefusal": schengen_refusal,
    "schengenAll": schengen_all,
    "usRefusal": us,
    "schengenAtv": SCHENGEN_ATV,
    "unlocks": UNLOCKS,
    "cities": [{"id": i, "name": n, "iso3": c, "airport": a} for i, n, c, a in CITIES],
    "airports": [airports[a] for a in sorted(major) if a in airports],
    "mainAirport": main_airport,
    "routes": routes,
}
OUT.write_text(json.dumps(seed, separators=(",", ":")), encoding="utf-8")
print("countries", len(countries), "entry", len(entry), "schengen pairs", len(schengen_refusal),
      "schengen states", len(schengen_states), "us", len(us), "airports", len(seed["airports"]),
      "routes", len(routes), "size KB", OUT.stat().st_size // 1024)
print("unmatched", sorted(unmatched)[:40])
print("NGA schengen all", schengen_all.get("NGA"), "NGA->PRT", [r for r in schengen_refusal if r["apply"] == "NGA" and r["state"] == "PRT"], "NGA us", us.get("NGA"), "IND us", us.get("IND"))
