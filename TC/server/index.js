// @ts-check
'use strict';

/**
 * GSS · Minimal test server
 * ------------------------------------------------------------------
 * Serves the static TC front-end (tc.html and its assets) and exposes
 * a small JSON API so the registration form can be tested end-to-end
 * against PostgreSQL through the reusable data layer in ./db.
 *
 *   GET  /api/health         → DB connectivity check
 *   POST /api/candidates     → insert a candidate row
 *
 * Run with:  npm start   (from the server/ folder)
 */

const http = require('http');
const fs = require('fs');
const path = require('path');

try {
  require('dotenv').config();
} catch (_) {
  /* optional */
}

const db = require('./db');

const PORT = Number.parseInt(String(process.env.PORT), 10) || 3000;

// The front-end lives one level up (…/TC).
const STATIC_ROOT = path.resolve(__dirname, '..');

// Map posted registration-form field names → candidates table columns.
const CANDIDATE_FIELD_MAP = {
  FullName: 'full_name',
  Phone1: 'phone1',
  Phone2: 'phone2',
  Email: 'email',
  Nationality: 'nationality',
  PlaceOfBirth: 'place_of_birth',
  DateOfBirth: 'date_of_birth',
};

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

/**
 * Ensure the test table exists so inserts work out of the box.
 * @returns {Promise<void>}
 */
const ensureSchema = async () => {
  await db.query(`
    CREATE TABLE IF NOT EXISTS candidates (
      id             SERIAL PRIMARY KEY,
      full_name      TEXT NOT NULL,
      phone1         TEXT,
      phone2         TEXT,
      email          TEXT,
      nationality    TEXT,
      place_of_birth TEXT,
      date_of_birth  DATE,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
};

/**
 * Read and JSON-parse a request body.
 * @param {http.IncomingMessage} req
 * @returns {Promise<any>}
 */
const readJsonBody = (req) =>
  new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1e6) reject(new Error('Payload too large')); // ~1 MB guard
    });
    req.on('end', () => {
      if (!raw) return resolve({});
      try {
        resolve(JSON.parse(raw));
      } catch (err) {
        reject(err);
      }
    });
    req.on('error', reject);
  });

/**
 * Send a JSON response.
 * @param {http.ServerResponse} res
 * @param {number} status
 * @param {any} payload
 */
const sendJson = (res, status, payload) => {
  const body = JSON.stringify(payload);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
};

/**
 * Serve a static file from STATIC_ROOT (with path-traversal protection).
 * @param {http.ServerResponse} res
 * @param {string} urlPath
 */
const serveStatic = (res, urlPath) => {
  const relative = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.resolve(STATIC_ROOT, '.' + relative);

  if (!target.startsWith(STATIC_ROOT)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.stat(target, (err, stats) => {
    const file = !err && stats.isDirectory() ? path.join(target, 'index.html') : target;
    fs.readFile(file, (readErr, data) => {
      if (readErr) {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }
      const type = MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': type });
      res.end(data);
    });
  });
};

/**
 * Insert a candidate from the posted registration payload.
 * @param {http.ServerResponse} res
 * @param {Record<string, any>} body
 */
const createCandidate = async (res, body) => {
  /** @type {Record<string, any>} */
  const row = {};
  for (const [field, column] of Object.entries(CANDIDATE_FIELD_MAP)) {
    const value = body[field];
    if (value !== undefined && value !== '') row[column] = value;
  }

  if (!row.full_name) {
    sendJson(res, 400, { error: 'FullName is required.' });
    return;
  }

  const candidate = await db.insert('candidates', row);
  sendJson(res, 201, { ok: true, candidate });
};

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const url = req.url || '/';

  try {
    if (method === 'GET' && url === '/api/health') {
      const result = await db.query('SELECT 1 AS ok');
      sendJson(res, 200, { ok: true, db: result.rows[0].ok === 1 });
      return;
    }

    if (method === 'POST' && url === '/api/candidates') {
      const body = await readJsonBody(req);
      await createCandidate(res, body);
      return;
    }

    if (method === 'GET' && url.startsWith('/api/candidates')) {
      const rows = await db.select('candidates', { orderBy: { id: 'DESC' }, limit: 50 });
      sendJson(res, 200, { ok: true, candidates: rows });
      return;
    }

    if (url.startsWith('/api/')) {
      sendJson(res, 404, { error: 'Unknown API route' });
      return;
    }

    // Anything else → static assets (default to tc.html at the root).
    serveStatic(res, url === '/' ? '/tc.html' : url);
  } catch (err) {
    // eslint-disable-next-line no-console
    console.error('Request failed:', err);
    sendJson(res, 500, { error: err instanceof Error ? err.message : 'Internal error' });
  }
});

ensureSchema()
  .then(() => {
    server.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`GSS test server running → http://localhost:${PORT}/tc.html`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to initialise database schema:', err);
    process.exit(1);
  });
