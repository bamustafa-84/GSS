// @ts-check
'use strict';

/**
 * GSS · Minimal test server
 * ------------------------------------------------------------------
 * Serves the static TC front-end (tc.html and its assets) and exposes
 * a small JSON API so the registration form can be tested end-to-end
 * against PostgreSQL through the reusable data layer in ./db.
 *
 *   GET  /api/health           → DB connectivity check
 *   GET  /api/applicants       → list applicants (most recent first)
 *   GET  /api/applicants?id=N  → fetch a single applicant
 *   POST /api/applicants       → insert an applicant row
 *
 * The applicant columns are driven entirely by the `dbname` attributes in
 * tc.html; the client posts a { column: value } object, so no column name
 * is hard-coded here.
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

// The applicant table already exists in PostgreSQL. Rows are built from the
// `dbname` attributes posted by the front-end, so columns stay data-driven.
const APPLICANT_TABLE = 'applicant';

// Drawn signatures are stored as rows in this table; the applicant keeps the
// generated signature_id as a foreign key (applicant_signature_id).
const SIGNATURE_TABLE = 'signature';

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
 * Verify database connectivity and (re)install the dynamic CRUD stored
 * function before the server starts accepting requests. The `applicant`
 * table itself is managed in PostgreSQL, so no table schema is created here.
 * @returns {Promise<void>}
 */
const ensureDbReady = async () => {
  await db.query('SELECT 1');
  const procedures = fs.readFileSync(path.join(__dirname, 'db', 'procedures.sql'), 'utf8');
  await db.query(procedures);
};

/**
 * Invoke the `dynamic_crud` stored function. All statement building,
 * identifier validation and parametrization happen inside PostgreSQL.
 * @param {'insert'|'select'|'update'|'delete'} action
 * @param {string} table
 * @param {Record<string, any>} [data]
 * @param {Record<string, any>} [filters]
 * @returns {Promise<any>} The affected row, or an array of rows for 'select'.
 */
const crud = async (action, table, data = {}, filters = {}) => {
  const result = await db.query(
    'SELECT dynamic_crud($1, $2, $3::jsonb, $4::jsonb) AS result',
    [action, table, JSON.stringify(data), JSON.stringify(filters)]
  );
  return result.rows[0].result;
};

/** @type {Map<string, { dataType: string, insertable: boolean }> | null} */
let columnMetaCache = null;
/** @type {string | null} The identity/primary key column (e.g. candidate_no). */
let identityColumnCache = null;

/**
 * Load column metadata for the applicant table straight from the catalog:
 * name → { data type, whether the client may write to it }. Driven entirely
 * by information_schema, so columns stay data-driven (nothing hard-coded).
 * @returns {Promise<Map<string, { dataType: string, insertable: boolean }>>}
 */
const loadColumnMeta = async () => {
  if (columnMetaCache) return columnMetaCache;
  const result = await db.query(
    `SELECT column_name, data_type, is_identity, is_generated
       FROM information_schema.columns
      WHERE table_name = $1
        AND table_schema = current_schema()
      ORDER BY ordinal_position`,
    [APPLICANT_TABLE]
  );
  const meta = /** @type {Map<string, { dataType: string, insertable: boolean }>} */ (new Map());
  for (const r of result.rows) {
    meta.set(r.column_name, {
      dataType: r.data_type,
      insertable: r.is_identity === 'NO' && r.is_generated === 'NEVER',
    });
    if (!identityColumnCache && r.is_identity === 'YES') identityColumnCache = r.column_name;
  }
  columnMetaCache = meta;
  return meta;
};

/** @returns {Promise<string>} The identity column name (fallback: first column). */
const getIdentityColumn = async () => {
  const meta = await loadColumnMeta();
  return /** @type {string} */ (identityColumnCache || [...meta.keys()][0] || '');
};

const TRUE_VALUES = new Set(['true', 'yes', 'paid', 'on', '1', 'y']);
const FALSE_VALUES = new Set(['false', 'no', 'unpaid', 'off', '0', 'n']);

/**
 * Coerce a posted value to the PostgreSQL column type. Returns `undefined`
 * when the value can't be represented (so the caller can skip the column).
 * @param {any} value
 * @param {string} dataType
 * @returns {any}
 */
