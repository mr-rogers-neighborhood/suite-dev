# ADR-0001: Tests live beside the code

- Status: accepted
- Date: 2026-11-06

## Context

Every repository keeps its unit tests in the same folder as the module they test, named
`<module>.test.ts`. End-to-end tests live in the repository's own `e2e/` folder. Only cross-process
tests live here, in `suite-dev`, and they launch the built binaries rather than importing source.

It is worth writing down why, because two other layouts are tempting: one central test tree for the
whole suite, or a mirrored `__tests__/` folder per feature.

The numbers make the problem concrete. Canvas has 633 source files, 350 unit-test files and 48 app-level
e2e specs. Three of those unit tests pass a thousand lines.

## Decision

**Unit tests stay beside the module. App-level e2e stays in the app's own repository. This repository
carries cross-process tests only.**

The reason is not convention. It is how these repositories are built:

- The apps release on independent tags. A test that lives in another repository tests whatever sibling
  checkout happens to exist, so a red build can mean "wrong branch" with no fix available locally.
- The shared packages are consumed as git dependencies, resolved from a tag. A test importing another
  repository's source would pull a second copy of the same module, and the two copies' types would
  diverge.
- Each package's test projects, environment and setup file belong to that package: Canvas runs four
  Vitest projects (graph, importer, desktop, canvas with jsdom), each pointing at its own tsconfig.
- A test beside its module moves, renames and dies with it in the same commit. A test in another
  repository cannot be changed by the person changing the module without a second pull request.

Cross-process tests are the exception because the thing under test is the boundary, not a module:
launching a binary, handing it a link, reading what it rendered. They may import at most a constant
(a path or a schema version), never behaviour.

### What earns a test

- **A rule**, stated as the test's name: "a revoked member cannot read the next epoch", "a saved view
  is a lens over the same cards". Not "commits" and not "calls the store".
- **A seam where being wrong is expensive**: a file write, a schema migration, permission gate, money,
  a parser reading input from outside.
- **A bug that shipped.** The regression test is the receipt.

A test that breaks on every refactor without a behaviour change is testing the implementation. Delete
it or move its assertion to where the behaviour actually lives.

### What a test may never do

- Assert that a mock was called where the question is what the user sees.
- Reimplement the function it tests in the test.
- Depend on another repository's source.
- Stay after the feature is deleted. Deleting a feature deletes its tests in the same commit; the M1
  pass removed about 130 of them this way.

### Size

A test file past roughly 400 lines is split at its next change, not in a sweep. The cost then lands on
the change that caused it, and the split is informed by what just moved. Three files are over the line
today and are recorded rather than churned: `apps/canvas/src/library/LibraryDrawer.test.tsx`,
`packages/graph/src/merge.test.ts` and `apps/canvas/src/cards/CardPanel.test.tsx`.

### Names

`*.test.ts(x)` for a unit test beside its module. `*.spec.ts` for a Playwright test in an `e2e/` folder.
The suffix tells a reader which runner will pick it up without opening it.

## Consequences

- There is no single place to see every test. The trade is that each test sits where the reader of the
  code will look for it, and the tree can be made legible by nesting rather than by moving files.
- Reviewing a change means reviewing its tests in the same diff, which is the point.
- suite-dev's suite is the only place a regression can cross a process boundary, so it stays small and
  deliberate.
