# Full reevaluation and rewrite of the Objective record

## Summary

A from-scratch reevaluation (live Pi registration-site inventory + source reads + sibling-objective status checks) found the record stale on several axes since the 2026-06-09 sweep, so `objective.md`, `roadmap.md`, and `parity-table.md` were rewritten in place. The drift found:

- **Sibling closures**: `planned-branch-ts-cli` and `asdl-dev-submit-consolidation` are both closed, so the parity table's "Sibling-owned" section and the objective's deferral language no longer described reality. `cmux-extension-consolidation` also closed; `asdl-core-ts` + `ts-clinkr-commander` consolidated into the open `ts-cli-foundation` (the `@asdl/clinkr` + `@asdl/core` substrate for new shared CLIs).
- **New/renamed Pi surfaces accumulated unlisted**: the `/model:*` shortcut family (`fable`, `spud`, `gpt-mini`, `haiku`, `opus`), `/ccc:claude-plan-tab`, CLI-bridged `/code:pr-regen` (backed by the new `asdl-dev pr-regen`), and the `/planned-branch:up-and-impl` → `/planned-branch:upstack-impl-session` rename. This is the **fourth materialization** of the parity-table-rot risk.
- **Open-row reality drift**: stack-landing orchestration moved from pi-extensions into `@asdl/ccc` (`land.ts` + 12 `land-stack/` modules; Graphite SQLite-metadata topology replacing `gt log` parsing; fork-violation detection, backup refs, pre-delete child guards; test-backed) — but `@asdl/ccc` has no bin and no skill, so the row remains a gap by this Objective's FULL definition. `autobranch` is similarly factored (13 modules, tested) and its stale hardcoded-slug-model note was removed (fixed by the completed provider-defaults row). The land row's Python-vs-TS open question was resolved by events: TypeScript on `ts-cli-foundation`.

## Objective Impact

All three living documents rewritten; no scope was closed or archived.

- `objective.md`: thesis updated from "primitives shared, orchestration trapped in pi-extensions" to "orchestration consolidated in `@asdl/ccc`; the gap is the missing CLI entry point + skill"; ts-cli-foundation named as substrate; sibling deferrals removed (umbrella now owns all remaining gaps); completion criteria drop the sibling carve-out; assumptions/risks rewritten (validated assumptions marked or dropped; new "ccc cores are extraction-ready" assumption; new "shared TS ≠ shared CLI" masquerade risk; rot risk updated to four materializations); resolved Python-vs-TS question removed and a new ccc-CLI-surface question added.
- `roadmap.md`: the six completed rows kept as accurate history; land / cmux dispatch / autobranch rows reframed from "extract orchestration" to "give the existing tested ccc core a clinkr-based CLI entry + skill"; command-output summaries row gains the ts-cli-foundation substrate note.
- `parity-table.md`: full refresh to 2026-06-10. Added `/code:pr-regen` (FULL). Folded former sibling rows into FULL with provenance (`/code:submit`, `/plans:write`, `write_saved_plan_file`, `/planned-branch:create`, `/planned-branch:impl`). Added WAIVED rows: the `/model:*` family (one row; fallback = each harness's own model selection), `/ccc:claude-plan-tab` (fallback = plans/planned-branch skills + manual `claude` plan mode), `/plans:grill-and-write` (was sibling-WAIVED), and the adopted, renamed `/planned-branch:upstack-impl-session` (fallback = `planned-branch-create` + `planned-branch-impl` skills). Gap-row notes updated to the ccc-core reality. The "Sibling-owned" section was deleted.

Two user decisions recorded: (1) `/planned-branch:upstack-impl-session` is adopted into this umbrella and WAIVED — its value is Pi/cmux session orchestration with the create/impl skills as the agent-neutral fallback; (2) the land / cmux dispatch / autobranch push-downs stay committed scope, reframed as CLI entry + skill over the existing tested `@asdl/ccc` cores on ts-cli-foundation.

## Follow-Ups

- Parity-table rot has now materialized four times; diff-scoped review at change time remains the weak point. Consider prioritizing the parked CI parity gate if a fifth materialization occurs.
- When the push-down rows reach implementation, resolve the new open question on the ccc CLI surface (one `ccc` bin vs commands on `asdl-dev` vs per-workflow bins) in coordination with `ts-cli-foundation`.
