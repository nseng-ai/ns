# Overlap note: `payload-reference-generalization` objective may trigger the JSON-input non-goal

## Summary

A new standalone objective, `payload-reference-generalization`, was created from a thermo-review of pr-address's reference-backed payload inputs (`--payload-file`, `--prep-reference`, `--stack-plan-reference`, `--current-prep-reference`). It consolidates pr-address's payload/reference resolution into a declarative per-operation payload spec (`loadOperationPayload({ commandName, payloadSchema, fields })`) that is explicitly clinkr-shaped. It was created deliberately while this record is open; records get reconciled after all lines merge to master.

## Reconciliation points

- **JSON-input loading is a v1 non-goal "until a TS CLI needs them" — this is that need.** pr-address (the last planned migration) now has a payload-management layer with rules clinkr would otherwise have to reinvent: payload from inline option / file / stdin with single-source rejection; per-field artifact references substituting for embedded payload keys (XOR policy); payload optionality when every field is reference-backed; structural-vs-deep reference validation with one diagnostics rule. When the pr-address migration starts, decide whether `loadOperationPayload` lifts into clinkr as first-class payload support or stays package-local.
- **Convention alignment now, port later.** The new objective commits to keeping its spec compatible with clinkr's registration model (snake_case schema keys, derived `--kebab-case` options, `--<key>-reference` naming) so the eventual lift is a move, not a rewrite. If clinkr's v1 conventions change, that objective's design constraint changes with them.
- **Schema-as-single-source-of-truth convergence.** The new objective parks "spec generates option allowlist + `--json-schema` request document" (#5b) pending reconciliation; clinkr already generates options and JSON-schema docs from request schemas. If pr-address migrates onto clinkr before #5b is built, #5b should dissolve into the migration instead of landing standalone.

## Objective Impact

- No roadmap rows change state. An open question pointing at `payload-reference-generalization` was added to `objective.md`.
