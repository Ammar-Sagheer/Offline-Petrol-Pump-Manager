'use client';

import { useActionState } from 'react';

import { createBackup } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';

export default function BackupForm({ disabled = false }) {
  const [state, formAction] = useActionState(createBackup, null);

  return (
    <form action={formAction} className="space-y-3">
      <p className="text-sm text-ink-600">
        Saves a copy of the database, taken safely while the app keeps running, into a
        timestamped folder next to your data.
      </p>

      <FormMessage state={state} />

      <SubmitButton className="btn-primary" pendingLabel="Backing up…" disabled={disabled}>
        Back up now
      </SubmitButton>
    </form>
  );
}
