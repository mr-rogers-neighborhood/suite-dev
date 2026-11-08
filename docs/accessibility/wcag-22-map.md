# WCAG 2.2 criterion map

Every success criterion in WCAG 2.2, and what this project does about it.

The point of this file is that `ACCESSIBILITY.md` should never claim something this table does not
support. If a row says _manual_ and nobody has run the manual step, the statement cannot call it
working.

**Target: Level AA.** That is 55 of the 86 criteria.

## How to read the Status column

| Status     | Meaning                                                                      |
| ---------- | ---------------------------------------------------------------------------- |
| **Gated**  | An automated check fails the build if this regresses.                        |
| **Manual** | A step in `manual-testing.md` covers it. Not verified until someone runs it. |
| **N/A**    | Does not apply to this software, with the reason given.                      |
| **Gap**    | Known not to meet it yet. Tracked, not hidden.                               |

Totals: **86 criteria** in WCAG 2.2 — WCAG 2.1's 78, plus 9 new, minus 4.1.1 Parsing, which 2.2
removes as obsolete. Levels: 31 A, 24 AA, 31 AAA.

## Principle 1: Perceivable

| SC     | Level | Criterion                              | Status | How                                                                                                            |
| ------ | ----- | -------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------- |
| 1.1.1  | A     | Non-text Content                       | Gated  | Every mark is an `AppMark` with an accessible name; Biome rejects an SVG with no `<title>`.                    |
| 1.2.1  | A     | Audio-only and Video-only              | N/A    | The apps contain no audio or video.                                                                            |
| 1.2.2  | A     | Captions (Prerecorded)                 | N/A    | No prerecorded media.                                                                                          |
| 1.2.3  | A     | Audio Description or Media Alternative | N/A    | No prerecorded media.                                                                                          |
| 1.2.4  | A     | Captions (Live)                        | N/A    | No live media.                                                                                                 |
| 1.2.5  | A     | Audio Description (Prerecorded)        | N/A    | No prerecorded media.                                                                                          |
| 1.2.6  | AAA   | Sign Language (Prerecorded)            | N/A    | No prerecorded media.                                                                                          |
| 1.2.7  | AAA   | Extended Audio Description             | N/A    | No prerecorded media.                                                                                          |
| 1.2.8  | AAA   | Media Alternative (Prerecorded)        | N/A    | No prerecorded media.                                                                                          |
| 1.2.9  | AAA   | Audio-only (Live)                      | N/A    | No live media.                                                                                                 |
| 1.3.1  | A     | Info and Relationships                 | Gated  | axe checks landmarks, list structure, and heading order.                                                       |
| 1.3.2  | A     | Meaningful Sequence                    | Manual | Keyboard sweep, step 1: focus order matches visual order.                                                      |
| 1.3.3  | A     | Sensory Characteristics                | Manual | Wording never relies on "the button on the right".                                                             |
| 1.3.4  | AA    | Orientation                            | N/A    | Desktop windows are resizable in both orientations by the OS.                                                  |
| 1.3.5  | AA    | Identify Input Purpose                 | Manual | No autofill-relevant personal inputs except Budget amounts.                                                    |
| 1.4.1  | A     | Use of Color                           | Manual | Sweep step 6, greyscale. **Highest risk in the suite**: Canvas colours cards by type.                          |
| 1.4.2  | A     | Audio Control                          | N/A    | Nothing plays audio.                                                                                           |
| 1.4.3  | AA    | Contrast (Minimum)                     | Gated  | `@suite/theme` holds every preset to 4.5:1 for text on every surface, and axe re-checks the painted result.    |
| 1.4.4  | AA    | Resize Text                            | Manual | Sweep step 3, zoom to 200%.                                                                                    |
| 1.4.5  | AA    | Images of Text                         | Gated  | No text is rendered as an image; marks are SVG with `<title>`.                                                 |
| 1.4.6  | AAA   | Contrast (Enhanced)                    | Gap    | 7:1 is not met; AA is the target.                                                                              |
| 1.4.7  | AAA   | Low or No Background Audio             | N/A    | No audio.                                                                                                      |
| 1.4.8  | AAA   | Visual Presentation                    | Manual | Partly: line length and justification are controlled where text is long.                                       |
| 1.4.9  | AAA   | Images of Text (No Exception)          | Gated  | As 1.4.5.                                                                                                      |
| 1.4.10 | AA    | Reflow                                 | Manual | Sweep step 3, 320px and 400%.                                                                                  |
| 1.4.11 | AA    | Non-text Contrast                      | Gated  | `border-strong` and `focus` are held to 3:1 on every surface. `hairline` is deliberately exempt as decorative. |
| 1.4.12 | AA    | Text Spacing                           | Manual | Sweep step 3: overriding spacing must not clip.                                                                |
| 1.4.13 | AA    | Content on Hover or Focus              | Manual | Tooltips must be dismissable, hoverable, and persistent.                                                       |
| 1.5.1  | AAA   | Identify Input Purpose (AAA)           | N/A    | No personal-data fields.                                                                                       |

