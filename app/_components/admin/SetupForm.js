'use client';

import { useActionState } from 'react';

import { completeFirstRunSetup } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';

export default function SetupForm() {
  const [state, formAction] = useActionState(completeFirstRunSetup, null);

  return (
    <form action={formAction} className="space-y-4">
      <div>
        <label className="label" htmlFor="full_name">
          Your name
        </label>
        <input
          id="full_name"
          name="full_name"
          type="text"
          autoComplete="name"
          required
          autoFocus
          className="input"
          placeholder="Owner's name"
        />
      </div>

      <div>
        <label className="label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="input"
          placeholder="you@example.com"
        />
      </div>

      <div>
        <label className="label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="input"
          placeholder="At least 8 characters"
        />
      </div>

      <div>
        <label className="label" htmlFor="confirm_password">
          Confirm password
        </label>
        <input
          id="confirm_password"
          name="confirm_password"
          type="password"
          autoComplete="new-password"
          required
          minLength={8}
          className="input"
          placeholder="Type it again"
        />
      </div>

      <FormMessage state={state} />

      <SubmitButton className="btn-primary w-full" pendingLabel="Creating account…">
        Create owner account
      </SubmitButton>

      <p className="text-center text-xs text-ink-500">
        This runs once, the first time the app opens. Every other login is
        created from Settings afterwards.
      </p>
    </form>
  );
}
