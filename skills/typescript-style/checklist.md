# TypeScript Style — Checklist

Run before declaring TypeScript work done, or use as the rubric for review. Treat project-local tooling
and conventions as the baseline; this checklist catches design drift.

## Language and imports

- [ ] New code avoids `enum`, `namespace`/`module`, parameter properties, `import =`, and `export =`
      unless the project intentionally uses TS emit features.
- [ ] Closed sets are string-literal unions or literal arrays shared with runtime validation.
- [ ] `any` is absent except where a library forces it, and forced `any` is isolated/commented.
- [ ] Untyped external input starts as `unknown` and is narrowed by guards.
- [ ] Type imports are top-level; runtime lazy imports are used only for runtime reasons.
- [ ] Relative import suffixes match the package convention.

## Types

- [ ] Object shapes/contracts use `interface`; unions/functions/aliases use `type`.
- [ ] Runtime variants are discriminated unions on a stable domain field.
- [ ] Extensible registries use `Known* | (string & {})` when custom identifiers are allowed.
- [ ] Object literals use `satisfies` or `as const satisfies T` instead of broad casts.
- [ ] Generic tags are carried through APIs so callers only see legal config for the selected tag.
- [ ] State machines are explicit unions, not scattered booleans.

## Architecture

- [ ] Optional behavior is outside the minimal core unless the task requires it in core.
- [ ] Code sits in the layer that owns it; no UI/backend/domain boundary leaks.
- [ ] Backend-specific behavior is behind adapters, capability flags, or translation functions.
- [ ] Runtime sniffing and substring checks are not scattered through call sites.
- [ ] Collaborators are injected through interfaces/options instead of hidden globals.
- [ ] Generic-to-concrete casts happen once behind a runtime assertion.
- [ ] Planning is separated from execution where the operation is multi-step or side-effectful.

## Errors and cancellation

- [ ] Expected async/system failures are returned as data, not thrown for callers to discover.
- [ ] Fallible synchronous logic uses `Result<T,E>` or an equivalent discriminated shape.
- [ ] Failures carry enough structure to act on: code/reason/message/cause as appropriate.
- [ ] `AbortSignal` is threaded through long-running work and cancellation is distinguished from error.
- [ ] Plugin/listener/handler failures are isolated unless crash-on-failure is the contract.
- [ ] Throws are reserved for programmer errors, impossible states, and broken invariants.

## Functions, state, naming

- [ ] Logic is in pure functions; classes coordinate lifecycle/state.
- [ ] One-use helpers are inlined unless extraction improves readability.
- [ ] No tiny new module exists only to host one trivial helper.
- [ ] API boundaries copy caller-owned or returned mutable data.
- [ ] Names follow role conventions: `create*`, `build*`, `prepare*`, `execute*`, `finalize*`,
      `normalize*`, `is*`.
- [ ] Public package barrels use curated named exports and `export type {}`.

## Process and hygiene

- [ ] Generated files were not hand-edited.
- [ ] TODOs are absent or match the repository's tracking convention.
- [ ] Comments explain why, contracts, or edge cases rather than mechanics.
- [ ] Review/commit text is direct and follows the repository's convention.
- [ ] Formatting, linting, and tests relevant to the touched package pass.

## Coherence test

- [ ] Do the types tell the truth end to end, without laundering through `any` or premature `unknown`?
- [ ] Is there one lifecycle/model for the concept, not parallel mechanisms?
- [ ] Is the abstraction smaller than the problem it solves?
- [ ] Can the author explain every line and how it interacts with the rest of the system?
