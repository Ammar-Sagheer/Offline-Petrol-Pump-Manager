export default function EmptyState({ title, description, children }) {
  return (
    <div className="card flex flex-col items-center gap-2 px-6 py-12 text-center">
      <p className="text-base font-semibold text-ink-800">{title}</p>
      {description ? <p className="max-w-md text-sm text-ink-600">{description}</p> : null}
      {children ? <div className="mt-3">{children}</div> : null}
    </div>
  );
}
