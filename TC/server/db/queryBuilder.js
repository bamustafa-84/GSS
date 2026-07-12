// @ts-check
'use strict';

/**
 * GSS · SQL query builder helpers
 * ------------------------------------------------------------------
 * Small, dependency-free helpers that turn dynamic input (table names,
 * columns, conditions, ordering, pagination) into parameterized SQL.
 *
 * SECURITY: values are ALWAYS passed as bound parameters ($1, $2, …),
 * never interpolated into the SQL text. Identifiers (table/column names)
 * cannot be parameterized by PostgreSQL, so they are validated and safely
 * double-quoted instead. Only pass identifiers your application controls.
 */

/** Operators that map a condition object to an SQL comparison. */
const OPERATORS = {
  eq: '=',
  ne: '<>',
  gt: '>',
  gte: '>=',
  lt: '<',
  lte: '<=',
  like: 'LIKE',
  ilike: 'ILIKE',
};

/**
 * Validate and quote a single SQL identifier (table or column name).
 * Supports optional schema/table qualification: "schema.table" → "schema"."table".
 * @param {string} identifier
 * @returns {string}
 */
const quoteIdentifier = (identifier) => {
  if (typeof identifier !== 'string' || identifier.trim() === '') {
    throw new TypeError(`Invalid SQL identifier: ${JSON.stringify(identifier)}`);
  }
  return identifier
    .split('.')
    .map((part) => {
      const name = part.trim();
      // Allow letters, digits, underscores and the * wildcard (for COUNT(*)/select-all).
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name) && name !== '*') {
        throw new TypeError(`Unsafe SQL identifier segment: ${JSON.stringify(part)}`);
      }
      return name === '*' ? '*' : `"${name}"`;
    })
    .join('.');
};

/**
 * Build a comma-separated, safely-quoted column list.
 * @param {string | string[] | undefined} columns
 * @returns {string}
 */
const buildColumnList = (columns) => {
  if (!columns || columns === '*' || (Array.isArray(columns) && columns.length === 0)) {
    return '*';
  }
  const list = Array.isArray(columns) ? columns : [columns];
  return list.map(quoteIdentifier).join(', ');
};

/**
 * @typedef {Object} WhereResult
 * @property {string} clause  The `WHERE ...` fragment (empty string if no conditions).
 * @property {any[]}  params  The bound parameter values.
 * @property {number} nextIndex  The next available `$n` placeholder index.
 */

/**
 * Build a parameterized WHERE clause from a conditions object.
 *
 * Each entry may be:
 *   - a primitive           → `"col" = $n`
 *   - null                  → `"col" IS NULL`
 *   - an array              → `"col" IN ($a, $b, …)`
 *   - an operator object    → `{ gte: 18 }`, `{ like: '%x%' }`,
 *                             `{ in: [...] }`, `{ notIn: [...] }`,
 *                             `{ between: [lo, hi] }`, `{ isNull: true }`
 *
 * @param {Record<string, any> | undefined} conditions
 * @param {number} [startIndex=1]  First `$n` placeholder number to use.
 * @returns {WhereResult}
 */
