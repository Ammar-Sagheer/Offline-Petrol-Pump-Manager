# README.md

Ground truth for **what the app does and what the rules are**. Written for a
person - the owner, a new developer, a session that needs the domain rather
than the code. It outlives every refactor, because it describes behaviour and
constraints rather than implementation.

## Structure

Order by what a reader needs first, not by what is easiest to write.

```markdown
# <App name>

[Two sentences on what it is for, in the domain's own words.]
[The stack, in one sentence.]

## First-time setup
[Environment variables - which are secret and which are not, and what
happens if one leaks. Install and run. Creating the first account, if that
cannot be done in-app.]

## The roles
[A table of role against permission. Then: where the roles are enforced,
in order of how real the enforcement is.]

## The daily routine
[The actual workflow, numbered, in the user's language. This is the
section that makes the rest legible - without it, a reader has no model of
what any screen is for.]

## What the database will not let you do
[The enforced rules, one bullet each. See below - the most valuable
section in the file.]

## How <the central calculation> works
[Any figure users check by hand, as a formula, with the reasoning behind
each term.]

## Project layout
[An annotated tree. One line per directory saying what lives there.]

## Database migrations
[A table: file, what it does. One line each.]

## Things worth knowing
[The catch-all for facts that bite. Configuration that looks arbitrary and
is not, defaults that matter, decisions with a reason.]
```

## The rules section is the one that matters

For anything holding money, stock or a ledger, the enforced-rules list is the
highest-value part of the README and the reason to write one at all. Each
bullet is a rule *the database refuses to break*, stated in domain terms with
its reasoning:

> **A customer carrying a balance cannot be removed** - in either direction,
> whether they owe the pump or the pump owes them. Judged to the nearest rupee,
> so the most it can forgive is 49 paisa. A removed customer drops out of the
> outstanding total, so this would write a debt off with nothing on screen to
> say it had happened. Settle the account first.

Three things that bullet does: names the refusal, gives the exact threshold,
and explains the loss the rule prevents. A reader can now decide whether a
proposed change is safe.

Two conventions worth keeping:

- **Close the section with the tie-breaker**, once: *if the app and the
  database ever disagree, the database is right*. It settles a whole class of
  future arguments in one line.
- **Only list rules that are actually enforced.** Grep for each one before
  writing it. A rule that lives only in a form's validation belongs in a
  different sentence with a different verb ("the form checks", not "the
  database refuses"), because the difference is exactly what a future session
  needs to know.

## Things worth knowing

This section absorbs everything that has no natural home and would otherwise be
rediscovered painfully. Good candidates:

- A configuration value that looks arbitrary and is not (a region pinned
  because the database is there; a timezone pinned because the server's clock
  is elsewhere), with what to change if the situation changes.
- A number format, a rounding rule, a unit - and where the three places that
  must agree are.
- A default that matters on day one and is invisible afterwards ("set the
  starting meter readings before entering the first day, or that day books the
  meter's whole lifetime as one day of sales").
- A retention limit and what it costs, including the workaround.
- A build-step ordering constraint that silently corrupts output if broken.

Each is a bolded claim, then two or three sentences of consequence. If it never
bites, it does not belong here.

## The porting section, when there is a downstream repo

If another repo tracks this one - an offline build, a rewrite, a mobile port -
add a section addressed to a session working there. It is the most-read part of
the README by that audience and it saves the most time:

- **What ports unchanged** (components, formatting helpers, pure functions).
- **What is host-specific and must be replaced**, named file by file.
- **What looks portable and is not.** The honest warning: how little of the
  important logic is in the JavaScript. If the rules live in triggers and
  constraints, swapping the database for a simpler one silently discards all of
  them and nothing in the UI complains.
- **The single hardest thing to port**, named, with an estimate of what it
  actually involves and whether the downstream build needs it at all.
- **The facts that make it easier than it looks** - no absolute URLs anywhere,
  password-only auth with no email flows. These are load-bearing and invisible
  until someone assumes the opposite.
