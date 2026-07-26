# Autoobjective conversion, ns:agents naming decision, and derisking audit

## Summary

The Objective was reshaped into an autoobjective (ADR 0022) after a derisking audit and an explicit decision round with the user. `objective.md` gained `## Definition of Progress` and `## Runner Policy` sections meeting the autonomy-designed minimum, and the roadmap rows were rewritten as runner-executable slices with row-level `Policy:` prose.

Decisions taken (2026-07-06):

- **Command surface naming.** The consolidated Pi command surface becomes `ns:agents:*` (`ns:agents:fleet`, `ns:agents:transcript`), replacing the mixed `ns:subagents:fleet` / `ns:explore:transcript` prefixes. Rationale: the fleet view includes the parent session/agent, so "subagents" misdescribes the view. The rename covers commands, `ns.agents.*` widget/status keys, and the shim filename (`.pi/extensions/agents.ts`); the package name `@nseng-ai/ns-pi-subagents` and the `explore` / `forked_pi_agent` tool identifiers are explicitly out of scope. This is a deliberate vocabulary split — "agents" for the user-facing session-tree view, "subagent" for dispatched children and the runner substrate — to be recorded in `CONTEXT-MAP.md` in the rename slice.
- **No compatibility aliases** for the retired command names, consistent with the standing policy in `docs/pi/README.md`. This resolves and closes the former open question about alias posture.
- **Distribution posture.** The external-distribution row is assess-and-record only: the runner may investigate blockers and record a promotion path or an unblocked verdict, but packaging/publishing execution requires an explicit human request.
- **Runner autonomy.** Decision-bearing rows (helper-API ownership, doc rebaseline wording) are runner-decidable with rationale recorded; per-step validation is affected-package Vitest + tsgo typecheck + format/lint autofixers, with full `just` reserved for stack-final verification.

Derisking audit findings (repo state, 2026-07-06): the consolidation claims in the record are accurate. `@nseng-ai/ns-pi-subagents` exists at `ts/packages/extensions/ns-pi-subagents/` registering all four surfaces through one extension entrypoint; `.pi/extensions/subagents.ts` is a genuine 3-line thin delegate; no live code references the retired `@internal/pi-tools/runner-subagents` path; `docs/pi/README.md` and `docs/pi/runner-subagent-helper.md` already describe the unified entrypoint. Materially stale surfaces are narrow: the `retired website files` entry pointing at the retired `.pi/extensions/dispatch-runner-subagent.ts` shim path and a mislabeled `docs/pi/README.md` inventory row. The extracted workspace helper is `ts/packages/kernel/test/helpers/extension-workspace.ts`, consumed by kernel unit and integration extension-registry tests.

Objective PR evidence (stack unlanded; runner steps will stack above it):

- PR #3052: Move shim loading coverage into integration tests — preserves the default-vs-integration lane boundary this Objective defends.
- PR #3069: Consolidate subagent entrypoints into unified ns-pi-subagents extension — the core consolidation slice.
- PR #3071: Extract shared extension registry test workspace helper — input to the exports/test-helper ownership row.

## Objective Impact

- The record is now execution-friendly and shaped for `ns objective exec runner-step` slices with parent checkpoints; `objective-next` may offer confirmed execution under the recorded Runner Policy.
- All three former open questions are cleared: naming is decided, helper-API boundaries and distribution readiness are owned by concrete roadmap rows.
- The roadmap gained a new rename row implementing the `ns:agents:*` decision, the alias-posture row is resolved `[x]`, the doc-rebaseline and exports rows are narrowed to audit-verified concrete targets, and the distribution row is rescoped to assess-and-record.
- Non-Goals now explicitly exclude package/tool renames, compatibility aliases, and packaging/publishing execution.

## Follow-Ups

- Human lands the consolidation stack (PRs #3052, #3069, #3071); a landing-time rebase may require re-verifying runner slices built above it.
- Runner slices execute the four open rows, starting with the `ns:agents:*` rename since the doc rebaseline depends on the final names.
