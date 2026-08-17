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
  require('dotenv').config({ path: require('path').join(__dirname, '.env') });
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
 * Verify database connectivity and (re)install every stored procedure in the
 * `db/procedures` folder before the server starts accepting requests. All
 * database access afterwards goes exclusively through these procedures.
 * @returns {Promise<void>}
 */
const ensureDbReady = async () => {
  await db.query('SELECT 1');
  const dir = path.join(__dirname, 'db', 'procedures');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  for (const file of files) {
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.query(sql);
  }
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

/**
 * Invoke a named stored function that returns a single `result` jsonb value.
 * @param {string} fn  Function name (e.g. 'registration_insert').
 * @param {string} signature  Positional placeholder list (e.g. '$1::jsonb').
 * @param {any[]} params
 * @returns {Promise<any>}
 */
const callProc = async (fn, signature, params) => {
  const result = await db.query(`SELECT ${fn}(${signature}) AS result`, params);
  return result.rows[0] ? result.rows[0].result : null;
};

/** @type {Map<string, { dataType: string, insertable: boolean }> | null} */
let columnMetaCache = null;
/** @type {string | null} The identity/primary key column (e.g. candidate_no). */
let identityColumnCache = null;

/**
 * Load column metadata for the applicant table through the `app_table_columns`
 * stored function: name → { data type, whether the client may write to it }.
 * @returns {Promise<Map<string, { dataType: string, insertable: boolean }>>}
 */
const loadColumnMeta = async () => {
  if (columnMetaCache) return columnMetaCache;
  const cols = await callProc('app_table_columns', '$1', [APPLICANT_TABLE]) || [];
  const meta = /** @type {Map<string, { dataType: string, insertable: boolean }>} */ (new Map());
  for (const r of cols) {
    meta.set(r.name, {
      dataType: r.data_type,
      insertable: r.is_identity === 'NO' && r.is_generated === 'NEVER',
    });
    if (!identityColumnCache && r.is_identity === 'YES') identityColumnCache = r.name;
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
    const file = !err && stats.isDirectory() ? path.join(target, 'tc.html') : target;
    fs.readFile(file, (readErr, data) => {
      if (readErr) {
        sendJson(res, 404, { error: 'Not found' });
        return;
      }
      const type = MIME_TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
      // Never let the browser serve a stale copy of the app's HTML/JS/CSS during
      // development — always revalidate so code edits take effect on reload.
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        Pragma: 'no-cache',
        Expires: '0',
      });
      res.end(data);
    });
  });
};

/**
 * Decode a base64 (or URL-encoded) `data:` URL into a Buffer plus its MIME type.
 * Returns `null` when the input is not a usable data URL or is empty.
 * @param {any} raw
 * @returns {{ buffer: Buffer, contentType: string } | null}
 */
const dataUrlToBuffer = (raw) => {
  if (typeof raw !== 'string') return null;
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(raw.trim());
  if (!match) return null;

  const contentType = match[1] || 'application/octet-stream';
  const isBase64 = Boolean(match[2]);
  const payload = match[3] || '';
  const buffer = isBase64
    ? Buffer.from(payload, 'base64')
    : Buffer.from(decodeURIComponent(payload), 'utf8');

  return buffer.length ? { buffer, contentType } : null;
};

/**
 * Insert a decoded signature image via the `signature_insert` stored function.
 * The image bytes are passed as a `\x`-hex string so PostgreSQL casts them to
 * `bytea` inside the procedure.
 * @param {{ buffer: Buffer, contentType: string }} image
 * @param {string} name The signature name (stored as contact_name / created_by).
 * @param {boolean} [isTrainingOfficer] Whether this signature is the Training Officer.
 * @returns {Promise<any>} The inserted signature row (without the image bytes).
 */
