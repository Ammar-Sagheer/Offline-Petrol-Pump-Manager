# CLAUDE.md

The orientation file. Loaded automatically into every session in this repo, so
every line costs context in *all* future work - which is the discipline that
keeps it short. Aim for 60-150 lines. It points at the other documents rather
than duplicating them.

## Structure

```markdown
# Working in this repo

[2-4 sentences: what this is, the stack, who actually uses it.]

Read these before making changes, in this order:

1. **`README.md`** - [what it is ground truth for]
2. **`docs/UI_CONVENTIONS.md`** - [what it settles]
3. **`docs/CHANGELOG.md`** - [why it matters: things tried and reverted]

## Ground rules specific to this project

[3-6 rules that are non-obvious and expensive to get wrong. Each one
bolded claim, then the reasoning, then where to look.]

## Verifying changes

[How to know a change is actually right in this repo - the checks that
have caught real bugs, not generic advice.]

## Docs stay current

[Which file a new pattern goes in, and that it happens in the same commit.]
```

Two variants worth knowing:

- **A port or companion repo** adds, near the top: the upstream repo, its
  branch, the exact commit currently synced to, that it is **read-only and
  never pushed to**, and a pointer to PROGRESS.md as the detailed record. It
  also lists the architecture decisions already settled, under a heading that
  says not to re-litigate them without asking - otherwise every new session
  re-opens the same three questions.

- **A repo with a project-scoped skill** in `.claude/skills/` should say what
  the skill covers versus what CLAUDE.md covers, and that the two are kept in
  step. Otherwise the next session reads one and assumes it is everything.

## What belongs here, and what does not

**Here:** reading order. Rules that are invisible in the code and costly to
break. How to verify work in this repo specifically. Conventions the repo
insists on (plain JavaScript, no TypeScript; match the existing comment
voice). The doc-updating expectation.

**Not here:** business rules (README), the history of decisions (CHANGELOG),
design patterns (UI_CONVENTIONS), current status and open bugs (PROGRESS).
Anything a well-configured linter already enforces. Long code examples.

## What makes a ground rule worth including

The test is whether a capable session would get it wrong without being told.

> **Every page under `/admin` goes through `requirePageRole()`** and every
> Server Action through `requireRole()`. Hiding a nav link is cosmetic only -
> never rely on it as the actual access control.

That is worth its four lines: the mistake is easy, plausible, and produces a
security hole that nothing visibly fails on.

> Use 2-space indentation.

That is not. Prettier or an editorconfig handles it, and it costs context in
every future session.

## The verification section

Generic advice ("write tests") is skipped by every reader. What earns its place
is the check that caught a real bug in *this* repo:

> **Never trust a DOM measurement alone.** A boolean like `hasScroll: false`
> can be numerically true while a screenshot shows the fix cost you cramped,
> wrapped text somewhere else. This has happened here - see the Purchases-table
> entries in the changelog. Render the change with realistic data and look at
> it.

Include the environment's actual mechanics if they are non-obvious: the browser
is pre-installed at a specific path and must not be reinstalled; a disposable
route is the established way to render a component with fixture data and must
never be committed; `npm run build` is the fastest way to catch a typo'd
import. These save a session from rediscovering the setup every time.
