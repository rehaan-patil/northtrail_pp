import { randomUUID } from 'node:crypto';
import { mkdtemp, writeFile, readFile, cp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, relative, resolve } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  connectDatabase,
  migrate,
  DecisionRepository,
  type Database,
} from '../packages/db/src/index.js';
import { createDecision } from '../packages/domain/src/index.js';
import { decisionFixture } from './fixtures.js';

it('initializes a nested local database on first run and preserves it on reopen', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'northtrail-first-run-'));
  const local = relative(resolve(tmpdir()), resolve(directory));
  if (local.startsWith('..') || !local.startsWith('northtrail-first-run-'))
    throw new Error('Unexpected test cleanup target');
  const path = join(directory, 'missing-parent', 'database');
  let database: Database | undefined;
  try {
    database = await connectDatabase({ driver: 'pglite', path });
    expect(await migrate(database)).toEqual(['0001_ledger.sql', '0002_decision_lineage.sql']);
    await database.close();
    database = undefined;
    database = await connectDatabase({ driver: 'pglite', path });
    expect(await migrate(database)).toEqual([]);
    expect((await database.query('SELECT name FROM schema_migrations')).rows).toHaveLength(2);
  } finally {
    await database?.close();
    await rm(directory, { recursive: true });
  }
});

describe('durable decision ledger', () => {
  let db: Database;
  let repository: DecisionRepository;
  const tenant = randomUUID();
  const otherTenant = randomUUID();
  beforeAll(async () => {
    db = await connectDatabase(
      process.env.TEST_DATABASE_URL
        ? { driver: 'postgres', url: process.env.TEST_DATABASE_URL }
        : { driver: 'pglite' },
    );
    expect(await migrate(db)).toEqual(['0001_ledger.sql', '0002_decision_lineage.sql']);
    repository = new DecisionRepository(db);
    await db.query('INSERT INTO tenants(id, owner) VALUES ($1,$2),($3,$4)', [
      tenant,
      `0x${'1'.repeat(40)}`,
      otherTenant,
      `0x${'2'.repeat(40)}`,
    ]);
  });
  afterAll(async () => {
    await db?.close();
  });

  it('applies migrations once and rejects changed checksums without partial writes', async () => {
    expect(await migrate(db)).toEqual([]);
    const directory = await mkdtemp(join(tmpdir(), 'northtrail-migrations-'));
    try {
      await cp(new URL('../packages/db/migrations/', import.meta.url), directory, {
        recursive: true,
      });
      const file = join(directory, '0001_ledger.sql');
      await writeFile(file, `${await readFile(file, 'utf8')}\n-- altered historical migration`);
      await expect(migrate(db, directory)).rejects.toThrow('checksum changed');
      expect((await db.query('SELECT name FROM schema_migrations')).rows).toHaveLength(2);
    } finally {
      await rm(directory, { recursive: true });
    }
  });

  it('persists exact raw values, isolates tenants, and allows idempotent retries', async () => {
    const record = await createDecision({ ...decisionFixture(), decisionId: randomUUID() });
    const key = randomUUID();
    expect(await repository.save(tenant, key, record)).toEqual(record);
    expect(await repository.save(tenant, key, record)).toEqual(record);
    expect(await repository.get(tenant, record.payload.decisionId, 1)).toEqual(record);
    expect(await repository.get(otherTenant, record.payload.decisionId, 1)).toBeNull();
    const changed = await createDecision({ ...record.payload, limitations: ['Changed display'] });
    await expect(repository.save(tenant, key, changed)).rejects.toMatchObject({ code: 'CONFLICT' });
    await expect(repository.save(tenant, randomUUID(), changed)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });

  it('rejects tampered evidence and invalid idempotency keys', async () => {
    const record = await createDecision({ ...decisionFixture(), decisionId: randomUUID() });
    await expect(
      repository.save(tenant, randomUUID(), { ...record, digest: `0x${'0'.repeat(64)}` }),
    ).rejects.toMatchObject({ code: 'INVALID_INPUT' });
    await expect(repository.save(tenant, 'short', record)).rejects.toMatchObject({
      code: 'INVALID_INPUT',
    });
  });

  it('links revisions to the same decision, tenant, and immediately preceding revision', async () => {
    const first = await createDecision({ ...decisionFixture(), decisionId: randomUUID() });
    await repository.save(tenant, randomUUID(), first);
    for (const payload of [
      { ...first.payload, decisionId: randomUUID(), revision: 2, previousDigest: first.digest },
      { ...first.payload, revision: 3, previousDigest: first.digest },
    ]) {
      await expect(
        repository.save(tenant, randomUUID(), await createDecision(payload)),
      ).rejects.toMatchObject({ code: 'CONFLICT' });
    }
    const second = await createDecision({
      ...first.payload,
      revision: 2,
      previousDigest: first.digest,
    });
    await expect(repository.save(otherTenant, randomUUID(), second)).rejects.toMatchObject({
      code: 'CONFLICT',
    });
    expect(await repository.save(tenant, randomUUID(), second)).toEqual(second);
    expect(
      await repository.save(
        tenant,
        randomUUID(),
        await createDecision({ ...first.payload, revision: 3, previousDigest: second.digest }),
      ),
    ).toBeDefined();
  });

  it('permits one writer for a revision under concurrent conflicting requests', async () => {
    const first = await createDecision({ ...decisionFixture(), decisionId: randomUUID() });
    await repository.save(tenant, randomUUID(), first);
    const variants = await Promise.all(
      ['one', 'two'].map((label) =>
        createDecision({
          ...first.payload,
          revision: 2,
          previousDigest: first.digest,
          limitations: [label],
        }),
      ),
    );
    const outcomes = await Promise.allSettled(
      variants.map((record) => repository.save(tenant, randomUUID(), record)),
    );
    expect(outcomes.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === 'rejected')).toHaveLength(1);
  });

  it('rejects SQL evidence mutation and rolls back failed transactions', async () => {
    await expect(db.query('UPDATE decisions SET revision = revision')).rejects.toThrow(
      'append-only',
    );
    await expect(db.query('DELETE FROM decisions')).rejects.toThrow('append-only');
    const id = randomUUID();
    await expect(
      db.transaction(async (tx) => {
        await tx.query('INSERT INTO tenants(id, owner) VALUES ($1,$2)', [
          id,
          `0x${'3'.repeat(40)}`,
        ]);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect((await db.query('SELECT id FROM tenants WHERE id = $1', [id])).rows).toHaveLength(0);
  });
});
