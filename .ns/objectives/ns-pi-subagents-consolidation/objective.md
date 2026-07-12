# ns-pi-subagents Consolidation

## Thesis

`pi-parallel-subagents` delivered the first useful Pi parallel-subagent capability. The next phase is not another greenfield fan-out tool; it is consolidation of the dogfooded surface into a coherent `@nseng-ai/ns-pi-subagents` extension package and workspace integration. The current Graphite stack already points in this direction: extension registry shim-loading coverage, consolidation of subagent entrypoints into the unified extension, and an extension workspace helper extraction. This Objective owns that post-delivery hardening arc so the package boundary, repo-local shims, fleet/explore/dispatch entrypoints, and tests evolve together rather than drifting across incidental branches.

## Scope

- Unify Pi subagent entrypoints around `@nseng-ai/ns-pi-subagents` as the package boundary for explore, dispatch runner subagents, fleet navigation, and transcript viewing.
- Present the consolidated command surface under the `ns:agents:*` Pi prefix (`ns:agents:fleet`, `ns:agents:transcript`), with matching `ns.agents.*` widget/status keys and an `.pi/extensions/agents.ts` shim. Decided 2026-07-06: "agents" names the user-facing session-tree view (the fleet includes the parent session/agent); "subagent" remains the canonical term for dispatched children and the runner substrate.
- Keep repo-local `.pi/extensions/*` files as thin project shims over the package surface, not as the canonical implementation home.
- Extract and maintain shared extension workspace/test helpers where they reduce duplicated setup while preserving the default-vs-integration test boundary.
- Update Pi host registration, docs, package exports, and package tests when the public extension surface changes.
- Preserve the delivered `explore` contract from `pi-parallel-subagents`: read-only explorer allowlist, bounded parent-context findings, live progress, and child session pointers.
- Record follow-on decisions when consolidation intentionally does not subsume a neighboring substrate such as thermo-council orchestration.

## Non-Goals

- Reopening the adopt-vs-build decision for parallel explorers.
- Rebuilding parallel writer subagents, worktree isolation, merge coordination, or scheduling.
- Moving this capability into Pi core.
- Treating Pi-only entrypoints as canonical for workflows that require cross-harness parity.
- Broad test-performance work outside the subagent extension/helper seams touched by this consolidation.
- Renaming the `@nseng-ai/ns-pi-subagents` package or the `explore` / `forked_pi_agent` tool identifiers; the `ns:agents:*` rename is command-surface, widget/status keys, and shim filename only.
- Compatibility aliases for retired command names; ns is private and breaking renames are allowed with doc updates (matches the standing no-aliases policy in `docs/pi/README.md`).
- Executing external packaging, bundling, or publishing of `@nseng-ai/ns-pi-subagents`; this Objective only assesses and records distribution readiness.

## Completion Criteria

- `@nseng-ai/ns-pi-subagents` is the canonical package surface for the repo's Pi subagent extension functionality; repo-local shims only delegate to it.
- Explore, dispatch runner subagent, fleet navigation, and transcript viewing are registered through the unified extension surface with package-level tests covering the public behavior.
- The consolidated command surface is `ns:agents:*` with no legacy `ns:subagents:*` / `ns:explore:*` command names remaining, and the agents-view vs. subagent-substrate vocabulary split is recorded in `CONTEXT-MAP.md`.
- Shared extension workspace/helper code used by this surface has a clear owner and targeted coverage, with integration-only checks kept out of the default test lane when they require real module loading.
- Docs and Pi host registration describe the consolidated entrypoint and no longer direct users or agents to stale internal package paths for normal use.
- External distribution readiness for `@nseng-ai/ns-pi-subagents` has a recorded assessment: either the remaining internal-substrate blockers and a promotion path, or a statement that packaging is unblocked (execution of packaging/publishing stays out of scope).
- Any remaining intentional non-consolidation, especially around thermo-council or other subagent-like orchestration, is recorded as parked or follow-up work rather than implicit drift.

## Definition of Progress

Progress is keepable when:

- One focused slice moves the consolidated extension surface, shims, docs, or tests measurably toward the completion criteria above.
- The delivered `explore` contract is preserved: read-only explorer allowlist, bounded parent-context findings, live progress, and child session pointers.
- Repo-local `.pi/extensions/*` shims stay thin delegates to the package, and the default-vs-integration test lane boundary holds (fake-backed behavior in default tests, real module loading in the integration lane).
- Affected-package tests and typecheck pass, with format/lint autofixers applied.

Do not keep changes that:

- Introduce a second subagent extension package or move implementation back into `.pi/extensions/*`.
- Add compatibility aliases for renamed command surfaces.
- Put real module loading, real git, or subprocess setup into default-lane tests.
- Generalize explore, dispatch runner subagents, fleet, and thermo-council into a neutral scheduler abstraction.

Useful evidence includes:

- Targeted Vitest runs for the touched packages and native `tsc` typecheck output.
- Command/tool registration verified through existing extension tests.
- Doc diffs showing canonical entrypoint and command names, and Semantic Updates recording decision rationale.

