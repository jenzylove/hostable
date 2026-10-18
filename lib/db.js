import { FalkorDB } from 'falkordb';

const GRAPH = process.env.FALKORDB_GRAPH || 'hostable';
let dbPromise;

export function connect() {
  if (!dbPromise) {
    const url = process.env.FALKORDB_URL;
    if (!url) throw new Error('FALKORDB_URL is not set');
    dbPromise = FalkorDB.connect({ url, socket: { connectTimeout: 8000 } }).catch((e) => {
      dbPromise = undefined;
      throw e;
    });
  }
  return dbPromise;
}

export async function graph() {
  return (await connect()).selectGraph(GRAPH);
}

// Runs a query and records it, so every answer can show the Cypher behind it.
export async function run(label, cypher, params = {}, log) {
  const g = await graph();
  const t = Date.now();
  const res = await g.query(cypher, { params });
  const ms = Date.now() - t;
  if (log) log.push({ label, cypher: cypher.trim().replace(/\n\s+/g, '\n'), ms });
  return res.data || [];
}
