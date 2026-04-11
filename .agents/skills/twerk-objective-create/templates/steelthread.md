# Steelthread (vertical slice) roadmap

## What it is

Item 1 is a **minimal vertical slice proving the concept works end-to-end** for
one concrete case — stubs, hardcoded values, and a single happy-path input are
all fine. Later items deepen each layer: more cases, real data, error handling,
edge cases, polish.

## When to use it

- The objective spans multiple layers or components (data → gateway → service →
  CLI, or backend → API → UI).
- Proving integration early is valuable — you want to catch "the pieces don't
  fit together" problems on day one, not after every layer is polished.
- There is at least one concrete end-to-end case you can carry through the
  system as the first slice.

## When NOT to use it

- The work is single-layer (an isolated refactor, a documentation pass, a
  migration inside one module). There's no integration to prove.
- There is no end-to-end path yet because the substrate doesn't exist — use
  `layered.md` instead.
- The work is a broad mechanical refactor of existing code where each step is
  independently safe — use `incremental-refactor.md` instead.

## Item 1 guidance

The first item must be demoable end-to-end. Acceptable shortcuts: hardcoded
inputs, stubbed external calls, a single happy-path case, skipped error
handling, no tests beyond a smoke test. Not acceptable: item 1 that touches
only one layer and claims "integration comes later".

## Example

Objective: "Add a `PlanGateway.get_plan(plan_id)` method end-to-end."

1. End-to-end slice: a CLI command `twerk plan show <id>` returns a single
   hardcoded plan through a real `PlanGateway.get_plan` that reads from a
   stub JSON file. Smoke test covers the happy path.
2. Replace the stub JSON reader with real GitHub issue fetching.
3. Handle not-found and permission errors; add error-case tests.
4. Add list/filter operations on top of the working single-fetch path.
