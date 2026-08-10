---
name: project-docs
description: Scan a repository and write or refresh the markdown files that let a future session pick the work up cold - CLAUDE.md, README.md, docs/CHANGELOG.md, docs/UI_CONVENTIONS.md and PROGRESS.md. Use this whenever someone asks to document a repo, set up or update CLAUDE.md, write a changelog or UI conventions file, "make the docs", says the docs are stale or out of date after a batch of work, wants a new repo set up so Claude can work in it effectively, or wants one repo's docs written so a second repo (a port, a desktop build, a rewrite) can read them and follow along. Also use proactively at the end of a substantial feature, migration or bug-fix session, before committing, since these files are what the next session reads instead of re-deriving everything from the diff.
---

# Project documentation that a future session can actually use

These files exist for one reader: whoever opens this repo next with no memory
of it. That is usually a future Claude session, sometimes the owner six months
later. Everything below follows from that.

The failure mode is not "too little documentation" - it is documentation that
restates what the code already says. `getCustomers()` fetches customers is
worth nothing; a future session can read the function. What it cannot recover
from the code is **why** the function is shaped that way, what was tried
before and reverted, and which parts are load-bearing.

**So the test for every line: could a competent reader work this out from the
code in under a minute? If yes, cut it.**

## The five documents

Not every repo needs all five. Pick by what the repo is.

| File | Answers | Needed when |
|---|---|---|
| `CLAUDE.md` | How do I work here? | Always. Orientation and ground rules - the shortest file, pointing at the others. |
| `README.md` | What does this do, and what are the rules? | Always. The business logic and the setup. Ground truth for *what* the app does. |
| `docs/CHANGELOG.md` | Why is it like this? | Once the repo has history worth not repeating - especially anything tried and reverted. |
| `docs/UI_CONVENTIONS.md` | What do I match? | Any app with a UI built over more than one session. |
| `PROGRESS.md` | Where did we get to? | A port, a migration, or work spanning many sessions with things still open. |

Detailed structure and a worked example for each is in `references/`. Read the
one you are writing, not all of them:

- `references/claude-md.md`
- `references/readme.md`
- `references/changelog.md`
- `references/ui-conventions.md`
- `references/progress.md`
- `references/voice.md` - **read this one every time.** How these files are
  written: sentence case, why-not-what, no marketing register.

## Step 1: scan before writing a word

Never draft from the conversation alone - it is a biased sample of whatever
was recently discussed. Ground everything in the repo.

```bash
git log --oneline -60                    # what has actually happened
git log --oneline -- docs/ CLAUDE.md     # when the docs last kept up
ls -R --ignore=node_modules --ignore=.next | head -100
```

Then read, in roughly this order, stopping when you can predict what the next
file contains:

- **package.json** - framework, versions, scripts, and what the scripts imply
  about how this is run and deployed.
- **The migrations or schema directory, in full.** For a data app this is where
  the actual rules live. Constraints, triggers and RLS policies are the
  documentation-worthy part; the JavaScript is usually the boring half.
- **Route/page structure** - this is the feature list, and the layout section
  of the README writes itself from it.
- **Shared component directory** - the recurring patterns UI_CONVENTIONS
  describes.
- **The data layer and any auth/permission helper** - who can do what, and
  where that is enforced.
- **Existing docs**, if any. In refresh mode these are the baseline, not a
  first draft to replace.

While scanning, keep a list of **claims worth making and the file:line that
proves each one**. A doc that asserts something the code stopped doing is
worse than no doc, because it will be believed.

## Step 2: work out which mode you are in

**Bootstrap** - little or no documentation. Write README.md and CLAUDE.md
first; they are what everything else references. CHANGELOG needs history, so
reconstruct it from `git log` grouped by theme, and say at the top that early
entries were reconstructed rather than written at the time. Don't fake
certainty about reasoning nobody recorded: "this was changed in 4f2a1c, the
reason is not recorded" is more useful than a plausible invention, because a
future session will act on what you wrote.

**Refresh** - docs exist and work has happened since. This is the common case
and it is *additive*:

- **Append** to CHANGELOG. Never rewrite or condense past entries - the value
  is in "we already tried that", and a tidy-up destroys exactly that.
- **Amend** README where a rule genuinely changed, and delete what is now
  false. This is the file that rots, because rules move.
- **Add** to UI_CONVENTIONS only when a *new recurring* pattern appeared. A
  one-off is not a convention.
- **Update** CLAUDE.md rarely. If it changes often, it is carrying detail that
  belongs in one of the others.

Find the gap with `git log <last-docs-commit>..HEAD --oneline` and read the
diffs behind anything that looks structural.

## Step 3: write

Follow `references/voice.md` and the per-document reference. Three rules that
override any structural template:

**Write down what was tried and abandoned.** This is the highest-value content
in the whole set and the only kind nothing else preserves. Code shows what
exists; git shows what changed; only prose says "this looks simplifiable, it
was simplified once and reverted because X". Every reverted experiment is a
future session's wasted afternoon.

**Name the load-bearing things and what breaks if they move.** Every project
has a handful: a timezone pinned deliberately, an append-only table, an
ordering constraint in a config file, a type parser at a driver boundary.
Collect them into one short list a reader meets early.

**Be exact about what is verified and what is assumed.** "Tested end to end on
Windows" and "should work, never run" are different facts, and conflating them
is how a session builds on sand. If an environment cannot test something - no
display, no Windows, no real data - say which parts that leaves unproven.

## Step 4: check the docs against the code

Before reporting done, verify the claims you made. Cheap and it catches real
errors:

- Every file path and directory mentioned exists.
- Every npm script quoted is really in package.json.
- Every rule attributed to the database has a constraint, trigger or policy
  behind it - grep for it. This is the most common place docs drift, because
  rules get relaxed in a migration and prose never follows.
- Counts are right ("sixteen tables", "38 migrations") or stated loosely.
- Cross-references point at sections that exist.

Then say plainly what you could not verify.

## When one repo's docs are read by another repo

A port, a desktop build or a rewrite that tracks an upstream app has a second
audience: a session in the *other* repo, trying to replay a change it cannot
see the discussion for. That works when the upstream docs carry:

- **A "where things stand" block at the top of the changelog**, with a table of
  what changed most recently. It is the first thing the downstream session
  reads, and it is what makes "sync me up to the latest version" a single
  prompt rather than an investigation.
- **Migration-level detail**, since schema is what has to be replayed exactly.
  A table of migration files and what each does is worth more here than
  anywhere else.
- **An explicit porting section** in the README: what translates mechanically,
  what has to be replaced, and which one thing is hardest. Written for someone
  who has not read the codebase.
- **Honest numbering advice.** Consolidated migrations never line up with the
  original's numbering. Say so, and say to compare contents rather than
  numbers - it prevents a whole class of "we are at 027" errors that are off
  by four modules.

The downstream repo's own `CLAUDE.md` should name the upstream repo, its
branch, the commit it is currently synced to, and that it is read-only. A sync
that does not update the recorded commit leaves the next session unable to tell
what it already has.

## What not to do

- **Don't write an API reference.** Signatures are in the code and go stale
  within a week.
- **Don't restate the framework's own documentation.** How the App Router works
  is not this repo's problem.
- **Don't invent reasoning.** If nobody wrote down why, say it is not recorded.
- **Don't let CLAUDE.md grow into a second README.** It is orientation - if it
  passes roughly 150 lines, the excess belongs elsewhere.
- **Don't produce five files where two would do.** A small repo with one
  session of history needs a README and a CLAUDE.md, and a changelog with one
  entry is noise.