## Principle 2: Operable

| SC     | Level | Criterion                     | Status  | How                                                                                     |
| ------ | ----- | ----------------------------- | ------- | --------------------------------------------------------------------------------------- |
| 2.1.1  | A     | Keyboard                      | Manual  | Sweep step 1.                                                                           |
| 2.1.2  | A     | No Keyboard Trap              | Manual  | Sweep step 1, including inside dialogs.                                                 |
| 2.1.3  | AAA   | Keyboard (No Exception)       | Manual  | As 2.1.1, with no pointer-only path allowed.                                            |
| 2.1.4  | A     | Character Key Shortcuts       | **Gap** | Single-key shortcuts exist in Canvas and are not yet remappable or disableable.         |
| 2.2.1  | A     | Timing Adjustable             | N/A     | No time limits on any interaction.                                                      |
| 2.2.2  | A     | Pause, Stop, Hide             | Manual  | Sync status is the only moving content; it must not animate indefinitely.               |
| 2.2.3  | AAA   | No Timing                     | N/A     | As 2.2.1.                                                                               |
| 2.2.4  | AAA   | Interruptions                 | Manual  | Reminders are dismissable and do not steal focus.                                       |
| 2.2.5  | AAA   | Re-authenticating             | N/A     | No sessions to expire.                                                                  |
| 2.2.6  | AAA   | Timeouts                      | N/A     | No sessions.                                                                            |
| 2.3.1  | A     | Three Flashes                 | Gated   | No flashing content exists; nothing animates above 3 times per second.                  |
| 2.3.2  | AAA   | Three Flashes (Enhanced)      | N/A     | As 2.3.1.                                                                               |
| 2.3.3  | AAA   | Animation from Interactions   | Manual  | Sweep step 4, reduce-motion.                                                            |
| 2.4.1  | A     | Bypass Blocks                 | Gated   | A `<main>` landmark per screen; axe checks landmarks.                                   |
| 2.4.2  | A     | Page Titled                   | Gated   | Each window sets a document title naming the app.                                       |
| 2.4.3  | A     | Focus Order                   | Manual  | Sweep step 1.                                                                           |
| 2.4.4  | A     | Link Purpose (In Context)     | Manual  | Links name their destination in text.                                                   |
| 2.4.5  | AA    | Multiple Ways                 | N/A     | A single-document desktop app has one way in by design.                                 |
| 2.4.6  | AA    | Headings and Labels           | Gated   | axe checks heading order and label presence.                                            |
| 2.4.7  | AA    | Focus Visible                 | Gated   | One `FOCUS_RING` constant on every pressable primitive, held to 3:1.                    |
| 2.4.8  | AAA   | Location                      | Manual  | The window title and rail name the current document.                                    |
| 2.4.9  | AAA   | Link Purpose (Link Only)      | Manual  | As 2.4.4.                                                                               |
| 2.4.10 | AAA   | Section Headings              | Manual  | Long screens group under headings.                                                      |
| 2.4.11 | AA    | Focus Not Obscured (Minimum)  | Manual  | **New in 2.2.** Sweep step 1: scroll with the keyboard under the sticky rail.           |
| 2.4.12 | AAA   | Focus Not Obscured (Enhanced) | Gap     | No sticky overlap at all is not yet guaranteed.                                         |
| 2.4.13 | AAA   | Focus Appearance              | Manual  | The ring is 2px on a 2px offset; not formally verified against the AAA formula.         |
| 2.5.1  | A     | Pointer Gestures              | Manual  | No multi-point or path gestures are required.                                           |
| 2.5.2  | A     | Pointer Cancellation          | Gated   | Activation fires on up-event through native button semantics.                           |
| 2.5.3  | AA    | Label in Name                 | Manual  | Visible label text must be contained in the accessible name.                            |
| 2.5.4  | A     | Motion Actuation              | N/A     | No device-motion input.                                                                 |
| 2.5.5  | AAA   | Target Size (Enhanced)        | Gap     | 44px is not enforced; AA's 24px is the target.                                          |
| 2.5.6  | AAA   | Concurrent Input Mechanisms   | Manual  | Keyboard and pointer work simultaneously.                                               |
| 2.5.7  | AA    | Dragging Movements            | **Gap** | **New in 2.2.** Canvas vault drop and card drag have no single-pointer alternative yet. |
| 2.5.8  | AA    | Target Size (Minimum)         | Manual  | **New in 2.2.** 24×24 CSS px for icon buttons; measured during review.                  |

