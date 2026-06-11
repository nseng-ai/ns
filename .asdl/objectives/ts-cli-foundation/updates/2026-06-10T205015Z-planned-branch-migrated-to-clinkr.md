# planned-branch migrated to clinkr; umbrella reconciliation verified satisfied

## Summary

`@asdl/planned-branch` now builds its command tree through `@asdl/clinkr`: a root `ClinkrGroup` (version, `--runtime` diagnostics) with a hidden `exec` subgroup hosting `create` and `load-plan`. The hand-rolled recursive argv parser and all inline help template literals are deleted; Zod request schemas drive the CLI surface (required options, an enum with a default, boolean flags, and an optional positional). Operation logic in the library modules and the package's `index.ts` exports are untouched.

The pre-clinkr machine contract is preserved via `legacyMachine`: all `--format json` success and failure bodies are byte-identical, as are exit codes, `-V`, and `--runtime`. Divergences are pinned explicitly in the scenario suite with the established `PINNED CLINKR SEMANTICS` / `PINNED QUIRK (clinkr-migration)` conventions: commander-generated help and usage-error bytes, `error:` human failure prefix, usage errors raw to stderr even under `--format json`, inline `--flag=value` acceptance, `--format human` acceptance, and the user-approved relaxation that `--include-content`/`--include-prompt` no longer require `--format json`. The hidden `exec` subgroup is omitted from top-level help (one node-runtime test assertion re-pinned accordingly).

Separately, the "Reconcile the umbrella" row was verified already satisfied: the umbrella's scaffold/clinkr rows cite `ts-cli-foundation` as their realization and record the package identity resolved as `@asdl/clinkr` + `@asdl/core`. No umbrella edits were required.

## Objective Impact

- Roadmap rows "Migrate `@asdl/planned-branch` to clinkr" and "Reconcile the umbrella `port-asdl-toolkit-to-typescript`" are complete; two CLI migrations remain (`asdl-dev`, then the `pr-address` shell).
- The core assumption — schema-first parameter generation hardens without per-CLI parser shims — gains its second data point: this migration needed **zero clinkr changes**, including for surface shapes `plans` did not exercise (required options, enum default, booleans, optional positional, file-writing side effect).
- Evidence: local branch diff against master (Graphite parent); planned-branch package suite, full TS workspace check/test, and the full `just` gate passed; manual smoke confirmed preserved JSON failure bytes.

## Follow-Ups

- `planned-branch` already uses Zod at the CLI boundary now, but the "Adopt Zod boundary validation" row's extractors (`extractPlannedBranchEvidence`, session-entry extraction) live below the CLI and remain open work.
- Next migration per roadmap order: `asdl-dev`, resolving the pi-ai streaming open question.
