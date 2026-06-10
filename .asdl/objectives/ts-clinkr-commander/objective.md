# TS clinkr on commander for the TypeScript CLIs

## Thesis

The four TypeScript CLIs (`@asdl/plans`, `@asdl/planned-branch`, `asdl-dev`, `@asdl/pr-address`) each hand-roll argv parsing and maintain ~15 hardcoded help/usage template literals between them, with no shared utility and already-visible drift (flag syntax support differs across packages; `pr-address` help hardcodes its operation list as prose). Build `@asdl/clinkr` — a schema-first command framework on commander — and migrate all four CLIs onto it, so the request schema is the single source of truth for parsing, validation, help, and machine output.

This is a capability subobjective of `port-asdl-toolkit-to-typescript`. It realizes the umbrella's "Begin the internal JS/TS clinkr foundation incrementally" roadmap row and resolves its open question about clinkr package identity. The four duplicated parsers are the "repeated seams become real" evidence the umbrella required before committing to a shared framework.

## Scope

- A new workspace package `@asdl/clinkr` at `ts/packages/clinkr`, repo-private (no npm publication in this objective).
- Schema-first design: each operation declares a Zod request schema; clinkr generates commander options/arguments from it. Commander is an internal parsing engine — migrated CLIs do not import commander directly, and `@commander-js/extra-typings` is not used (the clinkr layer owns typing).
- Minimal, need-driven v1 feature set (design settled in the 2026-06-10 grilling; see the corresponding Semantic Update):
  - `ClinkrExit` as a pure returned discriminated union with three-way exit status: ok (0), negative (1, "ran fine, answer is no"), failure (2, with `error_type`). Failures are signaled by throwing `ClinkrFailure` (an `Error` subclass carrying `error_type`/`message`); the dispatcher converts it to the failure variant. Operation bodies never construct the failure variant directly; mid-body negative exits use early returns. This deliberately ports Python clinkr's throw channel and supersedes this objective's original "errors-as-values, not exceptions" framing. Unexpected (non-`ClinkrFailure`) throws propagate raw — no envelope, stack trace, exit 1 — matching Python.
  - Operations are module-level `(ctx, request) => Promise<ClinkrExit<T>>` functions over a CLI-defined generic context (`ClinkrGroup<TContext>`); each CLI's existing deps object becomes its context. Clinkr io (`{stdout, stderr}` writers) is a separate injectable seam: `group.run(argv, {context, io?})` returns the exit code and never calls `process.exit`; commander is contained via `exitOverride()`/`configureOutput()`.
  - Schema surface: request/result Zod schemas use snake_case keys (Pydantic-parity; see umbrella `migration-debt.md` for the post-migration casing conversion). Every field maps to a named `--kebab-case` option by default (required iff non-optional with no default; booleans become flags); positionals are explicit opt-in via a registration-time param spec typed against the schema keys; `.describe()` single-sources flag help and JSON-schema descriptions. v1 type vocabulary: string, number/int, boolean, enum, array-of-string (repeatable), `.optional()`/`.default()`; anything else is a `buildCli()`-time error. Zod `parse` is the final validator; validation failures use the usage-error channel (exit 2, stderr), even in json mode.
  - `--format human|json` dispatch with a machine envelope at exact parity with Python clinkr: `{"exit_code", "data" | "message" | "error_type"}`. Human rendering is a single optional registration field `renderHuman?: (data: T) => string` (pure string; dispatcher writes it); absent → Python-parity indented-JSON default. The dispatcher solely owns format dispatch — no renderer abstraction beyond this field.
  - Per-command legacy machine-output escape hatch, deprecated from birth: `legacyMachine?: (exit: ClinkrExit<T>) => { body, exitCode, serialization? }`. When present, `--format json` routes the whole exit union through it so migrated commands keep their current `{"success": ...}` shapes and exit-code semantics; legacy bodies can choose indented envelope-style JSON or compact `JSON.stringify` bytes. Usage-error and crash channels adopt clinkr semantics immediately. Kill tracked in the umbrella's `migration-debt.md`.
  - Eager `--json-schema` flag emitting `{"input_json_schema", "output_json_schema"}` via `z.toJSONSchema`, absorbing the pattern `pr-address` already implements (including print-and-exit-0 before required-argument validation).
  - Hidden `exec` subgroup support matching the repo's skill-invoked-command convention.
  - Root-group `--version`/`-V` and `--runtime` support for CLIs that expose package version or TypeScript runtime diagnostics.
  - Generated help at every level, replacing all hardcoded help functions. Both `--flag value` and `--flag=value` syntaxes work everywhere (commander native behavior), and no generated `help` subcommand is exposed.
  - Scenario-test helpers (in-process invocation through the io seam, envelope assertions) ship as the `@asdl/clinkr/testing` subpath export.
- Migration of all four CLIs, smallest-first: `plans` → `planned-branch` → `asdl-dev` → `pr-address` last.
- Scenario-test coverage for each migrated CLI per the repo's CLI scenario testing convention (Vitest).

## Non-Goals

