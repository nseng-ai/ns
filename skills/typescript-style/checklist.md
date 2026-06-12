# TypeScript Style — Checklist

Run before declaring TypeScript work done, or use as the rubric for review. Treat project-local tooling
and conventions as the baseline; this checklist catches design drift.

## Language and imports

- [ ] New code is erasable: it avoids `enum`, `namespace`/`module`, parameter properties, `import =`,
      and `export =`.
- [ ] Closed sets are string-literal unions or literal arrays shared with runtime validation.
- [ ] `any` is absent from ordinary code; any library-forced `any` is isolated, commented, and not
      exposed in project-owned types.
- [ ] Untyped external input starts as `unknown` and is parsed/narrowed by Zod schemas or guards.
- [ ] Type imports are top-level; runtime lazy imports are used only for runtime reasons.
- [ ] Relative import suffixes match the package convention.
- [ ] Cross-package imports use declared package exports, not undeclared `src/` deep imports; subpath
      exports are used when they preserve useful grep-able paths.

## Types

- [ ] Object shapes/contracts use `interface`; unions/functions/aliases use `type`.
- [ ] Runtime variants are discriminated unions, using `type` by default and domain/external tags only
      when they fit the model.
- [ ] Extensible registries use `Known* | (string & {})` when custom identifiers are allowed.
- [ ] Object literals use `satisfies` or `as const satisfies T` instead of broad casts.
- [ ] External/HTTP/model/tool boundaries parse input with Zod schemas, and static types use `z.infer`
      rather than hand-written mirror types.
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

- [ ] Top-level/module logic uses `function` declarations; arrows are reserved for callbacks, handlers,
      inline higher-order expressions, and expression-position factories.
- [ ] Logic is in pure functions; classes coordinate lifecycle/state.
- [ ] Guard clauses handle preconditions and edge cases before the main path.
- [ ] `??` / `?.` are used for nullish semantics; `||` is not used when valid falsy values must survive.
- [ ] Functions with several or optional inputs use a named `*Options` object instead of long positional
      parameter lists.
- [ ] One-use helpers are inlined unless extraction improves readability.
- [ ] No tiny new module exists only to host one trivial helper.
- [ ] Inputs, returned values, and shared/public state are not mutated in place; public contracts use
      `readonly` / `Readonly*` where the callee must not mutate.
- [ ] Names follow role conventions: `create*`, `build*`, `prepare*`, `execute*`, `finalize*`,
      `normalize*`, `is*`.
- [ ] Boolean names use `is*`/`has*`/`should*`/`can*`; type guards are named `isX`.
- [ ] Measured constants include units, such as `TIMEOUT_MS` or `MAX_BYTES`.
- [ ] Zod schemas use `<noun>Schema` names.
- [ ] Public package barrels use curated named exports and `export type {}`.

## Process and hygiene

- [ ] Generated files were not hand-edited.
- [ ] TODOs are absent or match the repository's tracking convention.
- [ ] Comments explain why, contracts, or edge cases rather than mechanics.
- [ ] `@ts-expect-error` has a reason; `@ts-ignore` is absent.
- [ ] Empty catches explain why ignoring the failure is safe.
- [ ] Repeated suppressions are treated as a type/design smell, not normal style.
- [ ] Review/commit text is direct and follows the repository's convention.
- [ ] Formatting, linting, and tests relevant to the touched package pass.

## Coherence test

- [ ] Do the types tell the truth end to end, without laundering through `any` or premature `unknown`?
- [ ] Is there one lifecycle/model for the concept, not parallel mechanisms?
- [ ] Is the abstraction smaller than the problem it solves?
- [ ] Can the author explain every line and how it interacts with the rest of the system?
