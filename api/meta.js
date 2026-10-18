import { send } from '../lib/http.js';
import { run } from '../lib/db.js';
import { PRESETS, SOURCES } from '../lib/presets.js';

export default async function handler(req, res) {
  try {
    const countries = await run('countries', 'MATCH (c:Country) RETURN c.iso3 AS iso3, c.name AS name ORDER BY c.name');
    const cities = await run('cities', 'MATCH (c:City)-[:IN]->(d:Country) RETURN c.id AS id, c.name AS name, d.name AS country, d.iso3 AS iso3');
    const order = ['lisbon', 'berlin', 'london', 'toronto', 'sanfrancisco', 'dubai', 'kigali', 'bangkok'];
    cities.sort((a, b) => (order.indexOf(a.id) + 1 || 99) - (order.indexOf(b.id) + 1 || 99));
    send(res, 200, { countries, cities, presets: PRESETS, sources: SOURCES });
  } catch (e) {
    send(res, 500, { error: `Graph unavailable: ${e.message}` });
  }
}