- No full parity with Python clinkr in v1: markdown renderers, command aliases, JSON-input loading (`--input`/file/stdin), and `Ensure`/`NonIdealState` idioms are out until a TS CLI needs them.
- No TS-native envelope redesign — exact Python-parity envelope is the v1 contract (redesign is parked).
- No npm publication or public API commitment for `@asdl/clinkr`.
- No ownership of `pr-address` operation semantics or Python-fallback retirement: this objective owns clinkr adoption of the `pr-address` CLI shell; operation behavior and cutover remain with `pr-address-typescript-port`.
- No user-facing command contract redesign during migration — existing flags, exit codes, and outputs are preserved unless the divergence is itself the bug being fixed, in which case the change is called out explicitly.

## Completion Criteria

- `@asdl/clinkr` exists with unit tests covering the exit union, format dispatch, schema-derived parameter generation, `--json-schema`, hidden subgroups, and the `legacyMachine` escape hatch.
- All four CLIs build their command trees through clinkr; no hand-rolled argv loops or hardcoded help/usage template literals remain under `ts/packages/*/src/`.
- The canonical machine envelope is verified against the Python clinkr envelope shape (same keys, same 0/1/2 semantics) at the framework level by clinkr's own unit tests. Migrated commands may keep their pre-migration `--format json` shapes and exit semantics through `legacyMachine`; that debt is tracked in `port-asdl-toolkit-to-typescript/migration-debt.md` and is killed at the end of the overall TS migration, not in this objective.
- The `pr-address` migration preserves its legacy-Python fallback dispatch behavior.
- The umbrella objective (`port-asdl-toolkit-to-typescript`) is updated: the clinkr roadmap row progressed and the package-identity open question recorded as resolved (`@asdl/clinkr`).

## Assumptions and Risks

Assumptions:

- Commander's programmatic API can host schema-first generation (building options/arguments from Zod schema fields) without fighting the framework; Next.js's commander adoption validates commander at scale but not this generation pattern specifically. De-risked (2026-06-10, v1 build and `plans` migration): generation worked without fighting commander — `exitOverride()`/`configureOutput()` contain it, `addCommand(cmd, {hidden})` covers hidden subgroups, `Option.attributeName()` gives the kebab→camel reverse map, and zod stays the sole required/default enforcer (commander declares everything optional, keeping the usage-error channel uniform and `--json-schema` eager). Click-parity bare group help is handled by clinkr before commander parsing, so bare groups print help to stdout/exit 0 while commander's unknown-command errors stay intact; like click, there is no `help` subcommand.
- Zod-native JSON Schema generation is sufficient for `--json-schema` parity with the Pydantic-derived documents. Substantially de-risked: `pr-address` already emits `{input_json_schema, output_json_schema}` via `z.toJSONSchema` against a structural parity comparator; clinkr v1 now emits through the same `z.toJSONSchema` path (`io: "input"`/`"output"`).
- The four CLIs' current flag surfaces are simple enough to express through generated parameters; none require bespoke parsing that the schema cannot describe. Still active; the settled v1 type vocabulary (string/number/boolean/enum/string-array + optional/default) was surveyed against all four CLIs.
- Revised (2026-06-10): the original assumption that no consumer depends on a hand-rolled output shape conflicting with the parity envelope was wrong — skills parse the current `{"success": ...}` shapes. Resolution: migrated commands preserve legacy shapes via `legacyMachine`; uniform envelope adoption is deferred to the umbrella's end-of-migration debt burn-down.

Risks:

- Schema-first parameter generation could overfit to the first migrated CLI; hardening across all four migrations is the mitigation, with `planned-branch`, `asdl-dev`, and `pr-address` (fallback dispatch) as remaining stress cases. Partially de-risked by the `plans` migration: the first CLI migrated without per-CLI parser shims, and the clinkr-side additions (root version/runtime and compact legacy serialization) are reusable by the remaining migrations. The `asdl-dev` mixed `--flag=value` / `--flag value` syntax concern dissolved — commander supports both natively, so clinkr offers both globally.
- `pr-address` work happens while sibling objectives (`pr-address-typescript-port`, `pr-address-ts-thermo-review-followups`) are active on the same package; uncoordinated edits could conflict. Sequencing `pr-address` last reduces but does not remove this.
- Materialized and resolved (2026-06-10): existing TS CLI output shapes do differ from the parity envelope. The per-command decision came out as a single global policy — preserve legacy shapes now via the `legacyMachine` hook, kill at end of the overall TS migration (umbrella `migration-debt.md` entry 1), at which point each command's negative-vs-failure classification is made deliberately and dependent skills are updated in the same sweep.
- If commander's model cannot express something a CLI needs, the clinkr abstraction must absorb it so migrated CLIs stay insulated from the engine choice. First instance absorbed in v1 (bare-group help behavior); the pattern holds so far.

## Open Questions

- Do `asdl-dev`'s commands that depend on `@earendil-works/pi-ai` / `pi-coding-agent` need anything beyond the v1 feature set (e.g., streaming output that resists the envelope model)? Stays open until the `asdl-dev` migration; if a streaming need appears, it gets its own escape hatch rather than reshaping the renderer contract.

Resolved (2026-06-10 design grilling):

- Scenario-test helper location → the `@asdl/clinkr/testing` subpath export; no separate package unless the helpers ever grow deps clinkr should not carry.
- TS-native envelope redesign timing → governed by the umbrella's `migration-debt.md` (entry 3): revisit at the end-of-migration debt burn-down, after all four CLIs are migrated and Python clinkr is no longer authoritative.