## Principle 3: Understandable

| SC    | Level | Criterion                                 | Status | How                                                                                                |
| ----- | ----- | ----------------------------------------- | ------ | -------------------------------------------------------------------------------------------------- |
| 3.1.1 | A     | Language of Page                          | Gated  | `<html lang="en">` on every renderer.                                                              |
| 3.1.2 | AA    | Language of Parts                         | N/A    | Interface copy is English only.                                                                    |
| 3.1.3 | AAA   | Unusual Words                             | Manual | Copy avoids jargon; SC numbers live in docs, not the UI.                                           |
| 3.1.4 | AAA   | Abbreviations                             | Manual | Native file extensions are spelled out on first use.                                               |
| 3.1.5 | AAA   | Reading Level                             | Manual | Plain language is a house rule.                                                                    |
| 3.1.6 | AAA   | Pronunciation                             | N/A    | No ambiguous homographs in interface copy.                                                         |
| 3.2.1 | A     | On Focus                                  | Gated  | No focus handler navigates or submits.                                                             |
| 3.2.2 | A     | On Input                                  | Manual | No field changes context on entry; selects act on change only where labelled.                      |
| 3.2.3 | AA    | Consistent Navigation                     | Gated  | The start screen is one component across all four apps.                                            |
| 3.2.4 | AA    | Consistent Identification                 | Gated  | Shared primitives, so a button is a button everywhere.                                             |
| 3.2.5 | AAA   | Change on Request                         | Manual | Navigation follows an explicit action.                                                             |
| 3.2.6 | A     | Consistent Help                           | Manual | **New in 2.2.** The privacy line and repository link hold the same position on every start screen. |
| 3.3.1 | A     | Error Identification                      | Gated  | Errors render with `role="alert"`.                                                                 |
| 3.3.2 | A     | Labels or Instructions                    | Gated  | Every field has a `Field` label; axe checks.                                                       |
| 3.3.3 | AA    | Error Suggestion                          | Manual | Messages say what to do, not only what failed.                                                     |
| 3.3.4 | AA    | Error Prevention (Legal, Financial, Data) | Manual | Destructive actions require typing the name to confirm.                                            |
| 3.3.5 | AAA   | Help                                      | Manual | Contextual help lives in the docs, not in the app.                                                 |
| 3.3.6 | AAA   | Error Prevention (All)                    | Manual | As 3.3.4.                                                                                          |
| 3.3.7 | A     | Redundant Entry                           | Manual | **New in 2.2.** Budget must not re-ask for data already given.                                     |
| 3.3.8 | AA    | Accessible Authentication (Minimum)       | N/A    | **There are no accounts to authenticate to.** Sync pairs devices with a code, not a password.      |
| 3.3.9 | AAA   | Accessible Authentication (Enhanced)      | N/A    | As 3.3.8.                                                                                          |

## Principle 4: Robust

| SC    | Level | Criterion         | Status | How                                                                                                                                                                                                                                                                                                                                                      |
| ----- | ----- | ----------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 4.1.1 | —     | Parsing           | N/A    | **Obsolete in WCAG 2.2.** Removed; nothing to meet.                                                                                                                                                                                                                                                                                                      |
| 4.1.2 | A     | Name, Role, Value | Gated  | Primitives use native elements; the import control is a disclosure, not a `menu` it would not honour.                                                                                                                                                                                                                                                    |
| 4.1.3 | AA    | Status Messages   | Manual | Canvas announces through a persistent `LiveRegion` (`role="status"` / `role="alert"`, `aria-atomic`). Budget and Planner mount the shared `Toast` with `role="status"` per notice, which is the less reliable shape: a region created and filled at the same moment can be missed by a reader. Verify with Orca, and make it persistent if it is missed. |

## The gaps, in one place

These are the honest list. Each is tracked, and none is claimed as working in `ACCESSIBILITY.md`.

| SC     | What is missing                                                    |
| ------ | ------------------------------------------------------------------ |
| 2.1.4  | Canvas single-key shortcuts are not remappable.                    |
| 2.4.12 | AAA. Sticky regions may overlap focused content in edge cases.     |
| 2.5.5  | AAA. Targets are 24px, not 44px.                                   |
| 2.5.7  | Canvas drag-and-drop has no keyboard or single-pointer equivalent. |

Order of work: **2.5.7 first** (AA, real, and the only AA gap), then 2.1.4, then the AAA rows.

4.1.3 is a _verification_ gap rather than a known failure: the markup is right, and whether a reader
hears it needs the screen-reader step to answer. Do not upgrade it to "working" until someone has
listened.