const insertSignature = ({ buffer, contentType }, name, isTrainingOfficer = false) => {
  const extension = (contentType.split('/')[1] || 'png').split('+')[0];
  const who = String(name || 'signature').slice(0, 100);
  return callProc('signature_insert', '$1::jsonb', [JSON.stringify({
    signature_image: '\\x' + buffer.toString('hex'),
    content_type: contentType.slice(0, 100),
    file_name: `signature_${Date.now()}.${extension}`.slice(0, 255),
    file_size: buffer.length,
    created_by: who,
    contact_name: who,
    is_training_officer: Boolean(isTrainingOfficer),
  })]);
};

/**
 * If `applicant_signature_id` holds a drawn signature (a base64 data URL),
 * store the decoded image as a row in the `signature` table and replace the
 * value with the generated `signature_id` (the FK the applicant row keeps).
 * No-op otherwise.
 * @param {Record<string, any>} body
 * @returns {Promise<void>}
 */
const storeApplicantSignature = async (body) => {
  const raw = body ? body.applicant_signature_id : undefined;
  if (typeof raw !== 'string') return;

  const image = dataUrlToBuffer(raw);
  if (!image) {
    // Empty pad / not a data URL — drop it so typed columns keep their defaults.
    if (/^data:/.test(raw.trim())) delete body.applicant_signature_id;
    return;
  }

  const who = String(body.applicant_name || body.full_name || 'applicant').slice(0, 100);
  const signature = await insertSignature(image, who);
  body.applicant_signature_id = signature.signature_id;
};

/**
 * List / search stored signatures via the `signature_search` stored function.
 * Returns the newest rows first; supports incremental loading (q, limit, offset).
 * Image bytes are never included.
 * @param {http.ServerResponse} res
 * @param {{ q?: string, limit?: number, offset?: number }} [opts]
 */
const listSignatures = async (res, opts = {}) => {
  const q = (opts.q || '').toString();
  const limit = Number.isFinite(opts.limit) ? Number(opts.limit) : 10;
  const offset = Number.isFinite(opts.offset) ? Number(opts.offset) : 0;
  const rows = await callProc('signature_search', '$1, $2, $3', [q, limit, offset]);
  const hasTrainingOfficer = await callProc('signature_has_officer', '', []);
  sendJson(res, 200, {
    ok: true,
    signatures: Array.isArray(rows) ? rows : [],
    hasTrainingOfficer: hasTrainingOfficer === true,
  });
};

/**
 * Create a signature from a posted `{ name, image }` payload (image = data URL).
 * @param {http.ServerResponse} res
 * @param {Record<string, any>} body
 */
const createSignature = async (res, body) => {
  const name = (body && (body.name || body.contact_name || body.signature_name) || '').toString().trim();
  const image = dataUrlToBuffer(body ? body.image || body.signature_image : undefined);
  if (!name) {
    sendJson(res, 400, { error: 'A signature name is required.' });
    return;
  }
  if (!image) {
    sendJson(res, 400, { error: 'A signature image is required.' });
    return;
  }
  const signature = await insertSignature(image, name, Boolean(body && body.is_training_officer));
  if (signature && typeof signature === 'object') delete signature.signature_image;
  sendJson(res, 201, { ok: true, signature });
};

/**
 * Delete a signature by id via the `signature_delete` stored function.
 * @param {http.ServerResponse} res
 * @param {string} id
 */
const deleteSignature = async (res, id) => {
  const numId = Number(id);
  if (!Number.isFinite(numId)) {
    sendJson(res, 400, { error: 'Invalid signature id' });
    return;
  }
  const deleted = await callProc('signature_delete', '$1', [numId]);
  if (deleted !== true) {
    sendJson(res, 404, { error: 'Signature not found' });
    return;
  }
  sendJson(res, 200, { ok: true, deleted: true });
};

/**
 * Stream a signature image (bytea) back to the browser by id, using the
 * `signature_image` stored function (returns hex bytes + content type).
 * @param {http.ServerResponse} res
 * @param {string} id
 */
