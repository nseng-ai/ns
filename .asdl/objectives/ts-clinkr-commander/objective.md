# TS clinkr on commander for the TypeScript CLIs

## Thesis

The four TypeScript CLIs (`@asdl/plans`, `@asdl/planned-branch`, `asdl-dev`, `@asdl/pr-address`) each hand-roll argv parsing and maintain ~15 hardcoded help/usage template literals between them, with no shared utility and already-visible drift (flag syntax support differs across packages; `pr-address` help hardcodes its operation list as prose). Build `@asdl/clinkr` — a schema-first command framework on commander — and migrate all four CLIs onto it, so the request schema is the single source of truth for parsing, validation, help, and machine output.

This is a capability subobjective of `port-asdl-toolkit-to-typescript`. It realizes the umbrella's "Begin the internal JS/TS clinkr foundation incrementally" roadmap row and resolves its open question about clinkr package identity. The four duplicated parsers are the "repeated seams become real" evidence the umbrella required before committing to a shared framework.

## Scope

- A new workspace package `@asdl/clinkr` at `ts/packages/clinkr`, repo-private (no npm publication in this objective).
- Schema-first design: each operation declares a Zod request schema; clinkr generates commander options/arguments from it. Commander is an internal parsing engine — migrated CLIs do not import commander directly, and `@commander-js/extra-typings` is not used (the clinkr layer owns typing).
- Minimal, need-driven v1 feature set:
  - `ClinkrExit` as a discriminated union with three-way exit status: ok (0), negative (1, "ran fine, answer is no"), failure (2, with `error_type`) — errors-as-values per `typescript-style`, not exceptions.
  - `--format human|json` dispatch with a machine envelope at exact parity with Python clinkr: `{"exit_code", "data" | "message" | "error_type"}`.
  - Eager `--json-schema` flag emitting the combined input/output JSON Schema document derived from the Zod schemas.
  - Hidden `exec` subgroup support matching the repo's skill-invoked-command convention.
  - Generated help at every level, replacing all hardcoded help functions.
- Migration of all four CLIs, smallest-first: `plans` → `planned-branch` → `asdl-dev` → `pr-address` last.
- Scenario-test coverage for each migrated CLI per the repo's CLI scenario testing convention (Vitest).

## Non-Goals

- No full parity with Python clinkr in v1: markdown renderers, command aliases, JSON-input loading (`--input`/file/stdin), and `Ensure`/`NonIdealState` idioms are out until a TS CLI needs them.
- No TS-native envelope redesign — exact Python-parity envelope is the v1 contract (redesign is parked).
- No npm publication or public API commitment for `@asdl/clinkr`.
- No ownership of `pr-address` operation semantics or Python-fallback retirement: this objective owns clinkr adoption of the `pr-address` CLI shell; operation behavior and cutover remain with `pr-address-typescript-port`.
- No user-facing command contract redesign during migration — existing flags, exit codes, and outputs are preserved unless the divergence is itself the bug being fixed, in which case the change is called out explicitly.

## Completion Criteria

- `@asdl/clinkr` exists with unit tests covering the exit union, format dispatch, schema-derived parameter generation, `--json-schema`, and hidden subgroups.
- All four CLIs build their command trees through clinkr; no hand-rolled argv loops or hardcoded help/usage template literals remain under `ts/packages/*/src/`.
- Machine envelope output verified against the Python clinkr envelope shape (same keys, same 0/1/2 semantics).
- The `pr-address` migration preserves its legacy-Python fallback dispatch behavior.
- The umbrella objective (`port-asdl-toolkit-to-typescript`) is updated: the clinkr roadmap row progressed and the package-identity open question recorded as resolved (`@asdl/clinkr`).

## Assumptions and Risks

Assumptions:

- Commander's programmatic API can host schema-first generation (building options/arguments from Zod schema fields) without fighting the framework; Next.js's commander adoption validates commander at scale but not this generation pattern specifically.
- Zod-native JSON Schema generation is sufficient for `--json-schema` parity with the Pydantic-derived documents.
- The four CLIs' current flag surfaces are simple enough to express through generated parameters; none require bespoke parsing that the schema cannot describe.
- Skills and agents consuming these CLIs are served best by the Python-parity envelope; no consumer depends on a current hand-rolled output shape that conflicts with it.

Risks:

- Schema-first parameter generation could overfit to the first migrated CLI; hardening across all four migrations is the mitigation, with `asdl-dev` (mixed `--flag=value` / `--flag value` syntax) and `pr-address` (fallback dispatch) as the stress cases.
- `pr-address` work happens while sibling objectives (`pr-address-typescript-port`, `pr-address-ts-thermo-review-followups`) are active on the same package; uncoordinated edits could conflict. Sequencing `pr-address` last reduces but does not remove this.
- Existing TS CLI output shapes may differ from the parity envelope; where they conflict, a per-command decision (preserve vs adopt envelope) is needed and dependent skills must be updated in the same change.
- If commander's model cannot express something a CLI needs, the clinkr abstraction must absorb it so migrated CLIs stay insulated from the engine choice.

## Open Questions

- Do `asdl-dev`'s commands that depend on `@earendil-works/pi-ai` / `pi-coding-agent` need anything beyond the v1 feature set (e.g., streaming output that resists the envelope model)?
- Where should shared scenario-test helpers for clinkr-based CLIs live — inside `@asdl/clinkr` as a test-support export, or a separate package?
- When should the parked TS-native envelope redesign be revisited — after all four migrations, or only when a concrete consumer need appears?
