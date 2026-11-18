import { MIGRATIONS, runDatabaseMigrations } from '../src/db/migrations';

describe('Database Migration Framework', () => {
  let executedStatements: { sql: string; params: any[] }[] = [];
  let appliedVersionsInDb: number[] = [];

  const mockExecuteSql = async (sql: string, params: any[] = []): Promise<any> => {
    executedStatements.push({ sql, params });

    const cleanSql = sql.trim().toUpperCase();

    // Mock schema_migrations table existence query
    if (cleanSql.startsWith('CREATE TABLE IF NOT EXISTS SCHEMA_MIGRATIONS')) {
      return { rows: [] };
    }

    // Mock query for applied versions
    if (cleanSql.startsWith('SELECT VERSION FROM SCHEMA_MIGRATIONS')) {
      return {
        rows: {
          length: appliedVersionsInDb.length,
          item: (i: number) => ({ version: appliedVersionsInDb[i] }),
        },
      };
    }

    // Mock inserting applied version
    if (cleanSql.startsWith('INSERT INTO SCHEMA_MIGRATIONS')) {
      if (params.length > 0 && typeof params[0] === 'number') {
        appliedVersionsInDb.push(params[0]);
      }
      return { rowsAffected: 1 };
    }

    return { rows: [], rowsAffected: 0 };
  };

  beforeEach(() => {
    executedStatements = [];
    appliedVersionsInDb = [];
  });

  it('contains valid defined migrations in sequential ascending order', () => {
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(4);
    for (let i = 0; i < MIGRATIONS.length; i++) {
      expect(MIGRATIONS[i].version).toBe(i + 1);
      expect(MIGRATIONS[i].name).toBeTruthy();
      expect(typeof MIGRATIONS[i].up).toBe('function');
    }
  });

  it('runs all unapplied migrations from fresh install', async () => {
    const result = await runDatabaseMigrations(mockExecuteSql);

    expect(result.applied).toBe(MIGRATIONS.length);
    expect(result.currentVersion).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    expect(appliedVersionsInDb.length).toBe(MIGRATIONS.length);

    // Verify key migration statements executed
    const allSql = executedStatements.map((s) => s.sql.toUpperCase()).join('\n');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS ORGANIZATION');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS PRODUCTS');
    expect(allSql).toContain('CREATE TABLE IF NOT EXISTS INVOICES');
    expect(allSql).toContain('CREATE INDEX IF NOT EXISTS IDX_INVOICES_DATE');
    expect(allSql).toContain('CREATE INDEX IF NOT EXISTS IDX_INVOICES_CUSTOMER');
  });

  it('is idempotent and skips already applied migrations', async () => {
    // Simulate v1, v2 already applied
    appliedVersionsInDb = [1, 2];

    const result = await runDatabaseMigrations(mockExecuteSql);

    expect(result.applied).toBe(MIGRATIONS.length - 2);
    expect(result.currentVersion).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
    expect(appliedVersionsInDb).toContain(3);
    expect(appliedVersionsInDb).toContain(4);
  });

  it('does nothing when all migrations are already up to date', async () => {
    appliedVersionsInDb = MIGRATIONS.map((m) => m.version);

    const result = await runDatabaseMigrations(mockExecuteSql);

    expect(result.applied).toBe(0);
    expect(result.currentVersion).toBe(MIGRATIONS[MIGRATIONS.length - 1].version);
  });
});
