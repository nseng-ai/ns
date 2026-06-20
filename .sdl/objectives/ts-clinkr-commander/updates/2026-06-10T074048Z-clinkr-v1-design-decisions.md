# Clinkr v1 design settled in grilling; legacy-output debt moved to umbrella ledger

## Summary

A full design grilling resolved every open branch of the `@asdl/clinkr` v1 design before implementation. Key decisions, now recorded durably in `objective.md` Scope:

- **Failure channel:** throw-based `ClinkrFailure` (sole throwable, `Error` subclass), dispatcher-converted to the failure variant — a deliberate port of Python clinkr's channel that supersedes this objective's original "errors-as-values, not exceptions" framing. `ClinkrExit` stays a pure returned union; failure variants are dispatcher-constructed only; unexpected throws propagate raw (Python parity).
- **Operation contract:** module-level `(ctx, request) => Promise<ClinkrExit<T>>` over a CLI-defined generic context; injectable `ClinkrIo` seam separate from the context; `run(argv, {context, io?})` returns the exit code, never calls `process.exit`.
- **CLI surface generation:** snake_case schema keys (Pydantic parity); every field a named option by default with explicit opt-in positionals via a schema-typed registration param spec; `.describe()` single-sources help; bounded v1 type vocabulary with `buildCli()`-time errors for unsupported shapes; Zod `parse` as final validator on the usage-error channel.
- **Output:** no renderer abstraction — one optional `renderHuman?: (data) => string` registration field with Python-parity indented-JSON default; dispatcher solely owns format dispatch.
- **Legacy machine output:** migrated commands preserve their current `{"success": ...}` JSON shapes and exit semantics via a deprecated-from-birth `legacyMachine?: (exit) => {body, exitCode}` hook, instead of adopting the parity envelope per command now. Usage-error and crash channels adopt clinkr semantics immediately.
- **Resolved by exploration:** `--json-schema` emits `{input_json_schema, output_json_schema}` absorbing the existing `pr-address` `z.toJSONSchema` pattern; the `asdl-dev` mixed flag-syntax question dissolved (commander supports both syntaxes natively); scenario-test helpers live at the `@asdl/clinkr/testing` subpath export.

The legacy-output preservation and snake_case-keys compromises were registered as end-of-migration debt in the umbrella objective's new `migration-debt.md` (created alongside an umbrella roadmap row requiring its burn-down before the umbrella closes), together with the Python-parity envelope itself as a third entry.

## Objective Impact

- Two of three open questions are resolved (test-helper location; envelope-redesign timing — now governed by the umbrella debt ledger). The `asdl-dev`/pi-ai streaming question stays open until that migration.
- The envelope completion criterion is softened to framework-level verification: clinkr's own unit tests prove the Python-parity envelope; migrated commands may carry ledger-tracked `legacyMachine` output until the umbrella's debt burn-down.
- The assumption that no consumer depended on hand-rolled output shapes was wrong (skills parse the current shapes); the materialized output-shape risk is resolved by the global preserve-now/kill-later policy rather than per-command choices.
- The scenario-pinning roadmap row gains a second purpose: pinning the exact legacy JSON shapes each `legacyMachine` hook must reproduce.
- Implementation of roadmap row 1 can start with no unresolved design decisions.

Evidence: design session on branch `add-ts-clinkr-commander-objective` (Graphite parent `pr-address-ts/roaster-style-followups`); umbrella ledger and roadmap edits are uncommitted local changes alongside this update. Codebase grounding: Python clinkr dispatcher catch sites (`asdl_core/clinkr/group.py`), default renderer (`rendering.py`), schema document builder (`json_schema.py`), existing `pr-address` Zod parity machinery, and the four CLIs' current flag surfaces.

## Follow-Ups

- Implement `@asdl/clinkr` v1 per the settled design (roadmap row 1).
- During implementation, verify Python clinkr's exact usage-error behavior under `--format json` and copy it.
- When migrating each CLI, grep `skills/` for its `--format json` consumers to confirm `legacyMachine` coverage is complete.
- Record `@asdl/clinkr` as the umbrella's package-identity answer when executing the umbrella-update roadmap row (still open).
