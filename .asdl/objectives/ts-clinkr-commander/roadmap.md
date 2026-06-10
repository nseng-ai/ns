# Roadmap

## Work

- [ ] Build `@asdl/clinkr` v1 at `ts/packages/clinkr`.
  - `ClinkrExit` discriminated union (ok/negative/failure, exit codes 0/1/2), schema-first parameter generation from Zod request schemas, `--format human|json` dispatch with the Python-parity machine envelope, eager `--json-schema`, hidden `exec` subgroup support, generated help.
  - Design settled (2026-06-10 grilling; details in `objective.md` Scope): throw-based `ClinkrFailure` as the sole failure channel; `ClinkrGroup<TContext>` with module-level `(ctx, request)` operations; injectable `ClinkrIo` seam with `run(argv, {context, io?})` → exit code and no `process.exit`; snake_case schema keys; all-fields-are-options inference with opt-in positionals via a schema-typed param spec; bounded v1 type vocabulary with `buildCli()`-time errors; `renderHuman?: (data) => string` with indented-JSON default; `legacyMachine` escape hatch; `@asdl/clinkr/testing` subpath export.
  - Evidence: unit tests covering each v1 feature pass.
- [ ] Pin current CLI behavior with scenario tests where coverage is missing.
  - Each of the four CLIs needs enough scenario coverage (flags, exit codes, output shapes, help invocations) that the migrations are behavior-preserving by evidence, not by inspection.
  - These tests also pin the exact legacy `--format json` shapes that each command's `legacyMachine` hook must reproduce after migration.
- [ ] Migrate `@asdl/plans` to clinkr.
  - First and smallest migration; deletes its hand-rolled parser and five help functions. Expect clinkr API corrections here — feed them back before the next migration.
- [ ] Migrate `@asdl/planned-branch` to clinkr.
- [ ] Migrate `asdl-dev` to clinkr.
  - The flag-syntax question is resolved: commander natively supports both `--flag=value` and `--flag value`, so clinkr offers both globally with no normalization layer. Remaining stress here is the open question about pi-ai-dependent commands (streaming vs the envelope model).
- [ ] Migrate the `@asdl/pr-address` CLI shell to clinkr, preserving legacy-Python fallback dispatch.
  - Coordinate with `pr-address-typescript-port` and `pr-address-ts-thermo-review-followups`; this objective owns only the CLI shell, not operation semantics or Python retirement.
- [ ] Update the umbrella objective `port-asdl-toolkit-to-typescript`.
  - Progress its clinkr roadmap row, record `@asdl/clinkr` as the answer to its package-identity open question, and note ledger impact.

## Parked

- TS-native machine envelope redesign (explicitly deferred in favor of exact Python parity; revisit timing now governed by the umbrella's `migration-debt.md` entry 3 — end-of-migration debt burn-down).
- Uniform envelope adoption + per-command negative/failure classification, and snake_case → idiomatic-TS schema-key conversion: both are end-of-migration debt owned by the umbrella (`port-asdl-toolkit-to-typescript/migration-debt.md` entries 1 and 2), not work for this objective.
- Python clinkr features without a current TS consumer: markdown renderers, command aliases, JSON-input loading, `Ensure`/`NonIdealState` idioms, context-factory machinery beyond what the four CLIs need.
- npm publication and public API commitment for `@asdl/clinkr`.
- Adopting clinkr in future capability ports (`brmem`, `handoff`, `objective`, …) — sequencing belongs to the umbrella objective.
