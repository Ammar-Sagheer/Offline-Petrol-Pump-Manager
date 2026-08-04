/**
 * Starts the bundled Postgres binary and brings its schema up to date.
 *
 * On a brand new install this: initialises a cluster in the app-data folder,
 * starts it bound to 127.0.0.1 only, creates the `pump` database and the
 * `app_user` login role every RLS policy is written against (see
 * db/migrations/004_rls_policies.sql), then applies every migration in
 * db/migrations/ in order.
 *
 * On every later run it just starts the existing cluster and applies any
 * migration files it has not seen yet - the same idea as the Supabase CLI's
 * migration runner, minimal version, no dependency on the Supabase CLI itself
 * being installed on the client's machine.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { dbDataDir, userDataDir, loadOrCreateConfig } = require('./config');

const DATABASE_NAME = 'pump';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

async function ensureAppUserPassword(superClient, password) {
  // The role is created with a placeholder password by migration 004 (it has
  // to exist by name for the GRANT statements in that file to succeed). The
  // real, randomly generated password for this install is set here, after
  // migrations run, and is never written into a migration file.
  await superClient.query('alter role app_user with password $1', [password]);
}

async function appliedMigrations(client) {
  await client.query(`
    create table if not exists public.schema_migrations (
      filename    text primary key,
      applied_at  timestamptz not null default now()
    )
  `);
  const { rows } = await client.query('select filename from public.schema_migrations');
  return new Set(rows.map((r) => r.filename));
}

async function runMigrations(client) {
  const already = await appliedMigrations(client);
  const files = fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  for (const file of files) {
    if (already.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`[db] applying ${file}`);
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into public.schema_migrations (filename) values ($1)', [file]);
      await client.query('commit');
    } catch (error) {
      await client.query('rollback').catch(() => {});
      throw new Error(`Migration ${file} failed: ${error.message}`);
    }
  }
}

/**
 * Starts Postgres and returns the connection details the Next.js server
 * should use (as app_user, RLS-restricted) plus a stop() function.
 */
async function bootstrapDatabase() {
  // embedded-postgres ships as an ES module, so it cannot be require()'d from
  // this CommonJS file (Electron's main process). A dynamic import() works
  // from CommonJS regardless of the target module's own format.
  const { default: EmbeddedPostgres } = await import('embedded-postgres');

  const config = loadOrCreateConfig();
  const dataDir = dbDataDir();
  const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));

  const pg = new EmbeddedPostgres({
    databaseDir: dataDir,
    user: 'postgres',
    password: config.pgSuperPassword,
    port: config.pgPort,
    persistent: true,
    // Loopback only - this is the "never reachable from outside the laptop"
    // guarantee at the database layer, matching the Next.js server below.
    host: '127.0.0.1',
  });

  if (firstRun) {
    console.log('[db] first run - initialising cluster in', dataDir);
    await pg.initialise();
  }

  await pg.start();

  if (firstRun) {
    await pg.createDatabase(DATABASE_NAME);
  }

  const superClient = new Client({
    host: '127.0.0.1',
    port: config.pgPort,
    user: 'postgres',
    password: config.pgSuperPassword,
    database: DATABASE_NAME,
  });
  await superClient.connect();

  try {
    await runMigrations(superClient);
    await ensureAppUserPassword(superClient, config.appUserPassword);
  } finally {
    await superClient.end();
  }

  return {
    firstRun,
    env: {
      PGHOST: '127.0.0.1',
      PGPORT: String(config.pgPort),
      PGDATABASE: DATABASE_NAME,
      PGUSER: 'app_user',
      PGPASSWORD: config.appUserPassword,
      SESSION_SECRET: config.sessionSecret,
      // Backup-only: the Backup screen needs a superuser connection to run
      // pg_backup_start()/pg_backup_stop() around a live filesystem copy of
      // the data directory (see app/admin/backup/page.js and the
      // createBackup action in actions.js). app_user is intentionally never
      // given that privilege for anything else.
      PG_BACKUP_SUPERUSER: 'postgres',
      PG_BACKUP_SUPERPASSWORD: config.pgSuperPassword,
      APP_DATA_DIR: userDataDir(),
      DB_DATA_DIR: dataDir,
    },
    async stop() {
      await pg.stop();
    },
  };
}

module.exports = { bootstrapDatabase };
