// Shared management page heading. Presentational only: pages keep ownership of
// their own copy, counts and actions, so role-specific wording stays where the
// permission checks live.

export interface AdminPageHeaderProps {
  /** Small pill above the title (module label, role badge, …). */
  eyebrow?: React.ReactNode;
  title: string;
  description?: React.ReactNode;
  /** Secondary line under the description (counts, timestamps, …). */
  meta?: React.ReactNode;
  /** Primary actions, right-aligned from the sm breakpoint. */
  actions?: React.ReactNode;
}

export function AdminPageHeader({
  eyebrow,
  title,
  description,
  meta,
  actions,
}: AdminPageHeaderProps) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0 space-y-3">
        {eyebrow}
        <h1 className="text-3xl leading-[1.12] text-foreground sm:text-4xl">
          {title}
        </h1>
        {description ? (
          <p className="max-w-3xl text-base leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
        {meta}
      </div>

      {actions ? (
        <div className="flex flex-wrap items-center gap-2 sm:justify-end">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