const sendSignatureImage = async (res, id) => {  const img = await callProc('signature_image', '$1', [Number(id)]);
  const hex = img && img.image_hex;
  if (!img || typeof hex !== 'string' || hex.length === 0) {
    sendJson(res, 404, { error: 'Signature not found' });
    return;
  }
  const buffer = Buffer.from(hex, 'hex');
  res.writeHead(200, {
    'Content-Type': (img.content_type || 'image/png'),
    'Content-Length': buffer.length,
    'Cache-Control': 'no-store',
  });
  res.end(buffer);
};

/** @type {Map<string, { columns: { name: string, data_type: string }[], byteaCols: Set<string> }>} */
const tableMetaCache = new Map();

/**
 * Column metadata (name + type) for any table, with a set of `bytea` columns
 * so binary blobs can be stripped from JSON responses.
 * @param {string} table
 * @returns {Promise<{ columns: { name: string, data_type: string }[], byteaCols: Set<string> }>}
 */
const getTableColumns = async (table) => {
  const cached = tableMetaCache.get(table);
  if (cached) return cached;
  const cols = /** @type {any[]} */ (await callProc('app_table_columns', '$1', [table]) || []);
  const columns = cols.map((r) => ({ name: r.name, data_type: r.data_type }));
  const byteaCols = new Set(cols.filter((r) => r.data_type === 'bytea').map((r) => r.name));
  const meta = { columns, byteaCols };
  tableMetaCache.set(table, meta);
  return meta;
};

/**
 * Whether a base table with this name exists in the current schema.
 * @param {string} table
 * @returns {Promise<boolean>}
 */
const tableExists = async (table) => {
  const result = await db.query('SELECT app_table_exists($1) AS ok', [table]);
  return result.rows[0] && result.rows[0].ok === true;
};

/**
 * List all rows of an arbitrary table (validated against the catalog), plus its
 * column metadata so the client can render headers even when there are no rows.
 * Binary (`bytea`) columns are stripped from the payload.
 * @param {http.ServerResponse} res
 * @param {string} table
 */
const listRecords = async (res, table) => {
  if (!table) {
    sendJson(res, 400, { error: 'Missing table name' });
    return;
  }
  if (!await tableExists(table)) {
    sendJson(res, 200, { ok: true, table, exists: false, columns: [], records: [] });
    return;
  }
  const { columns, byteaCols } = await getTableColumns(table);
  const rows = await crud('select', table);
  const records = (Array.isArray(rows) ? rows : []).map((row) => {
    if (!byteaCols.size || !row) return row;
    const clean = { ...row };
    byteaCols.forEach((c) => { delete clean[c]; });
    return clean;
  });
  const publicColumns = columns.filter((c) => !byteaCols.has(c.name));
  sendJson(res, 200, { ok: true, table, exists: true, columns: publicColumns, records });
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

  // Update when a candidate number is supplied, otherwise insert.
  const idRaw = body && (body.candidate_no || body.CandidateNo);
  const id = Number.parseInt(String(idRaw), 10);
  const applicant = Number.isFinite(id)
    ? await callProc('registration_update', '$1, $2::jsonb', [id, JSON.stringify(row)])
    : await callProc('registration_insert', '$1::jsonb', [JSON.stringify(row)]);
  sendJson(res, Number.isFinite(id) ? 200 : 201, { ok: true, applicant });
};

/**
 * Invoke the generic `dictionary_crud` stored function.
 * @param {'list'|'insert'|'update'|'delete'} action
 * @param {string|null} category
 * @param {Record<string, any>} [data]
 * @param {number|null} [id]
 * @returns {Promise<any>}
 */
const dictionaryCrud = (action, category, data = {}, id = null) =>
  callProc('dictionary_crud', '$1, $2, $3::jsonb, $4', [
    action,
    category,
    JSON.stringify(data || {}),
    id,
  ]);

/**
 * Upsert the training row for a Training Title via `training_upsert`.
 * @param {http.ServerResponse} res
 * @param {Record<string, any>} body
 */
const upsertTraining = async (res, body) => {
  const title = String((body && body.training_title) || '').trim();
  if (!title) {
    sendJson(res, 400, { error: 'A training title is required.' });
    return;
  }
  const result = await callProc('training_upsert', '$1::jsonb', [JSON.stringify(body || {})]);
  sendJson(res, result && result.ok ? 200 : 400, result || { ok: false, status: 'invalid' });
};

