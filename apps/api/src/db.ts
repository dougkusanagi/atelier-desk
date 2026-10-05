import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import type { Config } from './config';
export type QueryResult<T> = { rows: T[]; rowCount: number };
export interface Database {
  query<T = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<T>>;
  transaction<T>(fn: (database: Database) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
export async function createDatabase(settings: Config): Promise<Database> {
  await mkdir(settings.dataDir, { recursive: true });
  const migration =
    (await readFile(new URL('./migration.sql', import.meta.url), 'utf8')) +
    '\n' +
    (await readFile(new URL('./002-sharing.sql', import.meta.url), 'utf8')) +
    '\n' +
    (await readFile(new URL('./003-jobs.sql', import.meta.url), 'utf8'));
  if (settings.databaseUrl) {
    const pool = new pg.Pool({ connectionString: settings.databaseUrl, max: 10 });
    await pool.query(migration);
    const wrap = (client: pg.Pool | pg.PoolClient): Database => ({
      async query<T>(sql: string, values: unknown[] = []) {
        const result = await client.query(sql, values);
        return { rows: result.rows as T[], rowCount: result.rowCount ?? 0 };
      },
      async transaction<T>(fn: (database: Database) => Promise<T>) {
        const connection = await pool.connect();
        try {
          await connection.query('BEGIN');
          const result = await fn(wrap(connection));
          await connection.query('COMMIT');
          return result;
        } catch (error) {
          await connection.query('ROLLBACK');
          throw error;
        } finally {
          connection.release();
        }
      },
      async close() {
        await pool.end();
      },
    });
    return wrap(pool);
  }
  const client = new PGlite(path.join(settings.dataDir, 'postgres'));
  await client.exec(migration);
  const wrap = (executor: {
    query<T>(query: string, params?: unknown[]): Promise<{ rows: T[]; affectedRows?: number }>;
  }): Database => ({
    async query<T>(sql: string, values: unknown[] = []) {
      const result = await executor.query<T>(sql, values);
      return { rows: result.rows, rowCount: result.affectedRows ?? result.rows.length };
    },
    async transaction<T>(fn: (database: Database) => Promise<T>) {
      return client.transaction(async (tx) => fn(wrap(tx)));
    },
    async close() {
      await client.close();
    },
  });
  return wrap(client);
}
