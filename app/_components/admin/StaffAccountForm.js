'use client';

import { useActionState, useRef } from 'react';

import { createStaffAccount } from '@/app/_lib/actions';
import SubmitButton from '@/app/_components/ui/SubmitButton';
import FormMessage from '@/app/_components/ui/FormMessage';

/**
 * There is no public signup, so this is the only way a login comes into
 * existence. New accounts always start as data entry.
 */
export default function StaffAccountForm() {
  const formRef = useRef(null);
  const [state, formAction] = useActionState(async (prevState, formData) => {
    const result = await createStaffAccount(prevState, formData);
    if (result?.ok) formRef.current?.reset();
    return result;
  }, null);

  return (
    <form ref={formRef} action={formAction} className="card h-fit space-y-4 p-4">
      <h3 className="text-sm font-bold text-ink-900">Create a login</h3>

      <div>
        <label className="label" htmlFor="full_name">
          Name
        </label>
        <input id="full_name" name="full_name" type="text" required className="input" />
      </div>

      <div>
        <label className="label" htmlFor="staff_email">
          Email
        </label>
        <input
          id="staff_email"
          name="email"
          type="email"
          required
          autoComplete="off"
          className="input"
        />
      </div>

      <div>
        <label className="label" htmlFor="staff_password">
          Password
        </label>
        <input
          id="staff_password"
          name="password"
          type="text"
          required
          minLength={8}
          autoComplete="new-password"
          className="input"
          placeholder="At least 8 characters"
        />
        <p className="mt-1 text-xs text-ink-500">
          Shown as you type so you can pass it on. Ask them to change it under Account once they
          have signed in.
        </p>
      </div>

      <div>
        <label className="label" htmlFor="staff_role">
          Role
        </label>
        <select id="staff_role" name="role" required defaultValue="data_entry" className="input">
          <option value="data_entry">Data entry — records daily figures only</option>
          <option value="super_admin">Owner — full access, including money reports</option>
        </select>
      </div>

      <FormMessage state={state} />

      <SubmitButton className="btn-primary w-full">Create login</SubmitButton>
    </form>
  );
}
