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
const rbac = require('./rbac');
const email = require('./email');

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
 * The acting user for a request, read from the actor headers the front-end
 * attaches (see the global fetch interceptor). Used to stamp created_by /
 * updated_by audit fields. Returns null when no user is identified.
 * @param {http.IncomingMessage} req
 * @returns {{ id: number | null, name: string, role: string }}
 */
const actorOf = (req) => {
  const verified = rbac.verifyToken(rbac.bearerOf(req));
  if (verified) return { id: verified.id, name: verified.name, role: verified.role };
  const h = req.headers || {};
  const rawId = Array.isArray(h['x-gss-user-id']) ? h['x-gss-user-id'][0] : h['x-gss-user-id'];
  const rawName = Array.isArray(h['x-gss-user-name']) ? h['x-gss-user-name'][0] : h['x-gss-user-name'];
  const rawRole = Array.isArray(h['x-gss-role']) ? h['x-gss-role'][0] : h['x-gss-role'];
  const id = Number.parseInt(String(rawId || ''), 10);
  return {
    id: Number.isFinite(id) ? id : null,
    name: rawName ? String(rawName) : '',
    role: rawRole ? String(rawRole) : '',
  };
};

/**
 * Stamp the acting user onto a request body so the named stored procedures can
 * record audit fields authoritatively (instead of trusting the client). Adds
 * `created_by_name` / `updated_by_name` (for the varchar-audit procs) and, when
 * `withId` is set, `created_by` / `updated_by` ids (for the bigint-audit procs).
 * Existing values are preserved so callers that already send the actor win.
 * @param {Record<string, any>} body
 * @param {{ id: number | null, name: string, role: string }} actor
 * @param {boolean} [withId=true]
 * @returns {Record<string, any>}
 */
