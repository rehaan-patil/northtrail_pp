import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import pg from 'pg';
import {
  NorthtrailError,
  DecisionRecordSchema,
  verifyDecision,
  type DecisionRecord,
} from '@northtrail/domain';

export interface Sql {
  query<T extends Record<string, unknown> = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<void>;
}
export interface Database extends Sql {
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
  driver: 'pglite' | 'postgres';
}

function sqlAdapter(client: Pick<pg.PoolClient, 'query'>): Sql {
  return {
    async query<T extends Record<string, unknown>>(sql: string, values: unknown[] = []) {
      const result = await client.query<T>(sql, values);
      return { rows: result.rows };
    },
    async exec(sql) {
      await client.query(sql);
    },
  };
}

export async function connectDatabase(options: {
  driver: 'pglite' | 'postgres';
  path?: string;
  url?: string;
}): Promise<Database> {
  if (options.driver === 'pglite') {
    // PGlite creates its database directory, but not missing parent directories on first run.
    if (options.path && !options.path.includes('://'))
      await mkdir(dirname(resolve(options.path)), { recursive: true });
    const client = new PGlite(options.path ?? 'memory://');
    await client.waitReady;
    return {
      driver: 'pglite',
      async query<T extends Record<string, unknown>>(sql: string, values: unknown[] = []) {
        return client.query<T>(sql, values);
      },
      async exec(sql) {
        await client.exec(sql);
      },
      async transaction<T>(fn: (tx: Sql) => Promise<T>) {
        return client.transaction(async (tx) =>
          fn({
            async query<R extends Record<string, unknown>>(sql: string, values: unknown[] = []) {
              return tx.query<R>(sql, values);
            },
            async exec(sql) {
              await tx.exec(sql);
            },
          }),
        );
      },
      async close() {
        await client.close();
      },
    };
  }
  if (!options.url) throw new Error('DATABASE_URL is required.');
  const pool = new pg.Pool({
    connectionString: options.url,
    max: 10,
    connectionTimeoutMillis: 5_000,
    statement_timeout: 10_000,
  });
  const adapter = sqlAdapter(pool);
  await adapter.query('SELECT 1');
  return {
    driver: 'postgres',
    ...adapter,
    async transaction<T>(fn: (tx: Sql) => Promise<T>) {
      const connection = await pool.connect();
      try {
        await connection.query('BEGIN');
        const result = await fn(sqlAdapter(connection));
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
  };
}

export async function migrate(
  db: Database,
  directory = fileURLToPath(new URL('../migrations/', import.meta.url)),
): Promise<string[]> {
  const files = (await readdir(directory))
    .filter((name) => /^\d{4}_[a-z_]+\.sql$/.test(name))
    .sort();
  return db.transaction(async (tx) => {
    if (db.driver === 'postgres') await tx.query('SELECT pg_advisory_xact_lock(74193001)');
    await tx.exec(
      'CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())',
    );
    const applied: string[] = [];
    for (const name of files) {
      const sql = await readFile(join(directory, name), 'utf8');
      const checksum = createHash('sha256').update(sql).digest('hex');
      const existing = await tx.query<{ checksum: string }>(
        'SELECT checksum FROM schema_migrations WHERE name = $1',
        [name],
      );
      if (existing.rows[0]) {
        if (existing.rows[0].checksum !== checksum)
          throw new Error(`Migration checksum changed: ${name}`);
        continue;
      }
      await tx.exec(sql);
      await tx.query('INSERT INTO schema_migrations(name, checksum) VALUES ($1, $2)', [
        name,
        checksum,
      ]);
      applied.push(name);
    }
    return applied;
  });
}

export async function assertDatabaseReady(
  db: Database,
  directory = fileURLToPath(new URL('../migrations/', import.meta.url)),
): Promise<void> {
  const files = (await readdir(directory))
    .filter((name) => /^\d{4}_[a-z_]+\.sql$/.test(name))
    .sort();
  if (files.length === 0) throw new Error('No migrations available.');
  const applied = await db.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations',
  );
  for (const name of files) {
    const checksum = createHash('sha256')
      .update(await readFile(join(directory, name), 'utf8'))
      .digest('hex');
    if (!applied.rows.some((row) => row.name === name && row.checksum === checksum)) {
      throw new Error('Database migrations are missing or changed.');
    }
  }
}

export class DecisionRepository {
  constructor(private readonly db: Database) {}

  async save(tenantId: string, key: string, input: DecisionRecord): Promise<DecisionRecord> {
    const record = DecisionRecordSchema.parse(input);
    if (!(await verifyDecision(record)))
      throw new NorthtrailError('INVALID_INPUT', 'Decision digest does not match the payload.');
    if (!/^[A-Za-z0-9_-]{16,128}$/.test(key))
      throw new NorthtrailError('INVALID_INPUT', 'Invalid idempotency key.');
    return this.db
      .transaction(async (tx) => {
        const result = await tx.query<{ record: DecisionRecord; digest: string }>(
          `INSERT INTO decisions (tenant_id, decision_id, revision, digest, previous_digest, idempotency_key, record)
         VALUES ($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (tenant_id, idempotency_key) DO NOTHING RETURNING record, digest`,
          [
            tenantId,
            record.payload.decisionId,
            record.payload.revision,
            record.digest,
            record.payload.previousDigest,
            key,
            JSON.stringify(record),
          ],
        );
        const stored =
          result.rows[0] ??
          (
            await tx.query<{ record: DecisionRecord; digest: string }>(
              'SELECT record, digest FROM decisions WHERE tenant_id = $1 AND idempotency_key = $2',
              [tenantId, key],
            )
          ).rows[0];
        if (!stored || stored.digest !== record.digest)
          throw new NorthtrailError(
            'CONFLICT',
            'Idempotency key is already bound to different evidence.',
            409,
          );
        return DecisionRecordSchema.parse(stored.record);
      })
      .catch((error: unknown) => {
        const code = (error as { code?: string } | null)?.code;
        if (code === '23505' || code === '23503' || code === '23514') {
          throw new NorthtrailError(
            'CONFLICT',
            'Decision revision or predecessor conflicts with stored evidence.',
            409,
            'Read the existing decision and append the next revision.',
          );
        }
        throw error;
      });
  }

  async get(
    tenantId: string,
    decisionId: string,
    revision: number,
  ): Promise<DecisionRecord | null> {
    const result = await this.db.query<{ record: DecisionRecord }>(
      'SELECT record FROM decisions WHERE tenant_id = $1 AND decision_id = $2 AND revision = $3',
      [tenantId, decisionId, revision],
    );
    return result.rows[0] ? DecisionRecordSchema.parse(result.rows[0].record) : null;
  }
}
