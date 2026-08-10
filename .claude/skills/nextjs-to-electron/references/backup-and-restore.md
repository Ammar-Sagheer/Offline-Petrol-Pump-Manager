# Backup and restore

When the data lives on one laptop, backup is not a feature request - it is the
difference between an inconvenience and the business losing its books. Design
it at the same time as the data folder, because where the secrets live decides
whether a backup can be restored at all.

## Ask the question that finds the bugs

"The laptop got wiped. Now what?" Then *test that*, rather than reasoning about
it. Restore onto a simulated fresh install - a different app-data folder with
its own freshly generated secrets - and confirm the app starts and the accounts
work. Two independent faults are found this way and by no other means; both
below produced a backup folder that looked perfect and was useless.

## Fault 1: the credentials are inside the cluster

Postgres stores role passwords **in the cluster**, and the per-install config
file is the only record of what they are. A fresh install generates new random
ones. So a `db-data` folder restored on its own is intact and unreachable:

```
password authentication failed for user "postgres"
```

**Back up the config file alongside the data directory, always**, and keep its
restrictive file mode (`0600`) on the way back in. Say plainly, wherever the
backup is documented, that the two halves travel together.

If older backups exist without it, the data is still recoverable, but by hand:
set the auth method in `pg_hba.conf` to `trust`, start Postgres against the
folder, reset both role passwords to the values in the *new* config, restore
`pg_hba.conf`, start the app. Write that procedure down where the person who
needs it will find it - they are on a reinstalled machine with no project
checkout.

## Fault 2: `postmaster.pid` travels with a live copy

A copy taken while the server runs necessarily includes `postmaster.pid` and
`postmaster.opts`. Postgres then refuses to start from the restored folder:

```
lock file "postmaster.pid" already exists ... is another postmaster running?
```

It cannot distinguish a stale pid from a live one. Filter both out of the copy
going out, and again on the way back in - an older or foreign backup may still
carry them. They are regenerated on every start.

## Copying while the app keeps running

Postgres has a documented way to make a filesystem copy of a live cluster
consistent:

```sql
select pg_backup_start('label');
-- copy the data directory here
select pg_backup_stop();
```

This needs a superuser connection, which is a good reason for the main process
to hold those credentials and pass them to the app only for this one purpose.
The restricted application role should never have that privilege for anything
else.

The result is one folder. "Back up your data" becomes "copy this folder onto a
USB stick", which is the only instruction that actually gets followed. Say
explicitly that a backup sitting next to the original is lost with the
original.

## Restoring has to happen in the main process

A Server Action cannot restore a backup: it runs inside the Next.js child,
which is connected to the very database being replaced, and on Windows a
directory with open handles inside it cannot be renamed at all. So the flow is
IPC to the Electron main process, which:

1. **Validates the folder before touching anything live.** Someone picking the
   wrong folder is the likeliest failure by far, not a corrupt backup. Check
   for `db-data/PG_VERSION` and a readable config with the keys you need, and
   say plainly what is wrong with the folder they picked.
2. **Stops the app** - the Next child first, then Postgres. Before any rename:
   Windows will not rename a directory Postgres still has files open in.
3. **Moves the current data aside** into one fixed slot rather than deleting
   it, so a failed copy still has a way back and the UI can offer "undo this
   restore" afterwards. One slot, not a history - be explicit that restoring
   again overwrites it.
4. **Copies the backup into place** (filtering `postmaster.pid`/`.opts`), and
   restores the config file's `0600` mode.
5. **Relaunches** - `app.relaunch(); app.exit(0)`. A clean restart re-runs the
   normal bootstrap against whatever data is now in place and reads the
   matching config, which is far more predictable than rewiring a running app.

Everything after step 2 is committed: there is no useful "return an error to a
page whose server just lost its database". On failure, roll back the moves and
relaunch anyway, then report what happened.

## Two things users will get wrong

- **Which password to use after a restore.** The logins come from the backup,
  not from whatever was set up on the fresh install. Say so on the screen.
- **Where the data actually is.** It varies by how the app was launched. Print
  the real path in the app rather than documenting a guess.

Put the restore instructions *in the app*, on the backup screen. The person who
needs them is on a reinstalled machine with no source checkout and no README.

## Testing this without a packaged build

If the data folder, database folder and backup paths are read from environment
variables, the real backup and restore code paths can be exercised from a plain
`next start` against a hand-built app-data folder - no installer needed. Several
"only works in the packaged app" features can be tested this way; it is worth
designing for deliberately.