const buildWhere = (conditions, startIndex = 1) => {
  const params = [];
  let index = startIndex;

  if (!conditions || typeof conditions !== 'object' || Object.keys(conditions).length === 0) {
    return { clause: '', params, nextIndex: index };
  }

  const parts = [];

  for (const [column, raw] of Object.entries(conditions)) {
    const col = quoteIdentifier(column);

    // Explicit NULL.
    if (raw === null) {
      parts.push(`${col} IS NULL`);
      continue;
    }

    // Array shorthand → IN (...).
    if (Array.isArray(raw)) {
      if (raw.length === 0) {
        // An empty IN list can never match; keep the query valid.
        parts.push('FALSE');
        continue;
      }
      const placeholders = raw.map(() => `$${index++}`);
      params.push(...raw);
      parts.push(`${col} IN (${placeholders.join(', ')})`);
      continue;
    }

    // Operator object.
    if (typeof raw === 'object') {
      for (const [op, value] of Object.entries(raw)) {
        if (op === 'isNull') {
          parts.push(`${col} ${value ? 'IS NULL' : 'IS NOT NULL'}`);
          continue;
        }
        if (op === 'in' || op === 'notIn') {
          const values = Array.isArray(value) ? value : [value];
          if (values.length === 0) {
            parts.push(op === 'in' ? 'FALSE' : 'TRUE');
            continue;
          }
          const placeholders = values.map(() => `$${index++}`);
          params.push(...values);
          parts.push(`${col} ${op === 'in' ? 'IN' : 'NOT IN'} (${placeholders.join(', ')})`);
          continue;
        }
        if (op === 'between') {
          if (!Array.isArray(value) || value.length !== 2) {
            throw new TypeError(`"between" on ${column} requires a [low, high] array.`);
          }
          const lo = `$${index++}`;
          const hi = `$${index++}`;
          params.push(value[0], value[1]);
          parts.push(`${col} BETWEEN ${lo} AND ${hi}`);
          continue;
        }
        if (!Object.prototype.hasOwnProperty.call(OPERATORS, op)) {
          throw new TypeError(`Unsupported operator "${op}" on column ${column}.`);
        }
        parts.push(`${col} ${OPERATORS[op]} $${index++}`);
        params.push(value);
      }
      continue;
    }

    // Primitive → equality.
    parts.push(`${col} = $${index++}`);
    params.push(raw);
  }

  return { clause: `WHERE ${parts.join(' AND ')}`, params, nextIndex: index };
};

/**
 * Build an ORDER BY clause.
 * Accepts: 'col', ['col1', 'col2'], { col: 'ASC' }, or [{ column, direction }].
 * @param {string | string[] | Record<string, string> | Array<{column: string, direction?: string}> | undefined} orderBy
 * @returns {string}
 */
const buildOrderBy = (orderBy) => {
  if (!orderBy) return '';

  /** @type {string[]} */
  const terms = [];
  const dir = (/** @type {string | undefined} */ d) =>
    String(d).toUpperCase() === 'DESC' ? 'DESC' : 'ASC';

  if (typeof orderBy === 'string') {
    terms.push(`${quoteIdentifier(orderBy)} ASC`);
  } else if (Array.isArray(orderBy)) {
    for (const item of orderBy) {
      if (typeof item === 'string') {
        terms.push(`${quoteIdentifier(item)} ASC`);
      } else if (item && typeof item === 'object') {
        terms.push(`${quoteIdentifier(item.column)} ${dir(item.direction)}`);
      }
    }
  } else if (typeof orderBy === 'object') {
    for (const [column, direction] of Object.entries(orderBy)) {
      terms.push(`${quoteIdentifier(column)} ${dir(direction)}`);
    }
  }

  return terms.length ? `ORDER BY ${terms.join(', ')}` : '';
};

/**
 * Build a LIMIT / OFFSET clause using bound parameters.
 * @param {number | undefined} limit
 * @param {number | undefined} offset
 * @param {number} startIndex  First `$n` placeholder number to use.
 * @returns {{ clause: string, params: number[], nextIndex: number }}
 */
const buildPagination = (limit, offset, startIndex) => {
  const params = [];
  let index = startIndex;
  let clause = '';

  if (limit != null) {
    if (!Number.isInteger(limit) || limit < 0) throw new TypeError('limit must be a non-negative integer.');
    clause += ` LIMIT $${index++}`;
    params.push(limit);
  }
  if (offset != null) {
    if (!Number.isInteger(offset) || offset < 0) throw new TypeError('offset must be a non-negative integer.');
    clause += ` OFFSET $${index++}`;
    params.push(offset);
  }

  return { clause: clause.trim(), params, nextIndex: index };
};

module.exports = {
  OPERATORS,
  quoteIdentifier,
  buildColumnList,
  buildWhere,
  buildOrderBy,
  buildPagination,
};
