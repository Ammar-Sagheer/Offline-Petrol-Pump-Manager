import { requirePageRole, ROLES } from '@/app/_lib/helpers';
import { getActivityLog, getActivityTrimCounts, getProfiles } from '@/app/_lib/data-service';
import PageHeader from '@/app/_components/ui/PageHeader';
import EmptyState from '@/app/_components/ui/EmptyState';
import PendingLink from '@/app/_components/ui/PendingLink';
import Pager, { pageFrom } from '@/app/_components/ui/Pager';
import ActivityTable from '@/app/_components/admin/ActivityTable';
import ClearOldActivityButton from '@/app/_components/admin/ClearOldActivityButton';

export const metadata = { title: 'Activity' };

/*
 * Twenty a page. A log is read by scanning rather than by reading, so it wants
 * more rows than the eight that suit the rate history - and unlike that one,
 * the rows here are tall and uneven, since a line carries its own change list.
 * Twenty fills a laptop screen without the page becoming a mile of scrolling.
 */
const PER_PAGE = 20;

/**
 * Everything anyone has done, newest first.
 *
 * OWNER ONLY, twice over: requirePageRole here, and the row-level policy on
 * activity_log, which is the one that actually decides. A staff login that
 * typed this URL would get past neither, but it is the policy that would stop
 * them if this line were ever deleted by accident.
 *
 * The page does no work beyond laying out rows: every sentence in the table was
 * written by the trigger in migration 035 at the moment the change happened.
 * See that file for what is logged, what is deliberately not, and why the
 * trigger can never block a write.
 *
 * WHAT THIS IS FOR. The owner has staff logins, and the app lets a past day be
 * corrected - which is necessary and is also the shape of a mistake being
 * quietly tidied away. Until now nothing recorded who did either. This does not
 * prevent anything; it means the question can be answered.
 */
export default async function ActivityPage({ searchParams }) {
  await requirePageRole(ROLES.SUPER_ADMIN);

  const params = await searchParams;
  const page = pageFrom(params);
  const who = typeof params?.who === 'string' ? params.who : null;

  const [{ rows, total }, profiles, trimCounts] = await Promise.all([
    getActivityLog({ page, perPage: PER_PAGE, who }),
    getProfiles(),
    getActivityTrimCounts(),
  ]);

  /* The filter has to survive turning the page, and the page number has to be
     dropped when the filter changes - staying on page 4 of a list that just
     became six rows long shows an empty table and looks broken. */
  const hrefFor = (n) => `/admin/activity?page=${n}${who ? `&who=${who}` : ''}`;
  const filterHref = (id) => (id ? `/admin/activity?who=${id}` : '/admin/activity');

  return (
    <>
      <PageHeader
        title="Activity"
        description="Who entered, changed or removed what, and when. Written by the database itself, and nobody — including you — can edit it."
      >
        {/* The one thing that may be done TO the log rather than read from it,
            and the only one: the old end can be thrown away in whole periods.
            Not shown at all when nothing is old enough for it to mean
            anything - see ClearOldActivityButton for why that is still
            append-only. */}
        {trimCounts ? <ClearOldActivityButton counts={trimCounts} /> : null}
      </PageHeader>

      {/* Only worth drawing with more than one login to choose between. */}
      {profiles.length > 1 ? (
        <div
          role="group"
          aria-label="Whose activity to show"
          className="mb-4 inline-flex flex-wrap gap-1 rounded-xl border border-ink-300 bg-white p-1"
        >
          <FilterChip href={filterHref(null)} active={!who}>
            Everyone
          </FilterChip>
          {profiles.map((profile) => (
            <FilterChip key={profile.id} href={filterHref(profile.id)} active={who === profile.id}>
              {profile.full_name}
            </FilterChip>
          ))}
        </div>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState
          title={who ? 'Nothing recorded for this person yet' : 'Nothing recorded yet'}
          description="The trail starts from the day this was switched on — anything entered before that is not in it. The next reading, payment or price change will appear here."
        />
      ) : (
        <>
          <ActivityTable rows={rows} />
          <Pager
            page={page}
            perPage={PER_PAGE}
            total={total}
            hrefFor={hrefFor}
            label="Activity pages"
          />
        </>
      )}
    </>
  );
}

/**
 * One choice in the filter row. The selected one is a `<span>`, not a link, for
 * the reason `<Pager>` and `<TrendRange>` both give: a link styled to look
 * inert still takes focus and still navigates, to the page you are on.
 */
function FilterChip({ href, active, children }) {
  if (active) {
    return (
      <span
        aria-current="true"
        className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white"
      >
        {children}
      </span>
    );
  }

  return (
    <PendingLink
      href={href}
      scroll={false}
      className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold
                 text-ink-700 hover:bg-ink-100 hover:text-ink-900"
    >
      {children}
    </PendingLink>
  );
}
