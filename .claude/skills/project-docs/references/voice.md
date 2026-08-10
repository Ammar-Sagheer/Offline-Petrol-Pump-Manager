# House voice

These documents read as one person explaining the project to the next person
who has to work on it. Concrete, unhurried, no register shift into marketing
or into tutorial.

## The core habit: why, not what

Comments and docs earn their place by explaining reasoning that is invisible in
the code.

> **No:** The `formatDate` helper formats dates for display.
>
> **Yes:** `date` columns are handed back as strings by the driver's type
> parser, deliberately, because the UI's date formatting was written against
> the string shape the old HTTP API returned. Changing that back would mean
> teaching ~37 call sites about a second possible shape.

The second one saves someone a day. The first one is noise on the page.

## Rules that show up in every file

**Sentence case headings.** "What the database will not let you do", not "What
The Database Will Not Let You Do".

**Concrete numbers over adjectives.** "84 proofs, each inside a transaction
that aborts" beats "extensively tested". "~59MB, down from the whole tree"
beats "much smaller". If a number is not known, say so rather than reaching for
an adjective.

**Name the symptom before the cause.** A future reader arrives with a symptom
in hand and needs to find the right section by scanning for it. "The window
never appears and it times out after 30s" is findable; "process spawning
configuration" is not.

**Bold the claim, explain in the sentence.** Long paragraphs are scanned, not
read. One bolded phrase per paragraph gives the eye a landing point:

> **The database enforces the money rules, not the app.** Balanced days,
> append-only ledger, no negative accounts. If the app and the database
> disagree, the database is right.

**Tables for anything with parallel structure.** Roles against permissions,
files against what they do, migrations against what they add. Prose describing
a table is harder to read than the table.

**Second person for instructions, third for description.** "Copy that folder
off the laptop" in a README; "the trigger writes one line per change" in a
changelog.

**Admit uncertainty in place.** "Verified on the owner's machine" and "not yet
confirmed from a packaged install" are both useful; "works" covering both is
not. A parenthetical is enough - it does not need a caveats section.

**No emoji, no exclamation marks, no "simply" or "just".** If a step were
simple it would not need writing down, and telling a stuck reader it is simple
is the wrong message.

**Prefer the specific noun.** "The `activity_log` trigger", not "the logging
system". Names are greppable; categories are not.

## Length

Long is fine when it is dense - the reference this style comes from has a
2,000-line changelog that is genuinely worth reading, because every entry is a
decision with its reasoning. Long is not fine when it is padded. Cut:

- Preambles announcing what the section will cover.
- Summaries restating the section just read.
- Any sentence a reader can skip without losing information.

## Two examples of the voice

From a README, on a rule the database enforces:

> **The customer ledger is append-only.** No update, no delete, for anybody,
> including the owner. A mistake is corrected by posting a new entry pointing
> the other way, so the history always adds up. This is enforced by a database
> trigger, not just by permissions.

From a changelog, on something that was tried and removed:

> A day-completion strip was tried three ways alongside it and removed -
> migrations 037 and 038 add and then drop its RPC. It answered a question
> nobody was asking at that point in the screen, and it cost a query per page
> load.

Both are short. Both tell the reader something the code will not.