const coerceValue = (value, dataType) => {
  switch (dataType) {
    case 'boolean': {
      if (typeof value === 'boolean') return value;
      const v = String(value).trim().toLowerCase();
      if (TRUE_VALUES.has(v)) return true;
      if (FALSE_VALUES.has(v)) return false;
      return undefined;
    }
    case 'smallint':
    case 'integer':
    case 'bigint': {
      const n = Number.parseInt(String(value), 10);
      return Number.isFinite(n) ? n : undefined;
    }
    case 'numeric':
    case 'real':
    case 'double precision': {
      const n = Number(value);
      return Number.isFinite(n) ? n : undefined;
    }
    default:
      // character varying / text / date / timestamp — pg parses these directly.
      return value;
  }
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
 * If `applicant_signature_id` holds a drawn signature (a base64 data URL),
 * store the decoded image as a row in the `signature` table and replace the
 * value with the generated `signature_id` (the FK the applicant row keeps).
 * The image bytes are passed as a `\x`-hex string so PostgreSQL casts them to
 * `bytea` inside the same `dynamic_crud` stored function. No-op otherwise.
 * @param {Record<string, any>} body
 * @returns {Promise<void>}
 */
const storeApplicantSignature = async (body) => {
  const raw = body ? body.applicant_signature_id : undefined;
  if (typeof raw !== 'string') return;

  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(raw.trim());
  if (!match) return; // not a data URL — leave as-is (will be coerced/skipped)

  const contentType = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');

  if (buffer.length === 0) {
    delete body.applicant_signature_id;
    return;
  }

  const extension = (contentType.split('/')[1] || 'png').split('+')[0];
  const who = String(body.applicant_name || body.full_name || 'applicant').slice(0, 100);

  const signature = await crud('insert', SIGNATURE_TABLE, {
    signature_image: '\\x' + buffer.toString('hex'),
    content_type: contentType.slice(0, 100),
    file_name: `signature_${Date.now()}.${extension}`.slice(0, 255),
    file_size: buffer.length,
    created_by: who,
    contact_name: who,
  });

  body.applicant_signature_id = signature.signature_id;
};

/**
 * Insert an applicant from the posted `{ column: value }` payload.
 * Values are evaluated/coerced to their column types here, then handed to the
 * `dynamic_crud` stored function which validates the table/columns and builds
 * the parametrized INSERT inside PostgreSQL.
 * @param {http.ServerResponse} res
 * @param {Record<string, any>} body
 */
const createApplicant = async (res, body) => {
  // Persist the drawn signature first so its id can be linked to the applicant.
  await storeApplicantSignature(body);

  const meta = await loadColumnMeta();

  /** @type {Record<string, any>} */
  const row = {};
  for (const [column, raw] of Object.entries(body || {})) {
    const info = meta.get(column);
    // Ignore unknown, identity or generated columns the DB won't accept.
    if (!info || !info.insertable) continue;
    // Skip empties so NOT NULL / typed columns keep their defaults.
    if (raw === undefined || raw === null || raw === '') continue;
    const value = coerceValue(raw, info.dataType);
    if (value === undefined) continue;
    row[column] = value;
  }

  if (Object.keys(row).length === 0) {
    sendJson(res, 400, { error: 'No applicant data provided.' });
    return;
  }

  const applicant = await crud('insert', APPLICANT_TABLE, row);
  sendJson(res, 201, { ok: true, applicant });
};

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const url = req.url || '/';

  // Allow the front-end to call the API cross-origin (e.g. when the page
  // is served by Live Server on port 5500 instead of this Node server).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  try {
    if (method === 'GET' && url === '/api/health') {
      const result = await db.query('SELECT 1 AS ok');
      sendJson(res, 200, { ok: true, db: result.rows[0].ok === 1 });
      return;
    }

    if (method === 'POST' && url === '/api/applicants') {
      const body = await readJsonBody(req);
      await createApplicant(res, body);
      return;
    }

    if (method === 'GET' && url.startsWith('/api/applicants')) {
      const idCol = await getIdentityColumn();
      const id = new URL(url, 'http://localhost').searchParams.get('id');
      if (id) {
        const rows = await crud('select', APPLICANT_TABLE, {}, { [idCol]: Number(id) });
        sendJson(res, 200, { ok: true, applicant: rows[0] || null });
        return;
      }
      const rows = await crud('select', APPLICANT_TABLE);
      sendJson(res, 200, { ok: true, applicants: rows });
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

ensureDbReady()
  .then(() => {
    server.listen(PORT, () => {
      // eslint-disable-next-line no-console
      console.log(`GSS test server running → http://localhost:${PORT}/tc.html`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to connect to the database:', err);
    process.exit(1);
  });
