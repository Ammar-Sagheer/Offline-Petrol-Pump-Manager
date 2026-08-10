# docs/CHANGELOG.md

Not a release log and not `git log` reformatted. It is **a narrative of what
was built and why**, so a new session understands the reasoning behind the
current shape before changing it. Its single most valuable content is the
record of things tried and reverted.

Version numbers and dates are optional and usually unhelpful for an app with
one deployment and one customer. Group by theme instead, roughly chronological
within each theme, newest work at the bottom.

## Structure

```markdown
# Changelog

[Two sentences: what this file is for, and that full detail is in the
commit messages - this is the summary, not a replacement.]

[Pointers: business rules are in README, patterns are in UI_CONVENTIONS.]

## Where things stand

[The orientation block - see below. The only section that gets rewritten.]

## <Theme>
- [entry]
- [entry]

### <A specific change worth its own heading>
[Prose. What changed, what it replaced, why.]
```

## "Where things stand" earns its place at the top

A long changelog is unreadable as an update mechanism - nobody diffs 2,000
lines to work out what is new. This block is the fix, and it is the one part
you rewrite each time rather than append to:

- **The shape of it today**, in three or four sentences: stack, hosting, who
  uses it, what number the migrations have reached.
- **A table of what changed most recently**, newest last, area against what
  changed. One line each, pointing down into the detail.
- **The load-bearing things that are easy to break** - a numbered list of three
  to five. Where the correctness actually lives, the rounding rule that three
  places must agree on, the timezone that is pinned deliberately.
- **A line for a downstream repo**, if one exists: where to start reading, and
  what is hardest to replay.

This is what makes "sync the other repo up to this one" a single prompt. The
downstream session reads this block, sees the table, and knows what to look
for. Keep the table honest - if it lists something that did not land, the
downstream repo will hunt for code that is not there.

## Entries

An entry is worth writing when a future session would otherwise redo the
thinking. Rough test: would someone reading only the diff misunderstand it?

**Worth an entry:**

- A feature, with the constraint that shaped it.
- A non-obvious fix, with the root cause - especially a bug whose symptom and
  cause were in different places.
- Something removed, and why. Highest value in the file.
- A performance change with the actual measurement.
- A decision between two reasonable options, with what tipped it.

**Not worth an entry:** dependency bumps, formatting, renames with no
behavioural consequence, anything the commit message already covers in one
line.

## Write the reversals down

A future session - human or otherwise - looks at a pattern, thinks "this could
be simpler", and rebuilds something that was already removed for a reason.
This file is the only thing that prevents it:

> **A day-completion strip on Readings was tried and removed.** Three layouts,
> then dropped: migrations 037 and 038 add and then drop the RPC behind it. It
> answered a question nobody was asking at that point in the screen and cost a
> query per page load. The gap warning that replaced it needs no new query.

Include the migration numbers, the file names, the specifics. Vague regret
("we tried a strip, it didn't work") does not stop the next attempt.

## Verification sub-entries

Where a change was proved rather than assumed, say how, and be exact:

> **Verified.** All 24 migrations applied cold to a throwaway cluster, then 84
> proofs, each inside a transaction that aborts, so no test data is ever
> committed. The valuable ones: the append-only ledger still refuses an edit
> *as the table owner*, with RLS out of the picture; Rs 20 from a Rs 580/L drum
> stores as `0.034 L`, not `0.03`.

That paragraph tells a future session which guarantees are actually tested,
where the test harness idea came from, and which edge cases matter. "Tested
thoroughly" tells it nothing.

## Refreshing

**Append. Never rewrite history and never condense old entries.** An entry
looking obsolete is usually the one that stops a change being re-attempted.

1. `git log <last changelog commit>..HEAD --oneline` for the gap.
2. Read the diffs of anything structural; a commit subject is not enough to
   write an entry from.
3. Add to the existing theme if there is one, or start a new theme at the
   bottom.
4. Rewrite "Where things stand": update the shape, add rows to the recent
   table, and re-check the load-bearing list still holds.
