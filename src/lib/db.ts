import mysql, { Pool, PoolConnection, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { env } from './env';

// Server-only MySQL access. Never import this from a client component.
// Dates come back as ISO strings ("2026-10-08T16:01:00.000Z") and TINYINT(1) as true/false,
// so rows can go straight into JSON responses.

type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
export type Db = Pool | PoolConnection;

const g = globalThis as unknown as { __nuvePool?: Pool };

export function pool(): Pool {
  if (!g.__nuvePool) {
    g.__nuvePool = mysql.createPool({
      uri: env.databaseUrl(),
      connectionLimit: 10,
      timezone: 'Z',
      decimalNumbers: true,
      dateStrings: false,
      typeCast(field, next) {
        if (field.type === 'DATETIME' || field.type === 'TIMESTAMP') {
          const v = field.string();
          return v === null ? null : new Date(v.replace(' ', 'T') + 'Z').toISOString();
        }
        if (field.type === 'TINY' && field.length === 1) {
          const v = field.string();
          return v === null ? null : v === '1';
        }
        return next();
      },
    });
    g.__nuvePool.on('connection', (c) => { c.query("SET time_zone = '+00:00'"); });
  }
  return g.__nuvePool;
}

/** Rows from a SELECT. */
export async function rows<T = Row>(sql: string, params: unknown[] = [], conn: Db = pool()): Promise<T[]> {
  const [r] = await conn.query<RowDataPacket[]>(sql, params);
  return r as T[];
}

/** First row of a SELECT, or null. */
export async function one<T = Row>(sql: string, params: unknown[] = [], conn: Db = pool()): Promise<T | null> {
  return (await rows<T>(sql, params, conn))[0] ?? null;
}

/** INSERT / UPDATE / DELETE. Returns how many rows matched, so conditional updates can tell if they won. */
export async function exec(sql: string, params: unknown[] = [], conn: Db = pool()): Promise<number> {
  const [r] = await conn.query<ResultSetHeader>(sql, params);
  return r.affectedRows;
}

/** Runs fn inside a transaction; rolls back if it throws. */
export async function tx<T>(fn: (c: PoolConnection) => Promise<T>): Promise<T> {
  const c = await pool().getConnection();
  try {
    await c.beginTransaction();
    const out = await fn(c);
    await c.commit();
    return out;
  } catch (e) {
    await c.rollback().catch(() => {});
    throw e;
  } finally {
    c.release();
  }
}

/** Builds "a = ?, b = ?" plus values from an object, for UPDATE ... SET. JSON objects are stored as JSON text. */
export function setClause(values: Row): { sql: string; params: unknown[] } {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  return {
    sql: keys.map((k) => `\`${k}\` = ?`).join(', '),
    params: keys.map((k) => toParam(values[k])),
  };
}

/** INSERT INTO table (...) VALUES (...) from an object. */
export async function insert(table: string, values: Row, conn: Db = pool()): Promise<number> {
  const keys = Object.keys(values).filter((k) => values[k] !== undefined);
  const sql = `INSERT INTO \`${table}\` (${keys.map((k) => `\`${k}\``).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`;
  return exec(sql, keys.map((k) => toParam(values[k])), conn);
}

function toParam(v: unknown): unknown {
  if (v === undefined) return null;
  if (v instanceof Date || v === null || typeof v !== 'object') return v;
  return JSON.stringify(v);
}

/** Current time as a Date, for writing timestamps (stored as UTC). */
export const now = () => new Date();

export function mediaUrl(path?: string | null): string {
  if (!path) return '';
  if (/^https?:\/\//.test(path) || path.startsWith('/')) return path;
  return `/media/${path}`;
}
