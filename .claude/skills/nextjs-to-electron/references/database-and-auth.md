# The offline database, and replacing hosted auth

## Choosing the database

**If the app is on Postgres today (Supabase, Neon, RDS, plain Postgres), keep
Postgres.** `embedded-postgres` bundles real per-platform Postgres binaries as
an npm dependency, so the machine needs no Docker, no installer, no service.
The schema, triggers, constraints and functions then apply *verbatim*.

**Switching to SQLite is not a port, it is a rewrite of the guarantees.** This
is the decision most likely to be made casually and regretted. If any part of
correctness lives in the database - check constraints, triggers, row-level
security, PL/pgSQL functions, `jsonb`, deferred constraints, aggregate RPCs -
none of it survives, and **nothing in the UI will complain**, because the
application-side check was always the courtesy rather than the rule. For an app
where money or stock has to add up, that is the whole safety net.

Ask directly: what does the database refuse to do today that the JavaScript
does not? If the answer is "nothing", SQLite is fine and much simpler. If there
is a list, keep Postgres.

## What the bootstrap has to do

`assets/bootstrap-db.js` is a working implementation. Its shape:

1. On first run, initialise a cluster in the app-data folder and create the
   database.
2. Start it, bound to `127.0.0.1` only.
3. Apply pending migrations in filename order, each in its own transaction,
   recording applied filenames in a `schema_migrations` table. This is the
   Supabase CLI's migration runner in twenty lines, with no dependency on the
   CLI being installed on the user's machine.
4. Set the application role's real password (see below).
5. Return the connection environment for the Next child process, plus a
   `stop()` the main process calls on shutdown.

### Migrations: consolidate, do not replay

When porting an existing schema, consolidate the migration history into its
final state rather than replaying every historical step. Workarounds specific
to the old host - dashboard-imposed constraints, extension quirks, safe-update
dances - do not apply locally and only add failure modes.

The consequence to plan for: **the local migration numbers will not line up
with the source's, ever.** When the source app moves on and you sync, compare
*contents*, not numbers. `git grep` for a feature name is a faster way to find
what is missing than counting files.

### `ALTER ROLE ... PASSWORD` does not take a bind parameter

**Symptom.** `syntax error at or near "$1"` on first run.

That clause's grammar takes a string literal, not an expression, so `password
$1` is a syntax error regardless of the value bound. Ask Postgres to escape it
first - a normal parameterised `SELECT`, where parameters *are* allowed - then
interpolate the already-quoted result:

```js
const { rows } = await client.query('select quote_literal($1) as quoted', [password]);
await client.query(`alter role app_user with password ${rows[0].quoted}`);
```

Test it with a password containing a quote and a semicolon.

## Replacing hosted authentication

A hosted auth service (Supabase's GoTrue, Auth0, Clerk) provides: an identity
table, password hashing, a signed token, and a database function like
`auth.uid()` that row-level-security policies are written against. Offline, all
four have to come from somewhere else. The mapping that keeps RLS policies
working unchanged:

| Hosted | Offline replacement |
|---|---|
| `auth.users` | The app's own `profiles`/`users` table becomes the identity table itself - email plus password hash - rather than a shadow of a separate one. |
| Password hashing | pgcrypto's `crypt()` / `gen_salt('bf')`, entirely inside Postgres. |
| JWT verification | A signed, httpOnly session cookie (`iron-session` or equivalent). |
| `auth.uid()` in policies | `current_uid()`, reading a session variable the app sets per request. |

**Hash passwords in the database, not in Node.** A `SECURITY DEFINER` function
takes an email and password and returns a user id or nothing; the hash never
leaves Postgres, and there is no native npm module (`bcrypt`) to rebuild for
Electron's ABI at packaging time. That second reason matters more than it
sounds - native rebuilds are a recurring packaging failure.

**How the request tells the database who is asking:**

```js
export async function withUser(userId, fn) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    if (userId) {
      await client.query('select set_config($1, $2, true)', ['app.current_user_id', userId]);
    }
    const result = await fn(client);
    await client.query('commit');
    return result;
  } catch (error) {
    await client.query('rollback').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}
```

`set_config(..., true)` is transaction-local, which is the whole point: a
pooled connection handed back cannot carry one request's identity into
another's. Every read and write goes through this one helper, and
`current_uid()` in SQL reads that variable.

Keep the app connecting as a restricted role that RLS applies to - never the
superuser. The superuser credentials stay in the main process for the few
operations that genuinely need them (backup, migrations).

**First-run setup is a screen you have to build.** With no dashboard to create
the first account from, the app needs its own owner-creation flow, and the
sign-in page needs to detect "no accounts exist yet" and redirect to it.

That detection is a trap worth knowing in advance: querying the identity table
directly returns *zero rows to a signed-out request* under a sensible RLS
policy, which looks exactly like a fresh install and sends an existing user
back to setup after they sign out. Answer it with a narrow `SECURITY DEFINER`
function - `any_profiles_exist()` returning a boolean - in the same family as
the login function, rather than by loosening a policy.

## Type parsing: the bug class that renders wrong instead of throwing

A hosted Postgres reached over HTTP (PostgREST/Supabase) serialises to JSON;
the `pg` driver parses to JavaScript types. **They disagree about several
column types, silently, with no error on either side.** Any UI written against
one shape misrenders under the other, and the build stays clean.

- **`date` columns.** PostgREST returns `'2026-08-03'`; `pg` returns a
  JavaScript `Date`. A formatter written to slice the first ten characters of a
  string produces `'Mon Aug 03'` from `String(date)`, which parses to nothing
  and falls through to printing the entire `Mon Aug 03 2026 00:00:00 GMT+0000
  (Coordinated Universal Time)`. The same mismatch leaves every
  `<input type="date">` blank, because the browser only accepts `YYYY-MM-DD`.

  Fix at the driver boundary, once, rather than teaching every call site a
  second possible shape:

  ```js
  import { types } from 'pg';
  types.setTypeParser(types.builtins.DATE, (value) => value);
  ```

  Leave `timestamptz` as a `Date` - that one is a real instant, and the string
  form has no fixed length. A calendar day with no time and no zone should not
  become an instant anyway; that is what reintroduces midnight and timezone
  drift.

- **`numeric` columns.** `pg` returns these as *strings*, deliberately, to
  protect precision beyond what a JS number holds. `"1200" + 50` is
  `"120050"`. Audit every numeric column rather than assuming `Number()`
  wrapping is already there.

- **`int8`/`bigint`** is also a string, for the same reason.

Two ways to catch the rest: `PREPARE` every SQL statement in the data layer
against the real schema (it resolves tables, columns, function signatures and
casts without executing, so a mistyped column fails there rather than on a
rendered page), and screenshot every screen with realistic data. The date bug
above was invisible to a clean build, a passing test suite and a DOM
assertion - only a screenshot showed it.

## Porting the data layer

Keep the exported function names and return shapes identical to the originals.
If `getCustomers()` returned an array of the same objects before, the ~30
components calling it need no changes whatsoever, and the port stays a
two-file job (`data-service.js`, `actions.js`) rather than a rewrite of the
whole UI. This is the single biggest lever on how long the conversion takes.

Server Actions and `revalidatePath` keep working, because a real Next server is
still running. Don't replace them with IPC without a reason.
