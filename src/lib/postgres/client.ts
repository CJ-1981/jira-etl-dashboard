/**
 * PostgreSQL Client Library
 *
 * Handles connections to external PostgreSQL servers for direct KPI data export.
 * Creates the target table automatically if it doesn't exist, and supports
 * upsert (INSERT ... ON CONFLICT) for idempotent re-runs.
 */

import pg from 'pg';

const { Pool } = pg;

export interface PostgresConnectionConfig {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  sslMode?: string;
}

export interface PostgresTableConfig {
  schemaName: string;
  tableName: string;
}

export interface KpiDataRow {
  kpi_id: string;
  kpi_name: string;
  value: number;
  unit: string;
  calculated_at: string;
  period_start: string;
  period_end: string;
  region: string;
  priority: string | null;
  status: string | null;
  is_detail?: boolean;
}

/**
 * Test a PostgreSQL connection
 */
export async function testPostgresConnection(
  config: PostgresConnectionConfig
): Promise<{ success: boolean; version?: string; databases?: string[]; schemas?: string[]; error?: string }> {
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.sslMode === 'require' || config.sslMode === 'verify-ca' || config.sslMode === 'verify-full'
      ? { rejectUnauthorized: config.sslMode === 'verify-full' }
      : false,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 5000,
  });

  try {
    const client = await pool.connect();
    const versionResult = await client.query('SELECT version()');
    const version = versionResult.rows[0]?.version || 'Unknown';

    // List databases
    const dbResult = await client.query(
      "SELECT datname FROM pg_database WHERE datistemplate = false ORDER BY datname"
    );
    const databases = dbResult.rows.map((r) => r.datname);

    // List non-system schemas
    const schemaResult = await client.query(
      "SELECT schema_name FROM information_schema.schemata WHERE schema_name NOT IN ('pg_catalog', 'information_schema', 'pg_toast') ORDER BY schema_name"
    );
    const schemas = schemaResult.rows.map((r) => r.schema_name);

    await client.release();
    await pool.end();

    return { success: true, version, databases, schemas };
  } catch (error) {
    await pool.end().catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown connection error',
    };
  }
}

/**
 * Export KPI data to PostgreSQL table
 * Creates the table and indexes automatically if they don't exist.
 * Uses upsert for idempotent re-runs.
 */
export async function exportToPostgres(
  config: PostgresConnectionConfig,
  tableConfig: PostgresTableConfig,
  data: KpiDataRow[],
  options: {
    createSchema?: boolean;
    truncate?: boolean;
  } = {}
): Promise<{ success: boolean; rowsInserted: number; error?: string; tableInfo?: { schema: string; table: string; totalRows: number } }> {
  const { createSchema = false, truncate = false } = options;

  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.sslMode === 'require' || config.sslMode === 'verify-ca' || config.sslMode === 'verify-full'
      ? { rejectUnauthorized: config.sslMode === 'verify-full' }
      : false,
    connectionTimeoutMillis: 15000,
  });

  try {
    const client = await pool.connect();
    const schema = tableConfig.schemaName;
    const table = tableConfig.tableName;

    // Create schema if requested
    if (createSchema) {
      await client.query(`CREATE SCHEMA IF NOT EXISTS "${schema}"`);
    }

    // Verify schema exists
    const schemaCheck = await client.query(
      "SELECT 1 FROM information_schema.schemata WHERE schema_name = $1",
      [schema]
    );
    if (schemaCheck.rows.length === 0) {
      await client.release();
      await pool.end();
      return {
        success: false,
        rowsInserted: 0,
        error: `Schema "${schema}" does not exist. Enable "Create schema" or create it manually.`,
      };
    }

    // Create table with IF NOT EXISTS
    await client.query(`
      CREATE TABLE IF NOT EXISTS "${schema}"."${table}" (
        id BIGSERIAL PRIMARY KEY,
        kpi_id TEXT NOT NULL,
        kpi_name TEXT NOT NULL,
        value DOUBLE PRECISION NOT NULL,
        unit TEXT NOT NULL DEFAULT '',
        calculated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        period_start TIMESTAMPTZ NOT NULL,
        period_end TIMESTAMPTZ NOT NULL,
        region TEXT NOT NULL DEFAULT '',
        priority TEXT,
        status TEXT,
        is_detail BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `);

    // Create unique constraint for upsert (idempotent re-runs)
    try {
      await client.query(`
        ALTER TABLE "${schema}"."${table}"
        ADD CONSTRAINT uq_kpi_period UNIQUE (kpi_id, kpi_name, period_start, period_end, region);
      `);
    } catch {
      // Constraint may already exist - that's fine
    }

    // Truncate if requested
    if (truncate) {
      await client.query(`TRUNCATE TABLE "${schema}"."${table}"`);
    }

    // Upsert data row by row
    let rowsInserted = 0;
    const upsertSql = `
      INSERT INTO "${schema}"."${table}"
        (kpi_id, kpi_name, value, unit, calculated_at, period_start, period_end, region, priority, status, is_detail)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      ON CONFLICT (kpi_id, kpi_name, period_start, period_end, region)
      DO UPDATE SET
        value = EXCLUDED.value,
        unit = EXCLUDED.unit,
        calculated_at = EXCLUDED.calculated_at,
        priority = EXCLUDED.priority,
        status = EXCLUDED.status,
        is_detail = EXCLUDED.is_detail,
        created_at = NOW();
    `;

    for (const row of data) {
      await client.query(upsertSql, [
        row.kpi_id,
        row.kpi_name,
        row.value,
        row.unit,
        row.calculated_at,
        row.period_start,
        row.period_end,
        row.region,
        row.priority,
        row.status,
        row.is_detail || false,
      ]);
      rowsInserted++;
    }

    // Get total row count
    const countResult = await client.query(
      `SELECT COUNT(*) as total FROM "${schema}"."${table}"`
    );
    const totalRows = parseInt(countResult.rows[0]?.total || '0', 10);

    await client.release();
    await pool.end();

    return {
      success: true,
      rowsInserted,
      tableInfo: { schema, table, totalRows },
    };
  } catch (error) {
    await pool.end().catch(() => {});
    return {
      success: false,
      rowsInserted: 0,
      error: error instanceof Error ? error.message : 'Unknown error during PostgreSQL export',
    };
  }
}

/**
 * List tables in a PostgreSQL schema
 */
export async function listPostgresTables(
  config: PostgresConnectionConfig,
  schemaName: string = 'public'
): Promise<{ success: boolean; tables?: string[]; error?: string }> {
  const pool = new Pool({
    host: config.host,
    port: config.port,
    database: config.database,
    user: config.username,
    password: config.password,
    ssl: config.sslMode === 'require' || config.sslMode === 'verify-full'
      ? { rejectUnauthorized: config.sslMode === 'verify-full' }
      : false,
    connectionTimeoutMillis: 10000,
  });

  try {
    const client = await pool.connect();
    const result = await client.query(
      `SELECT table_name FROM information_schema.tables
       WHERE table_schema = $1 AND table_type = 'BASE TABLE'
       ORDER BY table_name`,
      [schemaName]
    );
    await client.release();
    await pool.end();
    return { success: true, tables: result.rows.map((r) => r.table_name) };
  } catch (error) {
    await pool.end().catch(() => {});
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
