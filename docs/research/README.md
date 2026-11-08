# Research: the WeChat framing, and what to build instead of inventing

A survey of what the mini-app model actually is, which systems solve the problems we share, and where the
analogy breaks. Advisory: this directory records what is true and what it would cost, not what we will do.

Written because the framing in use — _distributed, FOSS, local-first, collaboration-enabled WeChat_ — is a
good internal shorthand and a poor basis for engineering decisions. Three of its four adjectives describe
things WeChat is not, and the fourth describes a model that is being standardised by a body that publishes
specs we can read instead of reverse-engineering a product.

## The one rule

**Every claim carries a mark.** A sentence about how another system works that carries no mark is a defect,
not an oversight, and is treated as one in review. The temptation to write confident prose about WeChat is
enormous because an enormous amount of confident prose about WeChat exists; refusing to repeat it is the
only reason this directory is worth reading.

| Mark           | Means                                                                                                 | How to check it                                    |
| -------------- | ----------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| **Documented** | A primary source states it: vendor documentation, a W3C specification, an RFC, a peer-reviewed paper. | Follow the link; the sentence is there             |
| **Code**       | Read from source — ours or theirs.                                                                    | Follow the link to the file                        |
| **Measured**   | We ran it, on a named device, in a stated way.                                                        | The measurement is described well enough to repeat |
| **Unverified** | Widely repeated, or inferred, and no primary source was found.                                        | Treat as a hypothesis, not a fact                  |

Two consequences worth stating because both are uncomfortable:

- **A number nobody can cite will be wrong.** WeChat's package-size limits are not in its framework
  documentation — two attempts returned 404 — and they appear to live in the admin console or release
  notes. Any figure in this directory that is not marked is one we could not verify, and saying so is more
  useful than quoting it.
- **Prefer the spec to the product.** Where the W3C MiniApps Working Group describes a mechanism, cite
  that and note what WeChat does differently. A standard describes the model on purpose; a product
  documents whatever it happened to ship.

Chinese-language documentation is primary for most of the WeChat mechanism. Reading it is part of the
work, not a workaround.

## The documents

| File                                             | Track | What it answers                                                      |
| ------------------------------------------------ | ----- | -------------------------------------------------------------------- |
| [wechat-architecture.md](wechat-architecture.md) | A     | What the host actually does, mechanism by mechanism                  |
| [comparable-systems.md](comparable-systems.md)   | B, C  | What other systems solved, and what each assumes that we do not have |
| [competitor-ux.md](competitor-ux.md)             | D     | How products people already use solve the UX problems we share       |
| [findings.md](findings.md)                       | —     | The register: one row per finding, its mark, and what it would touch |

`findings.md` is the one to read first. It is assembled from the other three and deliberately names what
each finding _would_ affect — as a pointer, not a proposal.

## The framing under test

| Claim                    | Status                      | The short version                                                                                              |
| ------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------- |
| Distributed              | False of WeChat, true of us | WeChat is centralized and cloud-authoritative on both axes we invert. The analogy earns nothing here           |
| FOSS                     | False of WeChat             | Its openness is a developer programme, not a licence                                                           |
| Local-first              | False of WeChat             | See [wechat-architecture.md](wechat-architecture.md#what-is-centralized-by-nature) for what that costs it      |
| Collaboration-enabled    | True, but differently       | WeChat's collaboration is the chat graph. Ours has to be the document                                          |
| "WeChat" as architecture | **Partly true, and useful** | Host plus downloaded packages, a narrow runtime, capability-mediated APIs. That part is real and worth copying |

The analogy is therefore useful in exactly one direction: **as a description of the host/pack relationship**.
Everywhere else it describes something we are deliberately the opposite of, and the report says which is which
rather than leaving a reader to guess.

## What was deliberately not researched

- **WeChat as a business.** Payments, advertising, the super-app economics and the regulatory environment
  that made one dominant platform viable. Interesting, and it constrains nothing we build.
- **A general survey of local-first projects.** The track is bounded to what we would plausibly use or
  learn a specific lesson from.
- **Our own performance.** That is a measurement task with a device and a stopwatch, not a reading task,
  and mixing the two produces documents that age badly.
- **Anything that ends in a decision.** This directory informs the next planning phase; it does not
  pre-empt it. No ADR is written from these documents.

## How to keep this honest

1. When you add a claim, add its mark.
2. When you cannot verify something, write **Unverified** and say what you tried.
3. When a finding turns out to be wrong, correct it and say it was wrong rather than deleting it. The
   record of what we believed and why is the part that stops us believing it again.
