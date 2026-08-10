# PROGRESS.md

For work that spans many sessions and is not finished: a port, a migration, a
packaging effort, a rewrite. It answers **where did we get to, what is proven,
and what is still broken** - the things a changelog does not, because a
changelog describes completed work and this describes work in flight.

If the repo is a shipped app with no long-running effort, skip this file. Its
absence is meaningful; a stale one is a liability.

## Structure

```markdown
# Progress log

[One line: read CLAUDE.md first for orientation, this is the detailed
record. Name the branch and any upstream repo and the commit synced to.]

## Status
[Where the work actually is, in a sentence or two. Not a percentage.]

## Collaborators
[If more than one person or agent has worked on this - who did what, and
which branches are merged. Otherwise a session assumes its own branch is
the whole story.]

## What's built
[Numbered, one entry per major piece.]

## How each piece was verified
[Bullet per piece. What was actually run, not what was intended.]

## Bug log
[Chronological, numbered, never deleted. The core of the file.]

## What this environment can't test
[The blind spots, explicitly.]

## What's not done / worth knowing
[Open items, with enough context to pick each one up cold.]
```

## The bug log is the point

Each entry: the symptom as it appeared, the root cause, the fix, and how it was
verified. Numbered and kept forever, including bugs long fixed - the pattern
across them is what teaches the next session where this project is fragile.

> **8. Every date rendered as `Mon Aug 03 2026 00:00:00 GMT+0000`.** Found by
> screenshotting the UI, not by any test - the build was clean and nothing
> threw. The old HTTP API returned DATE columns as `'YYYY-MM-DD'` strings,
> which is what `formatDate()` was written against; the `pg` driver parses DATE
> into a `Date`, and `String(thatDate)` slices to `'Mon Aug 03'`. The same
> mismatch left every `<input type="date">` blank. Fixed at the driver boundary
> with `types.setTypeParser(types.builtins.DATE, (v) => v)` rather than
> teaching ~37 call sites a second shape.
>
> **Worth generalising from:** this is the class of bug the port is most likely
> to still be hiding - places where the two layers disagree about a column's
> JavaScript shape with no error raised either way. `numeric` is the other one
> to watch.

The "worth generalising from" note is what turns a bug log into something worth
reading. Add it whenever a bug is an instance of a class.

Record **who found each bug** when more than one person is involved, and say
plainly when testing missed something and why. "None of these reproduce in dev
mode, which is exactly why my own testing missed all three" is worth more to
the next session than any amount of confidence.

## Say what the environment cannot test

The most useful section for a session working in a sandbox, CI, or any
environment unlike the one the app ships to. Be specific:

- No display, so nothing windowed has ever really been opened here.
- Nothing OS-specific: `.cmd` resolution, certificate stores, installer
  behaviour, file-locking rules.
- But note what *can* be tested and should be - a headless browser against a
  real local database catches whole classes of rendering bugs, and skipping it
  because "the build is clean" is how the date bug above survived.

Then draw the practical conclusion, so nobody reads the section and forgets it:
don't mark a platform-specific bug "fixed" as more than "fixed as far as we can
reason about it here" until someone confirms it on the real machine. The normal
pattern is that the next problem appears a few steps further in - that is
progress, not a sign the previous fix was wrong.

## Keeping it useful

- **Update it at the end of a session**, while the reasoning is still in
  context. Reconstructing it from a diff a week later loses the part that
  mattered.
- **Never delete a bug entry.** Mark it fixed and leave it.
- **Keep "status" honest.** "All 8 build tasks complete, currently fixing
  packaging bugs found on real hardware" is a status. "95% done" is not, and a
  session that believes it will skip the reading.
- **When the effort finishes**, fold the durable lessons into README and
  CHANGELOG and say at the top of this file that it is closed. A finished
  PROGRESS.md that still reads as in-flight sends every later session chasing
  work that is already done.