/**
 * List trainings, optionally filtered to a single trainer, via `training_list`.
 * @param {http.ServerResponse} res
 * @param {string} trainer
 */
const listTraining = async (res, trainer) => {
  const rows = await callProc('training_list', '$1', [trainer || '']);
  sendJson(res, 200, { ok: true, trainings: Array.isArray(rows) ? rows : [] });
};

/**
 * List the students assigned to a training (candidates with attendance rows),
 * via `training_students`.
 * @param {http.ServerResponse} res
 * @param {string} title
 */
const listTrainingStudents = async (res, title) => {
  if (!title) {
    sendJson(res, 400, { error: 'A training title is required.' });
    return;
  }
  const rows = await callProc('training_students', '$1', [title]);
  sendJson(res, 200, { ok: true, students: Array.isArray(rows) ? rows : [] });
};

/**
 * Assign or unassign an applicant to/from a training (applicant_training).
 * @param {http.ServerResponse} res
 * @param {Record<string, any>} body
 */
const assignTraining = async (res, body) => {
  const fn = body && (body.unassign === true || body.remove === true)
    ? 'applicant_training_unassign'
    : 'applicant_training_assign';
  const result = await callProc(fn, '$1::jsonb', [JSON.stringify(body || {})]);
  sendJson(res, result && result.ok ? 200 : 400, result || { ok: false, status: 'invalid' });
};

/**
 * List the trainings an applicant is assigned to, via `applicant_trainings`.
 * @param {http.ServerResponse} res
 * @param {string} candidateNo
 */
const listApplicantTrainings = async (res, candidateNo) => {
  const id = Number.parseInt(String(candidateNo), 10);
  if (!Number.isFinite(id)) {
    sendJson(res, 400, { error: 'A valid candidate number is required.' });
    return;
  }
  const rows = await callProc('applicant_trainings', '$1', [id]);
  sendJson(res, 200, { ok: true, trainings: Array.isArray(rows) ? rows : [] });
};

/**
 * Upsert (or delete) a single attendance cell.
 * @param {http.ServerResponse} res
 * @param {Record<string, any>} body
 */
const saveAttendance = async (res, body) => {
  const fn = body && (body.delete === true || body._delete === true) ? 'attendance_delete' : 'attendance_upsert';
  const result = await callProc(fn, '$1::jsonb', [JSON.stringify(body || {})]);
  sendJson(res, result && result.ok ? 200 : 400, result || { ok: false, status: 'invalid' });
};

/**
 * List attendance cells for a training title within an optional date range.
 * @param {http.ServerResponse} res
 * @param {{ title: string, from?: string|null, to?: string|null }} opts
 */
const listAttendance = async (res, opts) => {
  const title = (opts.title || '').toString();
  if (!title) {
    sendJson(res, 400, { error: 'A training title is required.' });
    return;
  }
  const rows = await callProc('attendance_list', '$1, $2, $3', [
    title,
    opts.from || null,
    opts.to || null,
  ]);
  sendJson(res, 200, { ok: true, attendance: Array.isArray(rows) ? rows : [] });
};

/**
 * Every attendance record for one candidate (joined to its training meta),
 * sorted by attendance_date ascending — drives the presences panel.
 * @param {http.ServerResponse} res
 * @param {string} candidateNo
 */
const listCandidateAttendance = async (res, candidateNo) => {
  const id = Number.parseInt(String(candidateNo), 10);
  if (!Number.isFinite(id)) {
    sendJson(res, 400, { error: 'A valid candidate number is required.' });
    return;
  }
  const rows = await callProc('attendance_for_candidate', '$1', [id]);
  sendJson(res, 200, { ok: true, attendance: Array.isArray(rows) ? rows : [] });
};