## Runner Policy

This Objective is an autoobjective (ADR 0022): its roadmap is shaped for repeated `ns objective exec runner-step` slices with parent checkpoints between commits, and it is execution-friendly for `objective-next` under the boundaries below.

- Direct execution is allowed when: a slice implements a `[ ]` roadmap row within its stated scope — the `ns:agents:*` rename, the documentation rebaseline, the exports/test-helper ownership audit, or the distribution-readiness assessment. Decision-bearing calls inside those rows (which helper APIs are package API vs. test-local, how to word doc rebaselines) may be made directly, guided by existing conventions, with rationale recorded in a Semantic Update.
- Steer or ask first when: a slice would rename the package or the `explore` / `forked_pi_agent` tool identifiers, change the delivered `explore` contract, reach into thermo-council or other neighboring orchestration, or otherwise exceed the row's stated scope.
- How work may change files and be left: each runner step lands as one commit on a fresh Graphite-tracked branch stacked on the previous step, per the Objective Runner contract; landing/merging the stack is human work. Objective tracking updates are parent-session judgment, not child work.
- Validation before keeping work: affected-package Vitest suites, native `tsc` typecheck, and format/lint autofixers per slice; full `just` validation is stack-final verification, not a per-step gate.
- What will not happen unless explicitly requested: submitting, pushing, or merging PRs; publishing or executing packaging for external distribution; mutating GitHub issues/PRs or any external system; renaming the package; adding compatibility aliases.

## Assumptions and Risks

- The package boundary created by `pi-parallel-subagents` is the right foundation; consolidation should deepen it rather than introduce another extension package.
- Closure is authored on the top-of-stack branch while the Objective PR stack is still open: PR #3052, PR #3069, PR #3071, and current PR #3108 together carry the completed consolidation state. Merging that stack is the trunk-landing event; any landing-time rebase or review revision should preserve the recorded `ns:agents:*` surface, package boundary, and test-lane decisions.
- De-risked 2026-07-06 by repo audit: no live code references the retired `@internal/pi-tools/runner-subagents` path; the consolidated shim `.pi/extensions/subagents.ts` is a genuine 3-line thin delegate; `docs/pi/README.md` and `docs/pi/runner-subagent-helper.md` already describe the unified entrypoint. The materially stale surfaces are narrow: the `docs-site/lib/extensions-catalog.ts` entry pointing at the retired `.pi/extensions/dispatch-runner-subagent.ts` shim path, plus historical audit/retro docs.
- De-risked 2026-07-06 by distribution-readiness audit: external packaging is still blocked. `@nseng-ai/ns-pi-subagents` remains private, ships raw `src/`, exposes raw `.ts` entrypoints, and has a runtime dependency on `@internal/pi-tools/overlay-kit` while `@internal/pi-tools` depends back on its runner-subagent subpaths. Promotion requires breaking that coupling and deciding a release artifact contract before any publish/version slice.
- Test helper extraction can accidentally blur unit and integration lanes; keep real extension loading in integration tests and fake-backed behavior in default tests.
- Renaming user-facing commands or widget identifiers breaks dogfood muscle memory; the accepted posture (2026-07-06) is no compatibility aliases, with docs updated in the same slice as the rename.
- The `ns:agents` naming deliberately splits vocabulary: "agents" for the user-facing session-tree view, "subagent" for dispatched children and the runner substrate. If the split confuses in practice, revisit the vocabulary rather than drifting.
- Consolidating entrypoints may tempt over-generalization of runner-subagent, explore, fleet, and thermo-council abstractions. Prefer package cohesion and explicit seams over a neutral scheduler unless a third caller proves the abstraction.

## Open Questions

- None currently. The former open questions are resolved or row-owned: command-surface naming is decided (`ns:agents:*`, no aliases; see Scope), helper-API export boundaries are owned by the exports/test-helper audit row, and distribution readiness is owned by the assess-and-record row.

## Closure

Outcome: completed. The consolidation Objective is closed on the top-of-stack branch that carries its final tracking state; merging the open stack is the trunk-landing event.

Key evidence:

- PR #3052: Move shim loading coverage into integration tests — preserves the default-vs-integration boundary for real shim loading.
- PR #3069: Consolidate runner subagents into unified ns-pi-subagents extension — establishes `@nseng-ai/ns-pi-subagents` as the canonical package surface for explore, dispatch runner subagents, transcript viewing, and fleet navigation.
- PR #3071: Extract shared extension registry test workspace helper — gives the kernel helper a clear test-fixture home.
- Current PR #3108: Unify ns-pi-subagents fleet tracking and command naming — completes final follow-on remediation by centralizing fleet run tracking and keeping command naming under `ns:agents:*`.

The remaining Objective work is not additional implementation: PR submission, push, merge, and landing are human-owned; external distribution remains intentionally blocked and documented with a promotion path. Parked higher-level orchestration across explore, dispatch runner subagents, and thermo-council remains a future follow-up only if a new caller proves the abstraction.
