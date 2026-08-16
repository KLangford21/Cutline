import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error('DATABASE_URL must be set');

export const pool = new Pool({
  connectionString,
  // Supabase terminates TLS with a certificate that does not chain to a root
  // this client ships, so verification is off while the connection itself stays
  // encrypted. Point `ssl.ca` at Supabase's CA cert to tighten this later.
  ssl: { rejectUnauthorized: false },
  max: Number(process.env.PG_POOL_MAX || 10),
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
});

pool.on('error', (err) => {
  // An idle pooled connection dropped by Supabase must not take the process
  // down; the pool replaces it on the next query.
  console.error('Unexpected database pool error', err);
});

/**
 * The application's SQL is written with SQLite's `?` placeholders. Postgres
 * wants `$1, $2, …`, so they are rewritten on the way through. This is a plain
 * positional substitution — it would corrupt a `?` appearing inside a string
 * literal, which no query in this codebase contains.
 */
const toPg = (sql) => {
  let index = 0;
  return sql.replace(/\?/g, () => `$${++index}`);
};

/** Small helpers so route code stays readable. All are async under Postgres. */
export const all = async (sql, ...params) => (await pool.query(toPg(sql), params)).rows;
export const get = async (sql, ...params) => (await pool.query(toPg(sql), params)).rows[0];
export const run = async (sql, ...params) => {
  const result = await pool.query(toPg(sql), params);
  return { changes: result.rowCount };
};
export const now = () => new Date().toISOString();

/**
 * Runs `fn` inside a single transaction on one pooled connection, handing it
 * `{ all, get, run }` bound to that connection. Commits on return, rolls back
 * on throw.
 *
 * This matters because the old node:sqlite driver was synchronous: a
 * check-then-insert could not be interleaved by another request. Postgres is
 * asynchronous and pooled, so any such sequence that must stay atomic — most
 * importantly reserving a tee-time slot — has to say so explicitly.
 */
export async function transaction(fn) {
  const client = await pool.connect();
  const scoped = {
    all: async (sql, ...params) => (await client.query(toPg(sql), params)).rows,
    get: async (sql, ...params) => (await client.query(toPg(sql), params)).rows[0],
    run: async (sql, ...params) => ({ changes: (await client.query(toPg(sql), params)).rowCount }),
  };

  try {
    await client.query('BEGIN');
    const result = await fn(scoped);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Applies every unapplied file in server/migrations in filename order, each in
 * its own transaction. Safe to run on every boot: applied names are recorded,
 * so this is a no-op once the schema is current.
 *
 * This needs the session-mode pooler (port 5432). Transaction-mode pooling
 * (6543) cannot hold a multi-statement transaction open across queries.
 */
export async function migrate() {
  const dir = path.join(__dirname, '..', 'migrations');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.sql')).sort();

  for (const file of files) {
    const applied = await pool.query('SELECT 1 FROM schema_migrations WHERE name = $1', [file]);
    if (applied.rowCount) continue;

    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.log(`⛳  applied migration ${file}`);
    } catch (err) {
      await client.query('ROLLBACK');
      throw new Error(`Migration ${file} failed: ${err.message}`, { cause: err });
    } finally {
      client.release();
    }
  }
}

export const close = () => pool.end();
