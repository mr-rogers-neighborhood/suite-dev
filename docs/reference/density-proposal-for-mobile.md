# Proposal: density for a touch host

Written for the Suite Go phase, in answer to the rule in your plan: _"If `@suite/ui` needs a
touch-size variant, propose it; do not add it."_ This is the proposal.

Shipped in `@suite/theme` and `@suite/ui` at **v0.16.0**.

## What you asked for

> Their `ButtonSize` is `sm | md`; we do not reach below `md` and we add the floor ourselves.

You can keep the `.touch` utility. The point of this proposal is that you may not need it, and if
you do, it can target one variable instead of a `button` selector.

## What now exists

A density axis with **your three names**, taken from `ThemeDensity` in your `ModuleHost`:

```ts
import { applyScale } from "@suite/theme";

applyScale(density, document.documentElement); // "compact" | "cozy" | "comfortable"
```

It publishes seven custom properties and a `data-density` attribute:

| Property                 | compact | cozy     | comfortable |
| ------------------------ | ------- | -------- | ----------- |
| `--control-height`       | 32px    | **36px** | **44px**    |
| `--control-height-sm`    | 28px    | 32px     | 40px        |
| `--control-padding-x`    | 10px    | 12px     | 16px        |
| `--control-padding-x-sm` | 8px     | 10px     | 12px        |
| `--control-gap`          | 6px     | 8px      | 10px        |
| `--control-gap-sm`       | 4px     | 6px      | 8px         |
| `--row-padding-y`        | 8px     | 10px     | 14px        |

Every primitive reads these with the shipped value as a **fallback**:
`h-[var(--control-height,2.25rem)]`. A host that publishes nothing renders exactly what it rendered
before. That is why this was safe to land while you were mid-rebuild.

## Why the mobile answer is `comfortable`

`comfortable.controlHeight` is 44px, which is SC 2.5.5 exactly. Our desktop `md` button was 36px,
which is above AA's 24px floor and below the 44px you enforce. `comfortable` closes that gap in the
shared primitive rather than in your stylesheet.

## What density deliberately does not do

**It never sets a font size.** Space only.

This is the part worth reading carefully, because it interacts with your phase B. You are turning on
`settings.textZoom` from the system font scale. If density also moved type, a phone at 1.3 font
scale and `comfortable` density would compound, and nothing has measured 1.3 x comfortable. So the
system owns type size and density owns room: two independent axes, no multiplication.

The type scale is published separately (`--text-caption` 11px, `--text-label` 12px, `--text-body`
13px, `--text-title` 15px, `--text-display` 34px) for hosts that want to name their types. It also
changes no pixel unless a host publishes it.

## Verified, not asserted

Measured in a real Electron window on our Budget start screen:

| Setting                  | Button height        |
| ------------------------ | -------------------- |
| Nothing published        | **36px** (unchanged) |
| `--control-height: 44px` | **44px**             |
| `--control-height: 32px` | **32px**             |
| `--text-body: 17px`      | font-size 17px       |

The class forms compile under Tailwind 4.3.4, including the `length:` hint and comma fallbacks.

## What is not done

- **Not measured on a phone.** These are CSS pixels; a device at 1.3 font scale and `comfortable`
  density has not been looked at. That is yours, and it is the row your mitigation table anticipates.
- **Not applied to every primitive.** `Button`, `IconButton`, `Field`, `Launch`, `ImportMenu`,
  `EmptyState`, `Toast` and `Dialog` read the tokens. `Modal` and `AppMark` do not need to.
- **`Launch` is still one centred card.** The `frame` prop is gone, so there is one presentation for
  all four desktop apps. If a phone wants the card to lose its 760px cap or its 32px side padding,
  say so and it becomes a token rather than a fork.

## If you would rather not adopt this yet

Nothing breaks. Pin where you are, keep `.touch`, and the only cost is a `button` selector that
reaches into components we own. The later upgrade is `applyScale("comfortable")` plus deleting the
utility, with no markup changes.
