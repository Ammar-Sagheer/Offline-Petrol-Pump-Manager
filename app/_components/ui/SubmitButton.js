'use client';

import { useFormStatus } from 'react-dom';

/**
 * A submit button that disables itself while the action is running.
 *
 * This matters more than it looks: without it, an impatient double-tap on a
 * slow connection can post the same reading twice.
 */
export default function SubmitButton({
  children,
  pendingLabel = 'Saving…',
  className = 'btn-primary',
  disabled = false,
  ...props
}) {
  const { pending } = useFormStatus();

  return (
    // `disabled` is pulled out of props and combined rather than spread, so a
    // caller passing disabled={false} cannot cancel out the pending guard.
    <button type="submit" className={className} disabled={pending || disabled} {...props}>
      {pending ? pendingLabel : children}
    </button>
  );
}
