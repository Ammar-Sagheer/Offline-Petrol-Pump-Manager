/**
 * Starts the bundled Postgres and brings its schema up to date.
 *
 * On a brand new install: initialises a cluster in the app-data folder, starts
 * it bound to 127.0.0.1 only, creates the database and the restricted login
 * role the app connects as, then applies every migration in order.
 *
 * On every later run it starts the existing cluster and applies any migration
 * files it has not seen yet - the Supabase CLI's migration runner in twenty
 * lines, with no dependency on that CLI existing on the user's machine.
 */
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');
const { dbDataDir, userDataDir, loadOrCreateConfig } = require('./config');

const DATABASE_NAME = 'app';
const APP_ROLE = 'app_user';
const MIGRATIONS_DIR = path.join(__dirname, '..', 'db', 'migrations');

async function ensureAppUserPassword(superClient, password) {
  // The role is created with a placeholder by the migration that grants to it
  // (it has to exist by name for GRANT to succeed). The real per-install
  // password is set here and never written into a migration file.
  //
  // ALTER ROLE ... PASSWORD does not accept a bind parameter: that clause's
  // grammar takes a string literal, not an expression, so `password $1` is a
  // syntax error regardless of the value bound. Ask Postgres to escape it
  // first with a normal parameterised SELECT, where parameters ARE allowed.
  const { rows } = await superClient.query('select quote_literal($1) as quoted', [password]);
  await superClient.query(`alter role ${APP_ROLE} with password ${rows[0].quoted}`);
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
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith('.sql')).sort();

  for (const file of files) {
    if (already.has(file)) continue;

    const sql = fs.readFileSync(path.join(MIGRATIONS_DIR, file), 'utf8');
    console.log(`[db] applying ${file}`);
    // One transaction per file, so a failure leaves nothing half-applied and
    // the same file is retried cleanly on the next launch.
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

async function bootstrapDatabase() {
  // embedded-postgres ships as an ES module, so it cannot be require()'d from
  // this CommonJS file. A dynamic import() works from CommonJS regardless of
  // the target module's own format.
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
    host: '127.0.0.1', // never reachable from outside this machine
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
    // The app connects as the restricted role every row-level-security policy
    // is written against - never as the superuser. Superuser credentials stay
    // in the main process, and are passed on only for operations that truly
    // need them (a live backup needs pg_backup_start/stop).
    env: {
      PGHOST: '127.0.0.1',
      PGPORT: String(config.pgPort),
      PGDATABASE: DATABASE_NAME,
      PGUSER: APP_ROLE,
      PGPASSWORD: config.appUserPassword,
      SESSION_SECRET: config.sessionSecret,
      APP_DATA_DIR: userDataDir(),
      DB_DATA_DIR: dataDir,
    },
    async stop() {
      await pg.stop();
    },
  };
}

module.exports = { bootstrapDatabase };
