# docs/UI_CONVENTIONS.md

The design system the app has actually settled into, as opposed to one decided
up front. Its job is to stop the next session inventing a fourth way to confirm
a destructive action.

Descriptive, not aspirational. Write what the code does today. A convention
that exists in this file and nowhere in the components is worse than no file,
because it will be copied.

## Structure

```markdown
# UI conventions

[Two sentences: this is what the app settled into over many rounds; follow
these rather than reinventing. Point at the changelog for the reasoning
behind specific choices - several look simplifiable and were tried that way.]

## The shared building blocks, at a glance
[A table: component, what it is for. The single most useful section -
it is how someone discovers the component that already exists.]

## Design tokens
[Colours, spacing, type scale, as they are defined in the stylesheet, with
what each is for.]

## <Pattern>
[One section per recurring pattern. What it is, when it applies, and the
reasoning if it is non-obvious.]
```

Sections accumulate as patterns emerge. Typical ones: buttons; confirming a
destructive action; forms and their result shape; dialogs; tables; layout
grids; the type scale and why it is where it is; navigation; responsive rules;
icons; page structure; empty states; pagination.

## The building-blocks table

Put it first. It is what a session scans before writing markup, and it is the
difference between reusing `<ConfirmAction>` and writing a seventh inline
confirm.

| Component | What it is for |
|---|---|
| `<Dialog>` | Native `<dialog>` + `showModal()`. Full-screen on a phone, centred panel above `sm`. No click-outside-to-close, deliberately. |
| `<ConfirmAction>` | Every "are you sure?": trash icon → dialog. Replaced seven inline confirms that shifted the page. |
| `<NumberInput>` | Blocks scroll-wheel and arrow-key changes that silently corrupt a typed figure. Use instead of bare `type="number"`. |

Each row carries a reason, not just a name. "Replaced seven inline confirms
that shifted the page" is what stops the eighth.

## Write the rejected alternative into the rule

A convention with no reasoning gets overridden by the next person with an
opinion. Give each non-obvious one the sentence that defends it:

> **Dialogs do not close on a click outside.** They did, and a half-typed
> reading was lost to a stray click on the backdrop. Escape and an explicit
> Cancel are the only ways out.

> **Colour is never the only cue.** A gain and a loss differ by an arrow and a
> word as well as by green and red - this is read on a cheap tablet in poor
> light, and often by someone checking against cash in a drawer.

## Sections that are actually about the domain

The most useful conventions in a real app are not "buttons are blue". They are
the ones encoding something about the reader:

- The unit or precision a figure carries, and the places that must agree.
- Which language a label is in, and what the bracketed word is (a label the
  reader recognises, not a translation).
- When a list stops being a table and becomes cards.
- How the current date or context is stated - once, loudly, where a reader
  checking figures cannot mistake which day they are looking at.
- What a warning says: the reader's actual situation ("Tuesday 12 August was
  never entered"), not the general case ("some days may be missing").

Write those down even when they feel too specific to be conventions. They are
the ones that make the app feel coherent, and the ones most often broken by
a session that never saw them.

## Keeping it in step

A new shared component, layout convention or global class goes in this file **in
the same commit** that introduces it. The reasoning goes in the changelog; the
rule goes here. When they drift, this file is the one that gets believed and
copied, so it is the one that must not lie.
