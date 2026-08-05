import fs from 'node:fs/promises';
import path from 'node:path';

import PageHeader from '@/app/_components/ui/PageHeader';
import BackupForm from '@/app/_components/admin/BackupForm';
import { requirePageRole, ROLES, formatDate } from '@/app/_lib/helpers';

export const metadata = { title: 'Backup' };

/**
 * Existing backups, newest first. Reads the folder directly - this is local
 * disk, not a database table, so there is nothing to query.
 */
async function listBackups() {
  const appDataDir = process.env.APP_DATA_DIR;
  if (!appDataDir) return null; // not running inside the desktop app

  const backupsDir = path.join(appDataDir, 'backups');
  let entries;
  try {
    entries = await fs.readdir(backupsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const backups = await Promise.all(
    entries
      .filter((entry) => entry.isDirectory())
      .map(async (entry) => {
        const stat = await fs.stat(path.join(backupsDir, entry.name));
        return { name: entry.name, createdAt: stat.birthtime ?? stat.ctime };
      }),
  );

  return backups.sort((a, b) => b.createdAt - a.createdAt);
}

export default async function BackupPage() {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const appDataDir = process.env.APP_DATA_DIR;
  const backups = await listBackups();

  return (
    <>
      <PageHeader
        title="Backup"
        description="Everything lives in one folder on this laptop. Back it up the same way you'd back up any other folder."
      />

      <div className="card mb-6 p-5">
        <h2 className="mb-2 text-sm font-semibold text-ink-900">Where your data lives</h2>
        {appDataDir ? (
          <p className="break-all rounded-lg bg-ink-50 px-3 py-2 font-mono text-xs text-ink-700">
            {appDataDir}
          </p>
        ) : (
          <p className="text-sm text-ink-500">
            Not running inside the desktop app right now, so this page cannot see where the data
            folder is.
          </p>
        )}
        <p className="mt-3 text-sm text-ink-600">
          Copying that whole folder - while the app is closed - is a complete backup. The button
          below does the same thing while the app is running, using Postgres&apos;s own safe way
          of copying a live database.
        </p>
      </div>

      <div className="card mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Back up now</h2>
        <BackupForm disabled={!appDataDir} />
      </div>

      <div className="card mb-6 p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">Previous backups</h2>
        {!backups || backups.length === 0 ? (
          <p className="text-sm text-ink-500">No backups yet.</p>
        ) : (
          <ul className="divide-y divide-ink-100">
            {backups.map((backup) => (
              <li key={backup.name} className="py-2 text-sm text-ink-700">
                <span className="font-mono text-xs text-ink-500">{backup.name}</span>
                <span className="ml-2 text-ink-500">
                  {formatDate(backup.createdAt.toISOString().slice(0, 10))}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs text-ink-500">
          A backup is only a backup once it is off this laptop. Copy these folders to a USB
          drive or another computer - a copy sitting beside the original is lost with it.
        </p>
      </div>

      {/* Restore instructions belong here, not in a file somewhere. Whoever
          needs them is on a freshly reinstalled machine with no project
          checkout, and quite possibly in a hurry. */}
      <div className="card p-5">
        <h2 className="mb-3 text-sm font-semibold text-ink-900">
          Putting a backup back on a new computer
        </h2>
        <ol className="list-decimal space-y-2 pl-5 text-sm text-ink-600">
          <li>Install Pump Manager, open it once so it creates its folders, then close it fully.</li>
          <li>
            Open the folder shown above and delete <span className="font-mono text-xs">db-data</span>{' '}
            and <span className="font-mono text-xs">config.json</span>.
          </li>
          <li>
            From your backup, copy <span className="font-mono text-xs">db-data</span> and{' '}
            <span className="font-mono text-xs">config.json</span> in their place.
          </li>
          <li>Open the app. Everything is back, including the same logins and passwords.</li>
        </ol>
        <p className="mt-3 text-xs text-ink-500">
          Both pieces have to travel together: the database keeps its passwords inside itself,
          and <span className="font-mono">config.json</span> is the only copy of them. A fresh
          install makes new ones, so <span className="font-mono">db-data</span> restored on its
          own would be intact but locked.
        </p>
      </div>
    </>
  );
}
