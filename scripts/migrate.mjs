import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import pg from 'pg';
import nextEnv from '@next/env';
import { databaseTls } from '../lib/server/database-tls.ts';
nextEnv.loadEnvConfig(process.cwd());
if (!process.env.DATABASE_URL) throw new Error('Set DATABASE_URL before applying migrations.');
const client = new pg.Client({ connectionString: process.env.DATABASE_URL,
  ...databaseTls() });
await client.connect();
try {
  await client.query('BEGIN');
  await client.query('SELECT pg_advisory_xact_lock(183740921)');
  await client.query('CREATE TABLE IF NOT EXISTS schema_migrations (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())');
  for (const name of ['001_initial.sql', '002_limits_and_comments.sql', '003_moderation.sql', '004_demo_marker.sql']) {
    const sql = await readFile(new URL(`../db/migrations/${name}`, import.meta.url), 'utf8');
    const checksum = createHash('sha256').update(sql).digest('hex');
    const previous = await client.query('SELECT checksum FROM schema_migrations WHERE name = $1', [name]);
    if (previous.rows.length) {
      if (previous.rows[0].checksum !== checksum) throw new Error(`Applied migration ${name} was modified.`);
      continue;
    }
    await client.query(sql);
    await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1,$2)', [name, checksum]);
    console.log(`Applied ${name}`);
  }
  await client.query('COMMIT');
} catch (error) { await client.query('ROLLBACK'); throw error; }
finally { await client.end(); }
