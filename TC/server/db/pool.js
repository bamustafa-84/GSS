// @ts-check
'use strict';

/**
 * GSS · PostgreSQL connection pool
 * ------------------------------------------------------------------
 * A single shared `pg.Pool` for the whole backend. Connection details
 * are read from environment variables (see `.env.example`). Import this
 * pool wherever raw access is needed; most code should use the helpers
 * in `db/index.js` instead.
 */

const { Pool } = require('pg');

// Load variables from a local .env file when present (optional dependency).
try {
  require('dotenv').config();
} catch (_) {
  /* dotenv is optional; env vars may be provided by the host instead. */
}

const toInt = (/** @type {string | undefined} */ value, /** @type {number} */ fallback) => {
  const parsed = Number.parseInt(String(value), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const pool = new Pool({
  host: process.env.PGHOST || 'localhost',
  port: toInt(process.env.PGPORT, 5432),
  user: process.env.PGUSER,
  password: process.env.PGPASSWORD,
  database: process.env.PGDATABASE,
  max: toInt(process.env.PGPOOL_MAX, 10),
  idleTimeoutMillis: toInt(process.env.PGPOOL_IDLE_TIMEOUT, 30000),
  connectionTimeoutMillis: toInt(process.env.PGPOOL_CONNECTION_TIMEOUT, 10000),
  ssl: String(process.env.PGSSL).toLowerCase() === 'true' ? { rejectUnauthorized: false } : undefined,
});

// Surface unexpected idle-client errors instead of crashing silently.
pool.on('error', (err) => {
  // eslint-disable-next-line no-console
  console.error('Unexpected PostgreSQL pool error:', err);
});

module.exports = pool;
