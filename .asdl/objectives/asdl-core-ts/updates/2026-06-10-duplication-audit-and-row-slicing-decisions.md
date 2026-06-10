# Duplication audit refines row slicing; brmem-cli deferred behind exec runtime

## Summary

A read-only duplication audit of the TS workspace, run while exploring the first roadmap row, corrected the duplication map and produced two decisions:

- **npm name resolved: `@asdl/core`.** Six of seven workspace packages are `@asdl/*`-scoped; `asdl-dev` is the lone unscoped outlier. Packaging is cheap: packages export raw TS source (`"./src/index.ts"`, no build step), and `pi-extension-runtime` already demonstrates the subpath-export pattern (`/brmem-cli`, `/cmux/primitives`).
- **The pi side already single-sources.** The `ccc` and `pi-extensions` copies of `cmux/primitives.ts` and `brmem-cli.ts` are re-export shims onto `pi-extension-runtime`, not duplicates. Only the `plans`/`planned-branch` `primitives.ts` pair is byte-identical; the brmem-cli pair (~220 lines each) is near-identical, differing in formatting and import source.
- **Hidden row-1→row-2 dependency.** Both `brmem-cli.ts` copies import an exec-result cluster (`ExecResult`, `PiExecResultLike`, `normalizeExecResult`, `formatCommand`, `formatOutputSection`, `tailText`) that is itself duplicated between `@asdl/plans` and `pi-extension-runtime/src/command-runtime.ts`. Single-sourcing brmem-cli therefore requires a home for that cluster first.
- **Decision: defer brmem-cli consolidation behind the exec runtime.** Rather than dragging the exec-result cluster into the seeding row, brmem-cli gets its own roadmap row after the unified exec runtime lands. The seeding row's evidence criterion no longer includes brmem-cli.
- **Decision: pi-specific code does not enter asdl-core.** `stringField`, `TextResult`, and other cmux-flavored helpers stay in `pi-extension-runtime`; core's `primitives` hosts only the common `isRecord`/`formatErrorMessage` pair. Recorded as a Non-Goal.

## Objective Impact

- Roadmap reordered: seeding row narrowed (no brmem-cli), exec-runtime row explicitly owns the exec-result cluster, and a new dedicated brmem-cli row follows it.
- Open Question on npm naming resolved to `@asdl/core`.
- Non-Goals gained the pi-specific-code exclusion.
- "Pi-side churn" risk partially de-risked for the utility layer (shims centralize the migration); envelope and asdl-dev public-surface blast radius remains open.
- The "exact-duplicate" assumption revised: framing was partly overstated; consolidation on the pi side means retargeting one hub.

Evidence: read-only audit of the working tree on branch `add-asdl-core-workspace-package` (diffs of the primitives/brmem-cli copies; package.json name survey; import inspection of both brmem-cli copies). No implementation has landed; all roadmap rows remain `[ ]`.

## Follow-Ups

- When implementing the exec-runtime row, confirm the unioned runtime's exec-result types remain compatible with brmem-cli's structural `BrmemExecGateway` so the follow-on row stays a pure move.
- Coordinate the CLI scaffolding row with `pr-address-ts-thermo-review-followups` so pr-address's divergent `ParseResult` converges onto asdl-core rather than a package-local parser.
