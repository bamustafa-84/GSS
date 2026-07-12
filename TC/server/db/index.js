// @ts-check
'use strict';

/**
 * GSS · Reusable PostgreSQL data-access layer
 * ==================================================================
 * A generic, table-agnostic helper for CRUD, transactions and raw
 * parameterized queries. Because every method takes the table name,
 * columns, values and conditions dynamically, the same module serves
 * every table in the application.
 *
 * Key guarantees:
 *   • All *values* are sent as bound parameters ($1, $2, …) — no string
 *     concatenation of user data, so it is safe against SQL injection.
 *   • All *identifiers* (table/column names) are validated & quoted.
 *   • A single connection pool is shared; transactions use one client.
 *
 * Quick start:
 *   const db = require('./db');
 *   const user = await db.insert('users', { name: 'Amy', email: 'a@x.io' });
 *   const list = await db.select('users', {
 *     columns: ['id', 'name'],
 *     where: { active: true, age: { gte: 18 } },
 *     orderBy: { created_at: 'DESC' },
 *     limit: 20, offset: 0,
 *   });
 *   await db.transaction(async (tx) => {
 *     await tx.insert('orders', { user_id: user.id, total: 10 });
 *     await tx.update('users', { orders_count: 1 }, { id: user.id });
 *   });
 */

const pool = require('./pool');
const {
  quoteIdentifier,
  buildColumnList,
  buildWhere,
  buildOrderBy,
  buildPagination,
} = require('./queryBuilder');

/**
 * @typedef {import('pg').PoolClient} PoolClient
 * @typedef {import('pg').QueryResult} QueryResult
 */

/**
 * Anything that can run a query: the pool itself or a checked-out client
 * (used to keep every statement of a transaction on the same connection).
 * @typedef {{ query: (text: string, params?: any[]) => Promise<QueryResult> }} Queryable
 */

/**
 * Run a raw parameterized query.
 * @param {string} text  SQL text with `$1`, `$2`, … placeholders.
 * @param {any[]} [params=[]]  Bound parameter values.
 * @param {Queryable} [executor=pool]  Pool or transaction client.
 * @returns {Promise<QueryResult>}
 */
const query = (text, params = [], executor = pool) => executor.query(text, params);

/**
 * Insert a single row and return the created record.
 * @param {string} table
 * @param {Record<string, any>} data  Column → value map.
 * @param {{ returning?: string | string[], executor?: Queryable }} [options]
 * @returns {Promise<any>} The inserted row.
 */
const insert = async (table, data, options = {}) => {
  const { returning = '*', executor = pool } = options;
  const columns = Object.keys(data);
  if (columns.length === 0) throw new TypeError('insert requires at least one column.');

  const cols = columns.map(quoteIdentifier).join(', ');
  const placeholders = columns.map((_, i) => `$${i + 1}`).join(', ');
  const values = columns.map((c) => data[c]);

  const sql =
    `INSERT INTO ${quoteIdentifier(table)} (${cols}) ` +
    `VALUES (${placeholders}) RETURNING ${buildColumnList(returning)}`;

  const result = await executor.query(sql, values);
  return result.rows[0];
};

/**
 * Insert many rows in a single statement and return the created records.
 * @param {string} table
 * @param {Record<string, any>[]} rows  Rows sharing the same column set.
 * @param {{ returning?: string | string[], executor?: Queryable }} [options]
 * @returns {Promise<any[]>} The inserted rows.
 */
const insertMany = async (table, rows, options = {}) => {
  const { returning = '*', executor = pool } = options;
  if (!Array.isArray(rows) || rows.length === 0) throw new TypeError('insertMany requires a non-empty array.');

  const columns = Object.keys(rows[0]);
  if (columns.length === 0) throw new TypeError('insertMany rows require at least one column.');

  const cols = columns.map(quoteIdentifier).join(', ');
  /** @type {any[]} */
  const values = [];
  let index = 1;
  const tuples = rows.map((row) => {
    const placeholders = columns.map((c) => {
      values.push(row[c]);
      return `$${index++}`;
    });
    return `(${placeholders.join(', ')})`;
  });

  const sql =
    `INSERT INTO ${quoteIdentifier(table)} (${cols}) ` +
    `VALUES ${tuples.join(', ')} RETURNING ${buildColumnList(returning)}`;

  const result = await executor.query(sql, values);
  return result.rows;
};