const injectActor = (body, actor, withId = true) => {
  if (!body || typeof body !== 'object' || Array.isArray(body) || !actor) return body;
  if (actor.name) {
    if (body.created_by_name == null) body.created_by_name = actor.name;
    if (body.updated_by_name == null) body.updated_by_name = actor.name;
  }
  if (withId && actor.id != null) {
    if (body.created_by == null || body.created_by === '') body.created_by = actor.id;
    if (body.updated_by == null || body.updated_by === '') body.updated_by = actor.id;
  }
  return body;
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

/**
 * True when the acting user holds the Admin role (per the actor header).
 * @param {http.IncomingMessage} req
 * @returns {boolean}
 */
const actorIsAdmin = (req) => {
  const v = rbac.verifyToken(rbac.bearerOf(req));
  return !!v && String(v.role || '').toLowerCase() === 'admin';
};

/**
 * Mandatory Admin-only gate (System Management). Independent of the Permission
 * Matrix: requires a valid token AND a live Admin role in the database, so a
 * demoted user loses access immediately. Sends 401/403 and returns false.
 * @returns {Promise<boolean>}
 */
const requireAdmin = async (req, res) => {
  const v = rbac.verifyToken(rbac.bearerOf(req));
  if (!v) { sendJson(res, 401, { ok: false, status: 'unauthenticated' }); return false; }
  const info = await callProc('auth_user_role', '$1', [v.name]);
  if (!info || String(info.role || '').toLowerCase() !== 'admin') {
    sendJson(res, 403, { ok: false, status: 'forbidden' });
    return false;
  }
  return true;
};

/**
 * Server-side permission check against the dynamic permission store. Only a
 * verified bearer token identifies the actor (headers are never trusted);
 * user_can` then resolves admin / inactive / stored rows / role defaults.
 * @param {http.IncomingMessage} req
 * @param {string} section  e.g. '1.1'
 * @param {string} action   e.g. 'delete'
 * @returns {Promise<boolean>}
 */
const actorCan = async (req, section, action) => {
  const v = rbac.verifyToken(rbac.bearerOf(req));
  if (!v) return false;
  const ok = await callProc('user_can', '$1::bigint, $2, $3', [v.id, section, action]);
  return ok === true;
};

/**
 * Enforce { section, action } requirements. Sends 401 when the caller is not
 * authenticated and 403 when any requirement is not granted. Every role,
 * Candidate included, is resolved from the saved Permission Matrix.
 * @returns {Promise<boolean>} true when the request may proceed
 */
const authorize = async (req, res, requirements, opts = {}) => {
  const v = rbac.verifyToken(rbac.bearerOf(req));
  if (!v) { sendJson(res, 401, { ok: false, status: 'unauthenticated' }); return false; }
  for (const r of requirements) {
    if (!(await actorCan(req, r.section, r.action))) {
      sendJson(res, 403, { ok: false, status: 'forbidden', section: r.section, action: r.action });
      return false;
    }
  }
  return true;
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
      // ~4 MB guard: large enough for a 1 MB candidate photo (base64 ≈ 1.37 MB)
      // plus the signature data URL and the rest of the form, yet still bounded.
      if (raw.length > 4 * 1024 * 1024) reject(new Error('Payload too large'));
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
      // @ts-ignore
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

/** Profile-image upload constraints (mirrors the client-side validation). */
const AVATAR_ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif']);
const AVATAR_MAX_BYTES = 1.5 * 1024 * 1024; // decoded image ceiling (~1.5 MB)

/**
 * Validate and normalise a profile image on a user-management payload.
 * Converts a `profile_image` data URL into the hex string + MIME type the
 * `login_user_update` procedure expects, enforcing allowed types and a size
 * cap. A truthy `clear_profile_image` flag is passed through untouched (it
 * removes the avatar). Absent/blank values leave the avatar unchanged.
 * @param {Record<string, any>} body
 * @returns {{ ok: true } | { ok: false, status: string }}
 */
const prepareProfileImage = (body) => {
  if (!body || typeof body !== 'object') return { ok: true };
  if (body.clear_profile_image) { delete body.profile_image; delete body.profile_image_type; return { ok: true }; }
  const raw = body.profile_image;
  if (raw == null || raw === '') { delete body.profile_image; delete body.profile_image_type; return { ok: true }; }
  const image = dataUrlToBuffer(typeof raw === 'string' ? raw : '');
  if (!image) return { ok: false, status: 'invalid_image' };
  if (!AVATAR_ALLOWED_TYPES.has(String(image.contentType).toLowerCase())) return { ok: false, status: 'invalid_image_type' };
  if (image.buffer.length > AVATAR_MAX_BYTES) return { ok: false, status: 'image_too_large' };
  body.profile_image = image.buffer.toString('hex');
  body.profile_image_type = image.contentType.slice(0, 100);
  return { ok: true };
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
 * Binary (`bytea`) columns are stripped from the payload. When `page` options are
 * supplied the rows are windowed server-side and a `total` count is returned.
 * @param {http.ServerResponse} res
 * @param {string} table
 * @param {{ limit?: number, offset?: number } | null} [page]
 */
const listRecords = async (res, table, page = null) => {
  if (!table) {
    sendJson(res, 400, { error: 'Missing table name' });
    return;
  }
  if (!await tableExists(table)) {
    sendJson(res, 200, { ok: true, table, exists: false, columns: [], records: [], total: 0 });
    return;
  }
  const { columns, byteaCols } = await getTableColumns(table);
  const strip = (/** @type {any} */ row) => {
    if (!byteaCols.size || !row) return row;
    const clean = { ...row };
    byteaCols.forEach((c) => { delete clean[c]; });
    return clean;
  };
  const publicColumns = columns.filter((c) => !byteaCols.has(c.name));

  // Paginated path: one server-side window + total count (scales to large tables).
  if (page && Number.isFinite(page.limit)) {
    const result = await callProc('records_page', '$1, $2, $3', [table, page.limit, page.offset || 0]);
    const rows = result && Array.isArray(result.rows) ? result.rows : [];
    sendJson(res, 200, {
      ok: true, table, exists: true, columns: publicColumns,
      records: rows.map(strip),
      total: Number(result && result.total) || 0,
      limit: Number(result && result.limit) || page.limit,
      offset: Number(result && result.offset) || (page.offset || 0),
    });
    return;
  }

  const rows = await crud('select', table);
  const records = (Array.isArray(rows) ? rows : []).map(strip);
  sendJson(res, 200, { ok: true, table, exists: true, columns: publicColumns, records, total: records.length });
};

/**
 * Insert an applicant from the posted `{ column: value }` payload.
 * Values are evaluated/coerced to their column types here, then handed to the
 * `dynamic_crud` stored function which validates the table/columns and builds
 * the parametrized INSERT inside PostgreSQL.
 * @param {http.ServerResponse} res
 * @param {Record<string, any>} body
 * @param {{ id: number | null, name: string, role: string }} [actor]
 */
const createApplicant = async (res, body, actor) => {
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

  // applicant_name duplicates full_name (its own form field was removed), so
  // mirror it here to satisfy the column's NOT NULL constraint.
  if (row.applicant_name === undefined && row.full_name !== undefined && meta.get('applicant_name')?.insertable) {
    row.applicant_name = row.full_name;
  }

  // Determine insert vs update up-front so photo rules can depend on it.
  const idRaw = body && (body.candidate_no || body.CandidateNo);
  const id = Number.parseInt(String(idRaw), 10);
  const isUpdate = Number.isFinite(id);

  // The candidate photo is mandatory when registering a NEW applicant. On
  // update the stored photo is preserved when the client doesn't resend it.
  if (!isUpdate && (typeof row.candidate_photo !== 'string' || row.candidate_photo.trim() === '')) {
    sendJson(res, 400, { error: 'A candidate photo is required to register an applicant.' });
    return;
  }

  // Validate the candidate photo when provided: must be an image data URL ≤ 1 MB.
  if (typeof row.candidate_photo === 'string' && row.candidate_photo !== '') {
    const match = /^data:(image\/[a-z0-9.+-]+);base64,(.+)$/i.exec(row.candidate_photo.trim());
    if (!match) {
      sendJson(res, 400, { error: 'The candidate photo must be a valid image.' });
      return;
    }
    const bytes = Buffer.from(match[2], 'base64');
    if (bytes.length === 0 || bytes.length > 1024 * 1024) {
      sendJson(res, 400, { error: 'The candidate photo must not exceed 1 MB.' });
      return;
    }
  }

  if (Object.keys(row).length === 0) {
    sendJson(res, 400, { error: 'No applicant data provided.' });
    return;
  }

  // Stamp audit fields from the acting user (client-supplied values are never
  // trusted for these). created_by is set only on insert; updated_by always.
  const actorId = actor && actor.id != null ? actor.id : null;
  if (actorId != null) {
    if (isUpdate) {
      if (meta.get('updated_by')?.insertable) row.updated_by = actorId;
    } else {
      if (meta.get('created_by')?.insertable) row.created_by = actorId;
      if (meta.get('updated_by')?.insertable) row.updated_by = actorId;
    }
  }
  // Never let a client overwrite immutable creation audit on update.
  if (isUpdate) { delete row.created_by; delete row.created_at; }

  const applicant = isUpdate
    ? await callProc('registration_update', '$1, $2::jsonb', [id, JSON.stringify(row)])
    : await callProc('registration_insert', '$1::jsonb', [JSON.stringify(row)]);
  sendJson(res, isUpdate ? 200 : 201, { ok: true, applicant });
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
 * List the students assigned to a training (candidates with attendance rows).
 * Resolves the session by training_id when provided (exact), else by title.
 * @param {http.ServerResponse} res
 * @param {{ trainingId?: string|null, title?: string }} opts
 */
const listTrainingStudents = async (res, opts) => {
  const trainingId = opts.trainingId != null && opts.trainingId !== '' ? Number.parseInt(String(opts.trainingId), 10) : null;
  const title = (opts.title || '').toString();
  if (!Number.isFinite(trainingId) && !title) {
    sendJson(res, 400, { error: 'A training id or title is required.' });
    return;
  }
  const rows = Number.isFinite(trainingId)
    ? await callProc('training_students_by_id', '$1', [trainingId])
    : await callProc('training_students', '$1', [title]);
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
 * List attendance cells for a training within an optional date range.
 * Resolves the session by training_id when provided (exact), else by title.
 * @param {http.ServerResponse} res
 * @param {{ trainingId?: string|null, title?: string, from?: string|null, to?: string|null }} opts
 */
const listAttendance = async (res, opts) => {
  const trainingId = opts.trainingId != null && opts.trainingId !== '' ? Number.parseInt(String(opts.trainingId), 10) : null;
  const title = (opts.title || '').toString();
  if (!Number.isFinite(trainingId) && !title) {
    sendJson(res, 400, { error: 'A training id or title is required.' });
    return;
  }
  const rows = Number.isFinite(trainingId)
    ? await callProc('attendance_list_by_id', '$1, $2, $3', [trainingId, opts.from || null, opts.to || null])
    : await callProc('attendance_list', '$1, $2, $3', [title, opts.from || null, opts.to || null]);
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
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-GSS-User-Id, X-GSS-User-Name, X-GSS-Role, Authorization');

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
      // Authentication is mandatory for any save.
      const actor = rbac.verifyToken(rbac.bearerOf(req));
      if (!actor) { sendJson(res, 401, { ok: false, status: 'unauthenticated' }); return; }

      const idRaw = body && (body.candidate_no || body.CandidateNo);
      const isUpdate = Number.isFinite(Number.parseInt(String(idRaw), 10));
      const action = isUpdate ? 'edit' : 'add';

      // Classify each posted column by module section, then keep only the
      // sections the actor may write. Columns in sections the actor lacks
      // permission on are DROPPED from the payload (never applied) rather than
      // rejecting the whole request — so a registration clerk can create a
      // Pending applicant even though the "For Administration Use Only" fields
      // (interview_result default 'Pending', remarks) map to section 1.2 which
      // they cannot write. This fixes the spurious 403 without weakening
      // security: unauthorized values are silently ignored, and a clear 403 is
      // still returned when the actor may not write to ANY touched section.
      const postedCols = Object.keys(body || {}).filter((k) => body[k] !== '' && body[k] != null);
      const sectionsNeeded = new Set();
      for (const col of postedCols) {
        const s = rbac.sectionForColumn(col);
        if (s) sectionsNeeded.add(s);
      }
      const deniedSections = new Set();
      let allowedCount = 0;
      for (const s of sectionsNeeded) {
        if (await actorCan(req, s, action)) allowedCount += 1;
        else deniedSections.add(s);
      }
      if (sectionsNeeded.size > 0 && allowedCount === 0) {
        const first = [...deniedSections].sort()[0];
        sendJson(res, 403, { ok: false, status: 'forbidden', section: first, action });
        return;
      }
      if (deniedSections.size > 0) {
        for (const col of postedCols) {
          const s = rbac.sectionForColumn(col);
          if (s && deniedSections.has(s)) delete body[col];
        }
      }
      await createApplicant(res, body, actorOf(req));
      return;
    }

    // ── Delete an applicant (and dependent rows) via stored procedure ──
    if (method === 'DELETE' && url.startsWith('/api/applicants')) {
      if (!(await authorize(req, res, [{ section: '1.1', action: 'delete' }]))) return;
      const id = Number.parseInt(new URL(url, 'http://localhost').searchParams.get('id') || '', 10);
      if (!Number.isFinite(id)) {
        sendJson(res, 400, { error: 'A valid applicant id is required.' });
        return;
      }
      const result = await callProc('registration_delete', '$1', [id]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false, error: 'Delete failed' });
      return;
    }

    // ── Registration (applicant) search via stored procedure ──
    if (method === 'GET' && url.startsWith('/api/registration/search')) {
      if (!(await authorize(req, res, [{ section: '1.1', action: 'view' }]))) return;
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
      if (!(await authorize(req, res, [{ section: '1.1', action: 'view' }]))) return;
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
      if (result && result.ok && result.user && result.user.user_id != null && !result.must_change_password) {
        result.token = rbac.signToken({ id: Number(result.user.user_id), name: result.user.username || result.user.full_name || '', role: result.user.role || '' });
      }
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
      // Public sign-up can only create Candidate accounts; staff roles are admin-assigned.
      const role = 'Candidate';
      const result = await callProc('auth_register', '$1, $2, $3, $4, $5', [username, fullName, password, mustChange, role]);
      if (result && result.ok) await callProc('permissions_seed_missing', '', []);
      sendJson(res, result && result.ok ? 201 : 200, result || { ok: false, status: 'invalid' });
      return;
    }

    // ── Measurements (panel-mensuration) ───────────────────────
    if (method === 'GET' && url.startsWith('/api/measurements')) {
      if (!(await authorize(req, res, [{ section: '8.1', action: 'view' }]))) return;
      const candidateNo = new URL(url, 'http://localhost').searchParams.get('candidate_no') || '';
      const id = Number.parseInt(String(candidateNo), 10);
      if (!Number.isFinite(id)) { sendJson(res, 400, { error: 'A valid candidate number is required.' }); return; }
      const measurement = await callProc('measurements_get', '$1', [id]);
      sendJson(res, 200, { ok: true, measurement: measurement || null });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/measurements')) {
      if (!(await authorize(req, res, [{ section: '8.1', action: 'edit' }]))) return;
      const body = await readJsonBody(req);
      injectActor(body, actorOf(req));
      const result = await callProc('measurements_upsert', '$1::jsonb', [JSON.stringify(body || {})]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false, status: 'invalid' });
      return;
    }

    // ── Dashboard statistic: trainees who completed training ───
    if (method === 'GET' && url.startsWith('/api/stats/trainees-trained')) {
      const result = await callProc('trainees_trained_count', '', []);
      sendJson(res, 200, result || { ok: true, count: 0 });
      return;
    }

    // ── Instructor courses (permissions panel) ─────────────────
    if (method === 'GET' && url.startsWith('/api/instructor-courses')) {
      if (!(await requireAdmin(req, res))) return;
      const trainer = new URL(url, 'http://localhost').searchParams.get('trainer') || '';
      const rows = await callProc('instructor_courses', '$1', [trainer]);
      sendJson(res, 200, { ok: true, courses: Array.isArray(rows) ? rows : [] });
      return;
    }

    // ── Active instructors (attendance trainer dropdown) ───────
    if (method === 'GET' && url.startsWith('/api/instructors')) {
      const rows = await callProc('instructors_list', '', []);
      sendJson(res, 200, { ok: true, instructors: Array.isArray(rows) ? rows : [] });
      return;
    }

    // ── Permissions: effective set for the signed-in user (UI gating) ──
    // Declared before the generic /api/me handler so it isn't shadowed.
    if (method === 'GET' && url.startsWith('/api/me/permissions')) {
      const v = rbac.verifyToken(rbac.bearerOf(req));
      if (!v) { sendJson(res, 401, { ok: false, status: 'unauthenticated' }); return; }
      const result = await callProc('user_effective_permissions', '$1', [v.name]);
      sendJson(res, 200, result || { ok: false, permissions: {} });
      return;
    }

    // ── Permissions: read / write a user's stored set (admin) ──
    if (method === 'GET' && url.startsWith('/api/permissions')) {
      if (!(await requireAdmin(req, res))) return;
      const loginId = Number.parseInt(new URL(url, 'http://localhost').searchParams.get('login_id') || '', 10);
      if (!Number.isFinite(loginId)) { sendJson(res, 400, { ok: false, status: 'invalid' }); return; }
      const result = await callProc('user_permissions_get', '$1', [loginId]);
      sendJson(res, result && result.ok ? 200 : 404, result || { ok: false });
      return;
    }

    if (method === 'POST' && url === '/api/permissions') {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJsonBody(req);
      const loginId = Number.parseInt(String(body && (body.login_id != null ? body.login_id : body.id)), 10);
      if (!Number.isFinite(loginId)) { sendJson(res, 400, { ok: false, status: 'invalid' }); return; }
      const actor = actorOf(req);
      const payload = { items: Array.isArray(body && body.items) ? body.items : [] };
      const result = await callProc('user_permissions_save', '$1, $2::jsonb, $3', [loginId, JSON.stringify(payload), actor.name || 'ADMIN']);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false });
      return;
    }

    // ── Permission templates: list / read (admin) ─────────────
    if (method === 'GET' && url.startsWith('/api/permission-templates')) {
      if (!(await requireAdmin(req, res))) return;
      const tid = Number.parseInt(new URL(url, 'http://localhost').searchParams.get('template_id') || '', 10);
      if (Number.isFinite(tid)) {
        const one = await callProc('permission_template_get', '$1', [tid]);
        sendJson(res, one && one.ok ? 200 : 404, one || { ok: false });
        return;
      }
      const rows = await callProc('permission_templates_list', '', []);
      sendJson(res, 200, { ok: true, templates: Array.isArray(rows) ? rows : [] });
      return;
    }

    // ── Permission templates: save / create / duplicate / delete / apply (admin) ──
    if (method === 'POST' && url === '/api/permission-templates') {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJsonBody(req);
      const actorName = actorOf(req).name || 'ADMIN';
      const op = String((body && body.op) || '').toLowerCase();
      const payload = JSON.stringify({ items: Array.isArray(body && body.items) ? body.items : [] });
      const tid = Number.parseInt(String(body && body.template_id), 10);
      if (op === 'save') {
        if (!Number.isFinite(tid)) { sendJson(res, 400, { ok: false, status: 'invalid' }); return; }
        const r = await callProc('permission_template_save', '$1, $2::jsonb, $3', [tid, payload, actorName]);
        sendJson(res, r && r.ok ? 200 : 400, r || { ok: false });
        return;
      }
      if (op === 'create') {
        const roleArg = String((body && body.role) || '').trim() || null;
        const r = await callProc('permission_template_create', '$1, $2, $3::jsonb, $4', [String((body && body.name) || ''), roleArg, payload, actorName]);
        sendJson(res, r && r.ok ? 201 : 400, r || { ok: false });
        return;
      }
      if (op === 'duplicate') {
        if (!Number.isFinite(tid)) { sendJson(res, 400, { ok: false, status: 'invalid' }); return; }
        const r = await callProc('permission_template_duplicate', '$1, $2, $3', [tid, String((body && body.name) || ''), actorName]);
        sendJson(res, r && r.ok ? 201 : 400, r || { ok: false });
        return;
      }
      if (op === 'delete') {
        if (!Number.isFinite(tid)) { sendJson(res, 400, { ok: false, status: 'invalid' }); return; }
        const r = await callProc('permission_template_delete', '$1', [tid]);
        sendJson(res, r && r.ok ? 200 : 400, r || { ok: false });
        return;
      }
      if (op === 'apply' || op === 'reset') {
        if (!Number.isFinite(tid)) { sendJson(res, 400, { ok: false, status: 'invalid' }); return; }
        const ids = Array.isArray(body && body.login_ids) ? body.login_ids : [];
        const r = await callProc('permission_template_apply', '$1, $2::jsonb, $3', [tid, JSON.stringify(ids), actorName]);
        sendJson(res, r && r.ok ? 200 : 400, r || { ok: false });
        return;
      }
      sendJson(res, 400, { ok: false, status: 'unknown_op' });
      return;
    }

    // ── Current user's live role/status (self-heals stale sessions) ──
    if (method === 'GET' && url.startsWith('/api/me')) {
      // Profile picture stream (checked before the generic /api/me handler).
      // Unauthenticated like /api/signatures/image because an <img> tag cannot
      // attach the bearer token; avatars are low-sensitivity.
      if (url.startsWith('/api/me/avatar')) {
        const who = new URL(url, 'http://localhost').searchParams.get('username') || '';
        const img = await callProc('auth_avatar', '$1', [who]);
        const hex = img && img.image_hex;
        if (!img || typeof hex !== 'string' || hex.length === 0) {
          sendJson(res, 404, { ok: false, status: 'no_avatar' });
          return;
        }
        const buffer = Buffer.from(hex, 'hex');
        res.writeHead(200, {
          'Content-Type': (img.content_type || 'image/png'),
          'Content-Length': buffer.length,
          // Immutable once the cache-busting `v` (avatar_ver) changes on update.
          'Cache-Control': 'private, max-age=86400',
          'ETag': '"' + String(img.avatar_ver || 0) + '"',
        });
        res.end(buffer);
        return;
      }
      const username = new URL(url, 'http://localhost').searchParams.get('username') || '';
      const info = await callProc('auth_user_role', '$1', [username]);
      sendJson(res, 200, info ? Object.assign({ ok: true }, info) : { ok: false });
      return;
    }

    // ── User management (admin) ────────────────────────────────
    if (method === 'GET' && url.startsWith('/api/users')) {
      if (!(await requireAdmin(req, res))) return;
      const rows = await callProc('login_users_list', '', []);
      sendJson(res, 200, { ok: true, users: Array.isArray(rows) ? rows : [] });
      return;
    }

    if (method === 'POST' && url === '/api/users') {
      if (!(await requireAdmin(req, res))) return;
      const body = await readJsonBody(req);
      injectActor(body, actorOf(req));
      const notifyWanted = !!(body && body.notify);
      const emailAddr = String((body && body.email) || '').trim();
      // Validate the email format on the backend regardless of the UI state.
      if (emailAddr && !email.isValidEmail(emailAddr)) {
        sendJson(res, 400, { ok: false, status: 'invalid_email' });
        return;
      }
      const lang = String((body && body.lang) || 'en');
      // Validate / normalise any profile image before it reaches the procedures.
      const imagePrep = prepareProfileImage(body);
      if (!imagePrep.ok) { sendJson(res, 400, { ok: false, status: imagePrep.status }); return; }
      const idRaw = body && (body.login_id != null ? body.login_id : body.id);
      const id = Number.parseInt(String(idRaw), 10);
      if (Number.isFinite(id)) {
        // Update an existing account (role / active / details / password).
        const result = await callProc('login_user_update', '$1, $2::jsonb', [id, JSON.stringify(body || {})]);
        if (!(result && result.ok)) { sendJson(res, 400, result || { ok: false, status: 'invalid' }); return; }
        // Only after a successful DB write do we consider notifying.
        /** @type {any} */
        let notification = { attempted: false, sent: false, skipped: true, reason: 'not_requested' };
        const u = result.user || {};
        if (notifyWanted && email.isValidEmail(u.email)) {
          const kind = result.password_changed ? 'passwordChanged' : 'accountUpdated';
          notification = await email.notify(kind, {
            email: u.email, fullName: u.full_name, username: u.username, lang,
            mustChange: u.must_change_password, changes: Array.isArray(body.changes) ? body.changes : [],
          });
        }
        sendJson(res, 200, Object.assign({}, result, { notification }));
        return;
      }
      // Create a new account (used by the admin "add user" form).
      const username = String((body && (body.username || body.email)) || '').trim();
      const fullName = String((body && (body.fullName || body.full_name || body.name)) || '').trim();
      const password = String((body && body.password) || '');
      const mustChange = body && body.mustChange != null ? Boolean(body.mustChange) : true;
      const role = String((body && body.role) || 'Candidate');
      const result = await callProc('auth_register', '$1, $2, $3, $4, $5, $6', [username, fullName, password, mustChange, role, emailAddr || null]);
      if (result && result.ok) {
        // Apply the role's default permission template (if any) to the new
        // account, then run the lazy seeder for roles without a template.
        const newUser = result.user || {};
        const newId = Number.parseInt(String(newUser.user_id != null ? newUser.user_id : newUser.login_id), 10);
        if (Number.isFinite(newId)) await callProc('user_apply_role_template', '$1, $2', [newId, actorOf(req).name || 'ADMIN']);
        await callProc('permissions_seed_missing', '', []);
        // Persist the "notify by email" preference and the optional profile
        // picture in a single follow-up update (auth_register handles neither).
        // The image was already validated + hex-encoded by prepareProfileImage.
        if (Number.isFinite(newId)) {
          /** @type {Record<string, any>} */
          const extra = { notify_email: notifyWanted };
          if (typeof body.profile_image === 'string' && body.profile_image) {
            extra.profile_image = body.profile_image;
            extra.profile_image_type = body.profile_image_type || 'image/png';
          }
          const imgResult = await callProc('login_user_update', '$1, $2::jsonb', [newId, JSON.stringify(extra)]);
          if (imgResult && imgResult.user && result.user) {
            result.user.has_avatar = imgResult.user.has_avatar;
            result.user.avatar_ver = imgResult.user.avatar_ver;
            result.user.notify_email = imgResult.user.notify_email;
          }
        }
      }
      // Notify only when the account was actually created and an address exists.
      /** @type {any} */
      let notification = { attempted: false, sent: false, skipped: true, reason: 'not_requested' };
      if (result && result.ok && notifyWanted && email.isValidEmail(emailAddr)) {
        notification = await email.notify('newAccount', {
          email: emailAddr, fullName, username, lang, mustChange,
        });
      }
      sendJson(res, result && result.ok ? 201 : 200, result && result.ok ? Object.assign({}, result, { notification }) : (result || { ok: false, status: 'invalid' }));
      return;
    }

    // ── Applicant work-queue notifications ─────────────────────
    if (method === 'GET' && url.startsWith('/api/applicants/pending')) {
      if (!(await authorize(req, res, [{ section: '10.4', action: 'view' }]))) return;
      const count = await callProc('applicant_pending_count', '', []);
      const rows = await callProc('applicant_pending_list', '', []);
      sendJson(res, 200, { ok: true, count: Number(count) || 0, applicants: Array.isArray(rows) ? rows : [] });
      return;
    }

    if (method === 'GET' && url.startsWith('/api/applicants/secretary-queue')) {
      if (!(await authorize(req, res, [{ section: '10.5', action: 'view' }]))) return;
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

    if (method === 'GET' && url.startsWith('/api/signatures/by-contact')) {
      const name = new URL(url, 'http://localhost').searchParams.get('name') || '';
      const sig = await callProc('signature_find_by_contact', '$1', [name]);
      sendJson(res, 200, { ok: true, signature: sig || null });
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
      if (!(await authorize(req, res, [{ section: '10.3', action: 'add' }]))) return;
      const body = await readJsonBody(req);
      await createSignature(res, body);
      return;
    }

    if (method === 'DELETE' && url.startsWith('/api/signatures')) {
      if (!(await authorize(req, res, [{ section: '10.3', action: 'delete' }]))) return;
      const id = new URL(url, 'http://localhost').searchParams.get('id');
      if (!id) {
        sendJson(res, 400, { error: 'Missing signature id' });
        return;
      }
      await deleteSignature(res, id);
      return;
    }

    // ── Reports ────────────────────────────────────────────────
    // Training Register dashboard data. All filters optional.
    if (method === 'GET' && url.startsWith('/api/reports/training-register')) {
      const q = new URL(url, 'http://localhost').searchParams;
      const rows = await callProc('training_register_report', '$1, $2, $3, $4, $5', [
        q.get('from') || null,
        q.get('to') || null,
        q.get('trainer') || null,
        q.get('status') || null,
        q.get('search') || null,
      ]);
      sendJson(res, 200, { ok: true, trainings: Array.isArray(rows) ? rows : [] });
      return;
    }

    // Candidate Details report: enrolled candidates (+ measurements). With a
    // training_id → that session only; without → every candidate (all sessions).
    if (method === 'GET' && url.startsWith('/api/reports/candidate-details')) {
      const q = new URL(url, 'http://localhost').searchParams;
      const id = Number.parseInt(q.get('training_id') || '', 10);
      const rows = await callProc('candidate_details_report', '$1', [Number.isFinite(id) ? id : null]);
      sendJson(res, 200, { ok: true, candidates: Array.isArray(rows) ? rows : [] });
      return;
    }

    // ── Training (panel-presences) ─────────────────────────────
    if (method === 'GET' && url.startsWith('/api/training/students')) {
      const params = new URL(url, 'http://localhost').searchParams;
      await listTrainingStudents(res, {
        trainingId: params.get('training_id'),
        title: params.get('title') || '',
      });
      return;
    }

    // Assign / unassign an applicant to a training (applicant_training).
    if (method === 'POST' && url.startsWith('/api/training/assign')) {
      const body = await readJsonBody(req);
      injectActor(body, actorOf(req));
      await assignTraining(res, body);
      return;
    }

    // Bulk training assignments for every candidate (one query for the whole
    // grid). Must precede the per-candidate route: both share the prefix.
    if (method === 'GET' && url.startsWith('/api/applicant-trainings-all')) {
      const map = await callProc('applicant_trainings_map', '', []);
      sendJson(res, 200, { ok: true, trainings: map || {} });
      return;
    }

    // ── Hybrid grouped pagination for the applicant grid ───────
    // Lightweight group headers + counts (optionally scoped to an
    // instructor's trainings). The client renders these collapsed and
    // pages each group's rows lazily on expand.
    if (method === 'GET' && url.startsWith('/api/grid/groups')) {
      const trainer = new URL(url, 'http://localhost').searchParams.get('trainer') || null;
      const summary = await callProc('grid_group_summaries', '$1', [trainer]);
      sendJson(res, 200, { ok: true, groups: (summary && summary.groups) || [], unassigned: Number(summary && summary.unassigned) || 0 });
      return;
    }

    // One ordered page of a single group's candidates, with the latest
    // exam attempt merged in. bytea columns are stripped from the payload.
    if (method === 'GET' && url.startsWith('/api/grid/group-rows')) {
      const q = new URL(url, 'http://localhost').searchParams;
      const tid = q.get('training_id');
      const trainingId = tid == null || tid === '' || tid === 'null' ? null : Number.parseInt(tid, 10);
      const limit = Number.parseInt(q.get('limit') || '100', 10);
      const offset = Number.parseInt(q.get('offset') || '0', 10) || 0;
      const { byteaCols } = await getTableColumns('applicant');
      const result = await callProc('grid_group_rows', '$1, $2, $3', [trainingId, limit, offset]);
      const rows = result && Array.isArray(result.rows) ? result.rows : [];
      const clean = byteaCols.size
        ? rows.map((/** @type {any} */ r) => { const c = { ...r }; byteaCols.forEach((b) => { delete c[b]; }); return c; })
        : rows;
      sendJson(res, 200, {
        ok: true,
        rows: clean,
        total: Number(result && result.total) || 0,
        limit: Number(result && result.limit) || limit,
        offset: Number(result && result.offset) || offset,
      });
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
      injectActor(body, actorOf(req));
      await upsertTraining(res, body);
      return;
    }

    // ── Attendance sheet (attSheetTable) ───────────────────────
    if (method === 'GET' && url.startsWith('/api/attendance/candidate')) {
      if (!(await authorize(req, res, [{ section: '5.1', action: 'view' }], {}))) return;
      const candidateNo = new URL(url, 'http://localhost').searchParams.get('candidate_no') || '';
      await listCandidateAttendance(res, candidateNo);
      return;
    }

    if (method === 'GET' && url.startsWith('/api/attendance')) {
      if (!(await authorize(req, res, [{ section: '5.1', action: 'view' }]))) return;
      const params = new URL(url, 'http://localhost').searchParams;
      await listAttendance(res, {
        trainingId: params.get('training_id'),
        title: params.get('title') || '',
        from: params.get('from'),
        to: params.get('to'),
      });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/attendance')) {
      const body = await readJsonBody(req);
      const isDelete = !!body && (body.delete === true || body._delete === true);
      if (isDelete) {
        if (!(await authorize(req, res, [{ section: '5.1', action: 'delete' }]))) return;
      } else if (!(await actorCan(req, '5.1', 'add')) && !(await actorCan(req, '5.1', 'edit'))) {
        if (!(await authorize(req, res, [{ section: '5.1', action: 'edit' }]))) return;
      }
      const trainingId = Number.parseInt(String((body && body.training_id) || ''), 10);
      if (Number.isFinite(trainingId)) {
        const own = await callProc('instructor_owns_training', '$1::bigint, $2::bigint', [actorOf(req).id, trainingId]);
        if (own !== true) { sendJson(res, 403, { ok: false, status: 'forbidden', reason: 'not_assigned_course' }); return; }
      }
      injectActor(body, actorOf(req));
      await saveAttendance(res, body);
      return;
    }

    // ── Exam configuration (questions per training) ───────────
    if (method === 'GET' && url.startsWith('/api/questions')) {
      if (!(await authorize(req, res, [{ section: '10.6', action: 'view' }]))) return;
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

    // Create / edit a single library question (+ its answers).
    if (method === 'POST' && url.startsWith('/api/question/save')) {
      const body = await readJsonBody(req);
      if (!(await authorize(req, res, [{ section: '10.6', action: body && body.question_id ? 'edit' : 'add' }]))) return;
      injectActor(body, actorOf(req));
      const result = await callProc('question_save', '$1::jsonb', [JSON.stringify(body || {})]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false, status: 'invalid' });
      return;
    }

    // Delete a single library question.
    if (method === 'POST' && url.startsWith('/api/question/delete')) {
      if (!(await authorize(req, res, [{ section: '10.6', action: 'delete' }]))) return;
      const body = await readJsonBody(req);
      const id = Number.parseInt(String(body && body.question_id), 10);
      if (!Number.isFinite(id)) { sendJson(res, 400, { error: 'question_id required' }); return; }
      const result = await callProc('question_delete', '$1', [id]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false, status: 'invalid' });
      return;
    }

    // Save which questions belong to the exam (order/points/instructions).
    if (method === 'POST' && url.startsWith('/api/exam/config')) {
      if (!(await authorize(req, res, [{ section: '10.6', action: 'edit' }]))) return;
      const body = await readJsonBody(req);
      injectActor(body, actorOf(req));
      const result = await callProc('exam_config_save', '$1::jsonb', [JSON.stringify(body || {})]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false, status: 'invalid' });
      return;
    }

    // Admin "preview as candidate" (questions WITHOUT the answer key).
    if (method === 'GET' && url.startsWith('/api/exam/preview')) {
      if (!(await authorize(req, res, [{ section: '10.6', action: 'view' }]))) return;
      const id = Number.parseInt(new URL(url, 'http://localhost').searchParams.get('training_id') || '', 10);
      if (!Number.isFinite(id)) { sendJson(res, 400, { error: 'training_id required' }); return; }
      const result = await callProc('exam_preview_for_training', '$1', [id]);
      sendJson(res, 200, result || { ok: false, status: 'no_exam' });
      return;
    }

    // ── Publish an exam + generate temporary exam accounts ─────
    if (method === 'POST' && url.startsWith('/api/exam/publish')) {
      if (!(await authorize(req, res, [{ section: '10.6', action: 'edit' }]))) return;
      const body = await readJsonBody(req);
      injectActor(body, actorOf(req));
      const result = await callProc('exam_publish', '$1::jsonb', [JSON.stringify(body || {})]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false, status: 'invalid' });
      return;
    }

    // ── Credential management table (Admin / Instructor / Head of Training) ──
    if (method === 'GET' && url.startsWith('/api/exam/credentials')) {
      if (!(await authorize(req, res, [{ section: '10.6', action: 'view' }]))) return;
      const p = new URL(url, 'http://localhost').searchParams;
      const payload = { exam_id: p.get('exam_id') || null, training_id: p.get('training_id') || null };
      const result = await callProc('exam_credentials_list', '$1::jsonb', [JSON.stringify(payload)]);
      sendJson(res, 200, result || { ok: false, rows: [] });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/exam/credential/reveal')) {
      if (!(await authorize(req, res, [{ section: '10.6', action: 'view' }]))) return;
      const body = await readJsonBody(req);
      const id = Number.parseInt(String(body && body.access_id), 10);
      if (!Number.isFinite(id)) { sendJson(res, 400, { error: 'access_id required' }); return; }
      const result = await callProc('exam_access_reveal', '$1', [id]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/exam/credential/send')) {
      if (!(await authorize(req, res, [{ section: '10.6', action: 'edit' }]))) return;
      const body = await readJsonBody(req);
      injectActor(body, actorOf(req));
      const result = await callProc('exam_access_send', '$1::jsonb', [JSON.stringify(body || {})]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/exam/credential/disable')) {
      if (!(await authorize(req, res, [{ section: '10.6', action: 'edit' }]))) return;
      const body = await readJsonBody(req);
      injectActor(body, actorOf(req));
      const result = await callProc('exam_access_disable', '$1::jsonb', [JSON.stringify(body || {})]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false });
      return;
    }

    // ── Generate a credential for a single "Not Generated" candidate ──
    if (method === 'POST' && url.startsWith('/api/exam/credential/generate')) {
      if (!(await authorize(req, res, [{ section: '10.6', action: 'add' }]))) return;
      const body = await readJsonBody(req);
      injectActor(body, actorOf(req));
      const result = await callProc('exam_access_generate', '$1::jsonb', [JSON.stringify(body || {})]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false });
      return;
    }

    // ── Candidate exam session (temporary credentials, server-timed) ──
    if (method === 'POST' && url.startsWith('/api/exam/login')) {
      const body = await readJsonBody(req);
      const username = String((body && body.username) || '').trim();
      const password = String((body && body.password) || '');
      const result = await callProc('exam_login', '$1, $2', [username, password]);
      sendJson(res, 200, result || { ok: false, status: 'invalid' });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/exam/answer')) {
      const body = await readJsonBody(req);
      const result = await callProc('exam_answer_save', '$1::jsonb', [JSON.stringify(body || {})]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false, status: 'invalid' });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/exam/submit')) {
      const body = await readJsonBody(req);
      const result = await callProc('exam_submit_token', '$1::jsonb', [JSON.stringify(body || {})]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false, status: 'invalid' });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/exam/result')) {
      const body = await readJsonBody(req);
      const result = await callProc('exam_result_for_token', '$1', [String((body && body.token) || '')]);
      sendJson(res, 200, result || { ok: false, status: 'invalid' });
      return;
    }

    // Bulk exam results for the applicant grid (one query for all candidates,
    // avoiding the per-row N+1). Must precede the singular route below because
    // both share the same '/api/exam/candidate-result' prefix.
    if (method === 'GET' && url.startsWith('/api/exam/candidate-results')) {
      const results = await callProc('exam_candidate_results_map', '', []);
      sendJson(res, 200, { ok: true, results: results || {} });
      return;
    }

    // Candidate's exam result summary for the applicant form's Panel-Exam.
    if (method === 'GET' && url.startsWith('/api/exam/candidate-result')) {
      const id = Number.parseInt(new URL(url, 'http://localhost').searchParams.get('candidate_no') || '', 10);
      if (!Number.isFinite(id)) { sendJson(res, 400, { error: 'candidate_no required' }); return; }
      const result = await callProc('exam_candidate_result', '$1', [id]);
      sendJson(res, 200, result || { ok: false });
      return;
    }

    // ── Correction (Admin / Instructor / Head of Training) ─────
    if (method === 'GET' && url.startsWith('/api/exam/correction')) {
      const id = Number.parseInt(new URL(url, 'http://localhost').searchParams.get('attempt_id') || '', 10);
      if (!Number.isFinite(id)) { sendJson(res, 400, { error: 'attempt_id required' }); return; }
      const result = await callProc('exam_attempt_for_correction', '$1', [id]);
      sendJson(res, result && result.ok ? 200 : 404, result || { ok: false });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/exam/grade/start')) {
      const body = await readJsonBody(req);
      injectActor(body, actorOf(req));
      const result = await callProc('exam_grade_start', '$1::jsonb', [JSON.stringify(body || {})]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false });
      return;
    }

    if (method === 'POST' && url.startsWith('/api/exam/grade')) {
      const body = await readJsonBody(req);
      injectActor(body, actorOf(req));
      const result = await callProc('exam_grade_save', '$1::jsonb', [JSON.stringify(body || {})]);
      sendJson(res, result && result.ok ? 200 : 400, result || { ok: false });
      return;
    }

    // Candidate's exam(s) list + single template (legacy anonymous preview path).
    if (method === 'GET' && url.startsWith('/api/exam/available')) {
      const id = Number.parseInt(new URL(url, 'http://localhost').searchParams.get('candidate_no') || '', 10);
      if (!Number.isFinite(id)) { sendJson(res, 400, { error: 'candidate_no required' }); return; }
      const rows = await callProc('exams_for_candidate', '$1', [id]);
      sendJson(res, 200, { ok: true, exams: Array.isArray(rows) ? rows : [] });
      return;
    }

    if (method === 'GET' && url.startsWith('/api/exam/by-id')) {
      const id = Number.parseInt(new URL(url, 'http://localhost').searchParams.get('exam_id') || '', 10);
      if (!Number.isFinite(id)) { sendJson(res, 400, { error: 'exam_id required' }); return; }
      const result = await callProc('exam_template_by_id', '$1', [id]);
      sendJson(res, 200, result || { ok: false, status: 'no_exam' });
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
      injectActor(body, actorOf(req));
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
      const params = new URL(url, 'http://localhost').searchParams;
      const table = params.get('table') || '';
      const limitRaw = params.get('limit');
      const page = limitRaw != null
        ? { limit: Number.parseInt(limitRaw, 10), offset: Number.parseInt(params.get('offset') || '0', 10) || 0 }
        : null;
      await listRecords(res, table, page);
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
    // Server-authoritative expiry: auto-close overdue attempts and deactivate
    // expired temporary credentials every minute (also enforced on each login).
    setInterval(() => {
      db.query('SELECT exam_expire_due()').catch((err) => {
        // eslint-disable-next-line no-console
        console.error('exam_expire_due sweep failed:', err.message);
      });
    }, 60 * 1000).unref();
  })
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('Failed to connect to the database:', err);
    process.exit(1);
  });