# Manual accessibility testing

The automated gate (`e2e/tests/accessibility.spec.ts`) runs axe against each app's start screen. axe
catches roughly a third of real accessibility problems. This document is the other two thirds, and
it is written so you can run it without re-deriving what to look for.

Run this after any change to layout, colour, focus handling, or a dialog. It takes about twenty
minutes for one app.

## What to read, and what each thing is for

| Resource                                                                      | Use it for                                                                                     |
| ----------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| [W3C Easy Checks](https://www.w3.org/WAI/test-evaluate/easy-checks/)          | A 20-minute first pass. The fastest way to find obvious breakage.                              |
| [How to Meet WCAG (Quick Reference)](https://www.w3.org/WAI/WCAG22/quickref/) | Filter to Level AA. This is the checklist you tick.                                            |
| [Understanding SC](https://www.w3.org/WAI/WCAG22/Understanding/)              | One page per criterion, with worked examples. Read the page _before_ judging whether you pass. |
| [WCAG-EM](https://www.w3.org/TR/WCAG-EM/)                                     | The formal evaluation method. Use it for a full audit, not a spot check.                       |
| [ARIA Authoring Practices](https://www.w3.org/WAI/ARIA/apg/)                  | The correct keyboard behaviour for each widget. If a widget deviates, know why.                |
| [The A11Y Project checklist](https://www.a11yproject.com/checklist/)          | Plain-language companion when the spec wording is dense.                                       |

Target: **WCAG 2.2 level AA**, which is 55 of the 86 success criteria. The map in
`wcag-22-map.md` records which are gated, which are manual, and which do not apply.

## The sweep

Run these six steps against every distinct screen. A "screen" is anything with its own layout: a
start screen, the main document view, each dialog, settings.

### 1. Keyboard only

Put the mouse away. Start with the window focused.

- Press `Tab` from the first focusable thing to the last, then `Shift+Tab` back.
- Every interactive element must be reachable. Nothing skipped, nothing extra.
- The focus ring must be **visible at every stop**, not just the first.
- The order must follow the visual order. If it jumps, something is out of DOM order.
- Nothing may trap focus: you must always be able to leave.
- **Focus must never be hidden behind something.** Scroll with the keyboard: a focused card must
  not end up under a sticky header or rail. This is SC 2.4.11, new in 2.2, and easy to break.
- In a dialog: focus starts inside, `Escape` closes, focus returns to what opened it.

Write down the order you actually got, not the order you expected.

### 2. Screen reader

Orca is the Linux screen reader worth testing against. Install it, enable it, then:

- Close your eyes. Can you answer: _what screen is this, what can I do here, and what is the current
  document?_
- Find the primary action without seeing it.
- Trigger something that confirms itself (saving, importing). **Did you hear the confirmation?**
  If not, the status message is not in a live region (SC 4.1.3). This is the most likely failure in
  this suite, because a toast is visual by default.
- Open a dialog. Does it announce, and is the rest of the page inert?

Write down **what it actually said**, verbatim. "Seemed fine" is not a finding.

### 3. Zoom and reflow

- Zoom to **200%**. No content clipped, no horizontal scrollbar on a single-column screen.
- Zoom to **400%**. Content may reflow into one column, but nothing may be lost.
- Resize the window to **320 CSS pixels** wide. Same rule.
- If the system font size is increased, text must still fit its container.

### 4. Motion

- Turn on reduce-motion (`prefers-reduced-motion: reduce`).
- Every animation must stop or become instant. A transition that only decorates is the one to cut.

### 5. Contrast, in place

The palette gate measures the _preset's_ values. This step measures what is actually painted.

- Open devtools and inspect text you can read. Read the computed `color` and the effective
  background.
- Do this once per theme you ship, in both light and dark. A role that passes on `surface` may fail
  on `surface-sunk`.
- Check the focus ring against **every** surface it appears on, not just the page background.

Below 4.5:1 for text, or 3:1 for a focus ring or a meaningful boundary, is a finding. A purely
decorative divider is exempt. If you are arguing that something is decorative, be suspicious of
yourself.

### 6. Colour is not the only cue

- Take a greyscale screenshot.
- Anything distinguished by colour alone is now indistinguishable, which is the bug (SC 1.4.1).
  Canvas colours its cards by type, so this step matters most there: a type must also differ by
  label, glyph, or position.

## Where findings go

One GitHub issue per criterion, titled with the SC number:

> `1.4.11 Non-text Contrast: focus ring invisible on the sunk surface`

Labels: `accessibility`, plus the SC number. Then update the row in `wcag-22-map.md`, because a map
that drifts from reality is worse than no map.

## What "done" means here

A criterion is done when **both** halves agree: the automated gate is green and the manual step has
been performed and recorded. A green axe run alone proves very little, and a manual pass alone
cannot be repeated by anyone else.

Each app's `ACCESSIBILITY.md` reports only what has been done this way. Do not add a claim to it that
was not earned by one of these steps.