const server = http.createServer(async (req, res) => {
  const method = req.method || 'GET';
  const url = req.url || '/';

  // Allow the front-end to call the API cross-origin (e.g. when the page
  // is served by Live Server on port 5500 instead of this Node server).
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
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

    // ── Registration (applicant) search via stored procedure ──
    if (method === 'GET' && url.startsWith('/api/registration/search')) {
      const params = new URL(url, 'http://localhost').searchParams;
      const rows = await callProc('registration_search', '$1, $2, $3', [
        params.get('q') || '',
        Number.parseInt(params.get('limit') || '25', 10) || 25,
        Number.parseInt(params.get('offset') || '0', 10) || 0,
      ]);
      sendJson(res, 200, { ok: true, applicants: Array.isArray(rows) ? rows : [] });
      return;
    }

    if (method === 'GET' && (url === '/api/applicants' || url.startsWith('/api/applicants?'))) {
      const id = new URL(url, 'http://localhost').searchParams.get('id');
      if (id) {
        const applicant = await callProc('registration_get', '$1', [Number(id)]);
        sendJson(res, 200, { ok: true, applicant: applicant || null });
        return;
      }
      const rows = await callProc('registration_search', '$1, $2, $3', ['', 1000, 0]);
      sendJson(res, 200, { ok: true, applicants: Array.isArray(rows) ? rows : [] });
      return;
    }

    // ── Authentication (login / change password / register) ───
    if (method === 'POST' && url === '/api/login') {
      const body = await readJsonBody(req);
      const username = String((body && (body.username || body.email)) || '').trim();
      const password = String((body && body.password) || '');
      const forceChange = Boolean(body && (body.forceChange || body.force_change));
      const result = await callProc('auth_login', '$1, $2, $3', [username, password, forceChange]);
      sendJson(res, 200, result || { ok: false, status: 'invalid' });
      return;
    }

    if (method === 'POST' && url === '/api/change-password') {
      const body = await readJsonBody(req);
      const username = String((body && (body.username || body.email)) || '').trim();
      const current = String((body && (body.currentPassword || body.current_password)) || '');
      const next = String((body && (body.newPassword || body.new_password)) || '');
      const result = await callProc('auth_change_password', '$1, $2, $3', [username, current, next]);
      sendJson(res, 200, result || { ok: false, status: 'invalid' });
      return;
    }

    if (method === 'POST' && url === '/api/forgot-password') {
      const body = await readJsonBody(req);
      const username = String((body && (body.username || body.email)) || '').trim();
      const result = await callProc('auth_forgot_password', '$1', [username]);
      sendJson(res, 200, result || { ok: false, status: 'invalid' });
      return;
    }

    if (method === 'POST' && url === '/api/register') {
      const body = await readJsonBody(req);
      const username = String((body && (body.username || body.email)) || '').trim();
      const fullName = String((body && (body.fullName || body.full_name || body.name)) || '').trim();
      const password = String((body && body.password) || '');
      const mustChange = Boolean(body && (body.mustChange || body.must_change));
      const role = String((body && body.role) || 'Candidate');
      const result = await callProc('auth_register', '$1, $2, $3, $4, $5', [username, fullName, password, mustChange, role]);
      sendJson(res, result && result.ok ? 201 : 200, result || { ok: false, status: 'invalid' });
      return;
    }

    // ── Current user's live role/status (self-heals stale sessions) ──
    if (method === 'GET' && url.startsWith('/api/me')) {
      const username = new URL(url, 'http://localhost').searchParams.get('username') || '';
      const info = await callProc('auth_user_role', '$1', [username]);
      sendJson(res, 200, info ? Object.assign({ ok: true }, info) : { ok: false });
      return;
    }

    // ── User management (admin) ────────────────────────────────
    if (method === 'GET' && url.startsWith('/api/users')) {
      const rows = await callProc('login_users_list', '', []);
      sendJson(res, 200, { ok: true, users: Array.isArray(rows) ? rows : [] });
      return;
    }

    if (method === 'POST' && url === '/api/users') {
      const body = await readJsonBody(req);
      const idRaw = body && (body.login_id != null ? body.login_id : body.id);
      const id = Number.parseInt(String(idRaw), 10);
      if (Number.isFinite(id)) {
        // Update an existing account (role / active / details).
        const result = await callProc('login_user_update', '$1, $2::jsonb', [id, JSON.stringify(body || {})]);
        sendJson(res, result && result.ok ? 200 : 400, result || { ok: false, status: 'invalid' });
        return;
      }
      // Create a new account (used by the admin "add user" form).
      const username = String((body && (body.username || body.email)) || '').trim();
      const fullName = String((body && (body.fullName || body.full_name || body.name)) || '').trim();
      const password = String((body && body.password) || '');
      const mustChange = body && body.mustChange != null ? Boolean(body.mustChange) : true;
      const role = String((body && body.role) || 'Candidate');
      const result = await callProc('auth_register', '$1, $2, $3, $4, $5', [username, fullName, password, mustChange, role]);
      sendJson(res, result && result.ok ? 201 : 200, result || { ok: false, status: 'invalid' });
      return;
    }

    // ── Applicant work-queue notifications ─────────────────────
    if (method === 'GET' && url.startsWith('/api/applicants/pending')) {
      const count = await callProc('applicant_pending_count', '', []);
      const rows = await callProc('applicant_pending_list', '', []);
      sendJson(res, 200, { ok: true, count: Number(count) || 0, applicants: Array.isArray(rows) ? rows : [] });
      return;
    }

    if (method === 'GET' && url.startsWith('/api/applicants/secretary-queue')) {
      const count = await callProc('applicant_secretary_count', '', []);
      const rows = await callProc('applicant_secretary_list', '', []);
      sendJson(res, 200, { ok: true, count: Number(count) || 0, applicants: Array.isArray(rows) ? rows : [] });
      return;
    }

    // ── Signature table (search / image / insert) ─────────────
    if (method === 'GET' && url.startsWith('/api/signatures/officer')) {
      const officer = await callProc('signature_officer', '', []);
      sendJson(res, 200, { ok: true, officer: officer || null });
      return;
    }

    if (method === 'GET' && url.startsWith('/api/signatures/image')) {
      const id = new URL(url, 'http://localhost').searchParams.get('id');
      if (!id) {
        sendJson(res, 400, { error: 'Missing signature id' });
        return;
      }
      await sendSignatureImage(res, id);
      return;
    }

    if (method === 'GET' && url.startsWith('/api/signatures')) {
      const params = new URL(url, 'http://localhost').searchParams;
      await listSignatures(res, {
        q: params.get('q') || '',
        limit: Number.parseInt(params.get('limit') || '10', 10) || 10,
        offset: Number.parseInt(params.get('offset') || '0', 10) || 0,
      });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/signatures')) {
      const body = await readJsonBody(req);
      await createSignature(res, body);
      return;
    }

    if (method === 'DELETE' && url.startsWith('/api/signatures')) {
      const id = new URL(url, 'http://localhost').searchParams.get('id');
      if (!id) {
        sendJson(res, 400, { error: 'Missing signature id' });
        return;
      }
      await deleteSignature(res, id);
      return;
    }

    // ── Training (panel-presences) ─────────────────────────────
    if (method === 'GET' && url.startsWith('/api/training/students')) {
      const title = new URL(url, 'http://localhost').searchParams.get('title') || '';
      await listTrainingStudents(res, title);
      return;
    }

    // Assign / unassign an applicant to a training (applicant_training).
    if (method === 'POST' && url.startsWith('/api/training/assign')) {
      const body = await readJsonBody(req);
      await assignTraining(res, body);
      return;
    }

    // Trainings an applicant is enrolled in.
    if (method === 'GET' && url.startsWith('/api/applicant-trainings')) {
      const candidateNo = new URL(url, 'http://localhost').searchParams.get('candidate_no') || '';
      await listApplicantTrainings(res, candidateNo);
      return;
    }

    if (method === 'GET' && url.startsWith('/api/training')) {
      const trainer = new URL(url, 'http://localhost').searchParams.get('trainer') || '';
      await listTraining(res, trainer);
      return;
    }

    if (method === 'POST' && url.startsWith('/api/training')) {
      const body = await readJsonBody(req);
      await upsertTraining(res, body);
      return;
    }

    // ── Attendance sheet (attSheetTable) ───────────────────────
    if (method === 'GET' && url.startsWith('/api/attendance/candidate')) {
      const candidateNo = new URL(url, 'http://localhost').searchParams.get('candidate_no') || '';
      await listCandidateAttendance(res, candidateNo);
      return;
    }

    if (method === 'GET' && url.startsWith('/api/attendance')) {
      const params = new URL(url, 'http://localhost').searchParams;
      await listAttendance(res, {
        title: params.get('title') || '',
        from: params.get('from'),
        to: params.get('to'),
      });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/attendance')) {
      const body = await readJsonBody(req);
      await saveAttendance(res, body);
      return;
    }

    // ── Exam configuration (questions per training) ───────────
    if (method === 'GET' && url.startsWith('/api/questions')) {
      const trainingId = new URL(url, 'http://localhost').searchParams.get('training_id') || '';
      const id = Number.parseInt(String(trainingId), 10);
      if (!Number.isFinite(id)) {
        sendJson(res, 400, { error: 'A valid training_id is required.' });
        return;
      }
      const rows = await callProc('questions_for_training', '$1', [id]);
      sendJson(res, 200, { ok: true, questions: Array.isArray(rows) ? rows : [] });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/exams')) {
      const body = await readJsonBody(req);
      const result = await callProc('exam_save', '$1::jsonb', [JSON.stringify(body || {})]);
      sendJson(res, result && result.ok ? 201 : 400, result || { ok: false, status: 'invalid' });
      return;
    }

    // ── Dictionary (reference values) CRUD via the generic stored proc ──
    if (method === 'GET' && url.startsWith('/api/dictionary')) {
      const category = new URL(url, 'http://localhost').searchParams.get('category');
      const items = await dictionaryCrud('list', category || null);
      sendJson(res, 200, { ok: true, items: Array.isArray(items) ? items : [] });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/dictionary')) {
      const body = await readJsonBody(req);
      const idRaw = body && (body.dict_id != null ? body.dict_id : body.id);
      const id = Number.parseInt(String(idRaw), 10);
      const category = (body && body.category) || null;
      const item = Number.isFinite(id)
        ? await dictionaryCrud('update', category, body, id)
        : await dictionaryCrud('insert', category, body, null);
      if (item == null) {
        sendJson(res, 400, { error: 'Could not save the dictionary value.' });
        return;
      }
      sendJson(res, Number.isFinite(id) ? 200 : 201, { ok: true, item });
      return;
    }

    if (method === 'DELETE' && url.startsWith('/api/dictionary')) {
      const idRaw = new URL(url, 'http://localhost').searchParams.get('id');
      const id = Number.parseInt(String(idRaw), 10);
      if (!Number.isFinite(id)) {
        sendJson(res, 400, { error: 'Missing dictionary id' });
        return;
      }
      const deleted = await dictionaryCrud('delete', null, {}, id);
      if (deleted !== true) {
        sendJson(res, 404, { error: 'Dictionary value not found' });
        return;
      }
      sendJson(res, 200, { ok: true, deleted: true });
      return;
    }

    // ── Generic per-table records (drives the panel data grid + search) ──
    if (method === 'GET' && url.startsWith('/api/records')) {
      const table = new URL(url, 'http://localhost').searchParams.get('table') || '';
      await listRecords(res, table);
      return;
    }

    if (url.startsWith('/api/')) {
      sendJson(res, 404, { error: 'Unknown API route' });
      return;
    }

    // Anything else → static assets (default to tc.html at the root).
    serveStatic(res, url === '/' ? 'tc.html' : url);
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
      console.log(`GSS test server running → placeholder:${PORT}/tc/tc.html`);
    });
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to connect to the database:', err);
    process.exit(1);
  });