/**
 * Select rows with dynamic columns, conditions, ordering and pagination.
 * @param {string} table
 * @param {{
 *   columns?: string | string[],
 *   where?: Record<string, any>,
 *   orderBy?: string | string[] | Record<string, string> | Array<{column: string, direction?: string}>,
 *   limit?: number,
 *   offset?: number,
 *   distinct?: boolean,
 *   executor?: Queryable,
 * }} [options]
 * @returns {Promise<any[]>} Matching rows.
 */
const select = async (table, options = {}) => {
  const { columns = '*', where, orderBy, limit, offset, distinct = false, executor = pool } = options;

  const wherePart = buildWhere(where, 1);
  const orderPart = buildOrderBy(orderBy);
  const pagePart = buildPagination(limit, offset, wherePart.nextIndex);

  const sql = [
    `SELECT ${distinct ? 'DISTINCT ' : ''}${buildColumnList(columns)}`,
    `FROM ${quoteIdentifier(table)}`,
    wherePart.clause,
    orderPart,
    pagePart.clause,
  ]
    .filter(Boolean)
    .join(' ');

  const result = await executor.query(sql, [...wherePart.params, ...pagePart.params]);
  return result.rows;
};

/**
 * Select a single row (adds LIMIT 1). Returns `null` when nothing matches.
 * @param {string} table
 * @param {{
 *   columns?: string | string[],
 *   where?: Record<string, any>,
 *   orderBy?: string | string[] | Record<string, string> | Array<{column: string, direction?: string}>,
 *   executor?: Queryable,
 * }} [options]
 * @returns {Promise<any | null>}
 */
const findOne = async (table, options = {}) => {
  const rows = await select(table, { ...options, limit: 1, offset: undefined });
  return rows.length ? rows[0] : null;
};

/**
 * Count rows matching the given conditions.
 * @param {string} table
 * @param {{ where?: Record<string, any>, executor?: Queryable }} [options]
 * @returns {Promise<number>}
 */
const count = async (table, options = {}) => {
  const { where, executor = pool } = options;
  const wherePart = buildWhere(where, 1);
  const sql = `SELECT COUNT(*)::int AS count FROM ${quoteIdentifier(table)} ${wherePart.clause}`.trim();
  const result = await executor.query(sql, wherePart.params);
  return result.rows[0].count;
};

/**
 * Whether at least one row matches the given conditions.
 * @param {string} table
 * @param {Record<string, any>} where
 * @param {{ executor?: Queryable }} [options]
 * @returns {Promise<boolean>}
 */
const exists = async (table, where, options = {}) => (await count(table, { where, ...options })) > 0;

/**
 * Update rows matching the conditions and return the updated records.
 * @param {string} table
 * @param {Record<string, any>} data  Column → new value map.
 * @param {Record<string, any>} where  Conditions (required — refuses to update everything).
 * @param {{ returning?: string | string[], executor?: Queryable }} [options]
 * @returns {Promise<any[]>} The updated rows.
 */
const update = async (table, data, where, options = {}) => {
  const { returning = '*', executor = pool } = options;
  const columns = Object.keys(data);
  if (columns.length === 0) throw new TypeError('update requires at least one column to set.');
  if (!where || Object.keys(where).length === 0) {
    throw new TypeError('update requires a WHERE condition. Pass an explicit filter to change every row.');
  }

  /** @type {any[]} */
  const values = [];
  let index = 1;
  const assignments = columns.map((c) => {
    values.push(data[c]);
    return `${quoteIdentifier(c)} = $${index++}`;
  });

  const wherePart = buildWhere(where, index);

  const sql =
    `UPDATE ${quoteIdentifier(table)} SET ${assignments.join(', ')} ` +
    `${wherePart.clause} RETURNING ${buildColumnList(returning)}`;

  const result = await executor.query(sql, [...values, ...wherePart.params]);
  return result.rows;
};

