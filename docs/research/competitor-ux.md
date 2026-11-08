# Competitor UX

Track D. How products people already use solve the UX problems we share. Marks per [README.md](README.md).

**This is the least complete track in the report**, and deliberately so. Product marketing pages describe
what an app lets you do, not how it solves the hard interaction problem, and the honest way to research UX
is to use the product for an hour rather than read its site. What follows distinguishes what a source
actually said from what is generally known — and where it is the latter, it says so.

## D1. Local-first money: Actual Budget

**Documented, and directly useful** — Actual is the closest shipped analogue to our whole product, not just
our budget app.

| What they do                                                                                     | Source                                                                                                                   |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| Data on both the user's server _and_ the local device                                            | Their sync docs, quoted in [comparable-systems.md](comparable-systems.md#c5-actual-budget-the-precedent-that-matches-us) |
| Works regardless of connection; syncs when it can                                                | Same                                                                                                                     |
| **End-to-end encryption optional**, with a stated cost: forget the password and the data is gone | Same                                                                                                                     |

**The UX finding** is in that last row, and it is about trust rather than layout. Actual makes a promise —
_"your data never goes to any external servers that you don't choose"_ — and then offers E2E as an
_upgrade_ with an explicit warning about what it costs. We have made blindness the only option.

**The question this raises for us:** a person who forgets a recovery phrase with us is in the same position
as an Actual user who forgets their encryption password, except they were never given the choice. That is
defensible — it is stricter — but the _onboarding_ has to be honest about it, and we have no onboarding.

**Unverified:** how Actual presents a sync conflict, if it surfaces them at all. Presumably a last-write
wins on the field level, but their docs did not say and this pass did not test it.

## D2. Canvas on a tablet: Heptabase

**Documented, product model only.** Heptabase's own positioning: _"Whiteboards"_ where sources are broken
into cards, _"nested Databases"_ with _"nested tags and properties"_ to structure them, plus AI assistance.
It is a cloud product. No architecture claims are available from the marketing page, and none are made here.

**What is actually relevant to us:** Heptabase is the reference the Product Developer Note already cites
for Canvas, and it is a _commercial cloud app with a tablet-first canvas_. That means its whiteboard
interaction model on a touch device is worth studying directly — by using it, not by reading about it —
because that is the design problem the tablet plan has to solve and no document will answer it.

**Unverified:** how Heptabase handles touch versus pointer, whether it has a keyboard path for moving cards,
and how its inspector behaves on a small screen. All three are exactly the questions
[ADR-0007](https://github.com/mr-rogers-neighborhood/suite-go/blob/main/docs/adr/0007-collaboration-is-a-session.md)'s neighbours will need.

## D3. Object models that teach themselves

**Unverified.** Notion, Capacities, and Tana are cited in the product statement as the influences for the
typed-object-graph model. This pass read none of their material, and the specific question — _how do you
teach a person what a "type" is without a tutorial?_ — is not answered by their marketing.

**Why it is on the list anyway:** the first real user runs a large world-building project with templates
and custom types in Obsidian. Whatever we ship for Canvas has to explain its model to someone who already
has one, and if he has to watch a video first, we have failed at the thing Canvas is for. That is a UX
research question with a real user attached, and the cheapest way to answer it is to ask him what his
current setup does that a new app would have to reproduce.

## D4. Capture and widgets

**Unverified.** Todoist, TickTick and Sunsama are on the list for one question: what does a _good_
quick-capture widget actually do, and what does it deliberately not do?

Everything in this pass about widgets comes from the W3C white paper, which says a MiniApp widget is _"a
special form of MiniApp Page"_ that _"can occupy a certain area instead of the entire screen"_ — a
definition, not a design. That is enough to know widgets are a standard concept and not enough to design
one.

**The one constraint we do know** is from our own platform: an Android widget cannot host a text input. So
the capture bar cannot live in the widget, whatever the competition does. That constrains the answer before
any comparison starts, which is worth knowing.

## What this track could not do, and what to do instead

The honest summary: **product research is not reading research.** Four of four sub-questions are marked
Unverified, and the two that produced findings did so because the vendor happened to publish an
architecture document (Actual) or because the question was structural rather than visual (widgets cannot
host text input).

The method that would actually answer Track D:

1. **Use each product for an hour** on the device in question — the tablet for Canvas, a phone for capture.
2. **Ask the one real user** what his Obsidian setup does that a replacement must reproduce. He is the only
   person whose opinion on this is currently evidence rather than speculation.
3. **Write down what was tried and what was annoying**, in the same four-mark vocabulary. "It felt better"
   is not a finding; "moving a card required a drag with no keyboard path, so I could not do it with an
   external keyboard" is.

Recommending more reading would produce a longer document and no better answers.
