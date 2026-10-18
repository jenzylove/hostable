// Pure scoring: turns one graph row (nationality x city) into an outcome.
const ENTERS = new Set(['visa free', 'visa on arrival', 'eta', 'e-visa', '-1']);

export function entersFreely(req) {
  return req != null && (ENTERS.has(req) || /^\d+$/.test(String(req)));
}

export function plainRequirement(req) {
  if (req == null) return 'no rule found';
  if (/^\d+$/.test(String(req))) return `visa free, ${req} days`;
  if (req === '-1') return 'free movement';
  if (req === 'eta') return 'online travel authorisation';
  if (req === 'e-visa') return 'online visa';
  return req;
}

// row: { iso3, name, count, home, req, stateRate, regimeRate, regime, unlocks:[{visa, only}], route }
// holders: { us: 0..1, schengen: 0..1 }
export function classify(row, holders = {}) {
  const out = {
    iso3: row.iso3, name: row.name, count: row.count, requirement: plainRequirement(row.req),
    refusalRate: null, rateSource: null, expectedLost: 0, unknownRisk: 0, route: row.route ?? null,
  };
  if (row.home) return { ...out, status: 'home', requirement: 'home country' };
  if (row.req === 'no admission') return { ...out, status: 'no_admission', expectedLost: row.count };

  let needVisa = 0;
  let unlocked = 0;
  if (row.req === 'visa required') {
    const shares = (row.unlocks || [])
      .filter((u) => !u.only || u.only.includes(row.iso3))
      .map((u) => (u.visa === 'US' ? holders.us : holders.schengen) || 0);
    unlocked = shares.length ? Math.min(1, Math.max(...shares)) : 0;
    needVisa = row.count * (1 - unlocked);
    const rate = row.stateRate ?? row.regimeRate ?? null;
    if (rate != null) {
      out.refusalRate = rate;
      out.rateSource = row.stateRate != null ? `${row.regime === 'US' ? 'US' : 'EU'} 2024, this country's consulates`
        : row.regime === 'US' ? 'US State Dept FY2024' : 'EU Schengen 2024';
      out.expectedLost = needVisa * rate;
    } else {
      out.unknownRisk = needVisa;
    }
  } else if (!entersFreely(row.req)) {
    out.unknownRisk = row.count;
  }

  let status = row.req === 'visa required' ? 'needs_visa' : 'enters';
  if (row.route === null && status !== 'home') {
    // No legal connection found in the route data: people can still get there,
    // but we can't show a route, so they are counted as unknown risk, not lost.
    status = status === 'enters' ? 'no_route' : status;
    if (status === 'no_route') out.unknownRisk = Math.max(out.unknownRisk, row.count);
  }
  if (unlocked > 0) out.requirement += `, ${Math.round(unlocked * 100)}% enter with a visa they hold`;
  return { ...out, status };
}

export function summarise(city, rows) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  const expectedLost = rows.reduce((s, r) => s + r.expectedLost, 0);
  const unknownRisk = rows.reduce((s, r) => s + r.unknownRisk, 0);
  const keeps = total - expectedLost;
  return {
    city, total, keeps: Math.round(keeps), keepsPct: total ? Math.round((keeps / total) * 1000) / 10 : 0,
    expectedLost: Math.round(expectedLost), unknownRisk: Math.round(unknownRisk),
    lostBy: rows.map((r) => ({ ...r, expectedLost: Math.round(r.expectedLost * 10) / 10 }))
      .sort((a, b) => b.expectedLost - a.expectedLost || b.unknownRisk - a.unknownRisk),
  };
}
