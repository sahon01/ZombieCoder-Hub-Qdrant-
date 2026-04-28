import { Pool, PoolConfig } from 'pg';
import { Logger } from '../utils/logger';

const logger = new Logger();

let pool: Pool | null = null;

export type PostgresConnectionOptions = PoolConfig;

export function isPostgresEnabled(): boolean {
  const url = String(process.env.PG_CONNECTION_STRING || '').trim();
  const host = String(process.env.PG_HOST || '').trim();
  return Boolean(url || host);
}

export function getPostgresPool(): Pool {
  if (!pool) {
    throw new Error('Postgres pool not initialized. Call initializePostgres() first.');
  }
  return pool;
}

export async function initializePostgres(): Promise<Pool> {
  if (pool) return pool;

  const connectionString = String(process.env.PG_CONNECTION_STRING || '').trim();

  const sslEnv = String(process.env.PG_SSL || '').trim().toLowerCase();
  const ssl = sslEnv === '1' || sslEnv === 'true' || sslEnv === 'yes' || sslEnv === 'on';

  const config: PoolConfig = connectionString
    ? {
      connectionString,
      ssl: ssl ? { rejectUnauthorized: false } : undefined
    }
    : {
      host: process.env.PG_HOST || '127.0.0.1',
      port: process.env.PG_PORT ? parseInt(process.env.PG_PORT, 10) : 5432,
      user: process.env.PG_USER || 'postgres',
      password: process.env.PG_PASSWORD || undefined,
      database: process.env.PG_DATABASE || 'zombie',
      ssl: ssl ? { rejectUnauthorized: false } : undefined
    };

  pool = new Pool({
    ...config,
    max: process.env.PG_POOL_MAX ? parseInt(process.env.PG_POOL_MAX, 10) : 10
  });

  const client = await pool.connect();
  try {
    await client.query('SELECT 1');
    logger.info('✅ Postgres connected successfully');
  } finally {
    client.release();
  }

  return pool;
}

export async function ensurePgVectorExtension(schemaName?: string | null): Promise<void> {
  const p = getPostgresPool();
  const client = await p.connect();
  try {
    if (schemaName) {
      await client.query(`CREATE SCHEMA IF NOT EXISTS ${schemaName}`);
      await client.query(`CREATE EXTENSION IF NOT EXISTS vector WITH SCHEMA ${schemaName}`);
    } else {
      await client.query('CREATE EXTENSION IF NOT EXISTS vector');
    }
  } finally {
    client.release();
  }
}

export async function closePostgres(): Promise<void> {
  if (!pool) return;
  await pool.end();
  pool = null;
  logger.info('Postgres pool closed');
}