/**
 * Delete rows matching the conditions and return the removed records.
 * @param {string} table
 * @param {Record<string, any>} where  Conditions (required — refuses to delete everything).
 * @param {{ returning?: string | string[], executor?: Queryable }} [options]
 * @returns {Promise<any[]>} The deleted rows.
 */
const remove = async (table, where, options = {}) => {
  const { returning = '*', executor = pool } = options;
  if (!where || Object.keys(where).length === 0) {
    throw new TypeError('remove requires a WHERE condition. Use truncate() to clear a whole table.');
  }

  const wherePart = buildWhere(where, 1);
  const sql =
    `DELETE FROM ${quoteIdentifier(table)} ${wherePart.clause} ` +
    `RETURNING ${buildColumnList(returning)}`;

  const result = await executor.query(sql, wherePart.params);
  return result.rows;
};

/**
 * A transaction-scoped façade: the same CRUD API, but every call runs on
 * the transaction's dedicated client.
 * @param {PoolClient} client
 */
const makeTransactional = (client) => ({
  query: (/** @type {string} */ text, /** @type {any[]} */ params = []) => query(text, params, client),
  insert: (/** @type {string} */ table, /** @type {Record<string, any>} */ data, /** @type {any} */ opts = {}) =>
    insert(table, data, { ...opts, executor: client }),
  insertMany: (/** @type {string} */ table, /** @type {Record<string, any>[]} */ rows, /** @type {any} */ opts = {}) =>
    insertMany(table, rows, { ...opts, executor: client }),
  select: (/** @type {string} */ table, /** @type {any} */ opts = {}) => select(table, { ...opts, executor: client }),
  findOne: (/** @type {string} */ table, /** @type {any} */ opts = {}) => findOne(table, { ...opts, executor: client }),
  count: (/** @type {string} */ table, /** @type {any} */ opts = {}) => count(table, { ...opts, executor: client }),
  exists: (/** @type {string} */ table, /** @type {Record<string, any>} */ where, /** @type {any} */ opts = {}) =>
    exists(table, where, { ...opts, executor: client }),
  update: (
    /** @type {string} */ table,
    /** @type {Record<string, any>} */ data,
    /** @type {Record<string, any>} */ where,
    /** @type {any} */ opts = {}
  ) => update(table, data, where, { ...opts, executor: client }),
  remove: (
    /** @type {string} */ table,
    /** @type {Record<string, any>} */ where,
    /** @type {any} */ opts = {}
  ) => remove(table, where, { ...opts, executor: client }),
});

/**
 * Run a set of operations inside a single transaction. The callback
 * receives a transactional façade (`tx`) exposing the same helpers.
 * Commits when the callback resolves, rolls back if it throws.
 * @template T
 * @param {(tx: ReturnType<typeof makeTransactional>) => Promise<T>} callback
 * @returns {Promise<T>}
 */
const transaction = async (callback) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await callback(makeTransactional(client));
    await client.query('COMMIT');
    return result;
  } catch (err) {
    try {
      await client.query('ROLLBACK');
    } catch (_) {
      /* ignore rollback failure; surface the original error below. */
    }
    throw err;
  } finally {
    client.release();
  }
};

/**
 * Check out a raw client for advanced use. The caller MUST release it.
 * @returns {Promise<PoolClient>}
 */
const getClient = () => pool.connect();

/** Close the pool (call on graceful shutdown). @returns {Promise<void>} */
const close = () => pool.end();

module.exports = {
  pool,
  query,
  insert,
  insertMany,
  select,
  findOne,
  count,
  exists,
  update,
  remove,
  transaction,
  getClient,
  close,
};
