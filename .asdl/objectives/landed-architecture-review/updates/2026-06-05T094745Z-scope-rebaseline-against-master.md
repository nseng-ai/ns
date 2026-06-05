# Scope Re-Baseline Against Master (2026-06-05)

## Summary

The Objective's cluster list was snapshotted on 2026-06-03 from `master --first-parent --since='24 hours ago'`. By 2026-06-05, **72 further first-parent commits** had landed on master (objective creation `d235dfc3` → `HEAD` `87fa5b45`), and three Objectives that overlapped this backlog were created and closed in the window: `planned-branch-ts-cli`, `planned-branch-quality-hardening`, and `areg-review-remediation`. The snapshot had drifted enough that `objective-next` would have offered clusters whose premises no longer hold.

Re-snapshot disposition by cluster:

- **cmux command suite** ([x]): unchanged. Its earlier follow-up note (a separate planned-branch creation/attachment seam) is now superseded by the built `@asdl/planned-branch` package.
- **Pi CLI command lifecycle** ([ ]): still valid; cited files (`cli-command-extension.ts`, `submit.ts`) still exist; rendering/command-handler area churned (`renderResult`/`renderCall`, shared grill command handler) — re-read before naming the seam.
- **Source-control mutation UX** ([ ]): partially overtaken. `land-stack` converted to discriminated `LandStackFailure`/`LandStackResult`, `presentLandStackFailure` moved to named options, and `asdl-dev-submit-consolidation` closed. Narrowed to shared mutation policy across the already-refactored flows.
- **Handoff artifacts** ([ ]): now overlaps the new `/handoff-tab` Objective; parser-as-data conversion and a `handoffs` namespace remap already landed. Narrowed and pointed to coordinate with `/handoff-tab`.
- **Slot operation occupancy** ([ ]): lightest drift (`slot free --all` only). Unchanged.
- **Saved-plan / planned-branch / dispatch identity** → **Parked (superseded).** Built as `@asdl/planned-branch` (`deriveContentSlug`, brmem/git/graphite gateways, dispatch composition) by the now-closed `planned-branch-ts-cli` and `planned-branch-quality-hardening`.
- **Agent resource / skill ontology** → **Parked (substantially superseded).** Typed `SkillsLockfile` + `LockfileConsistencyCheck` (12 `PENDING_REGEN` entries), skill-install hardening, and `SkillxWorkspaceInstaller` gateway landed via the now-closed `areg-review-remediation`.

A new Work cluster was added: **cross-cutting failure-as-data + gateway-extraction conventions** — the dominant architecture trend in the window (throw → discriminated returned data across `land-stack`, handoff/objective parsers, runner runtime, `ResolvePlanEvidence`, `brmem` envelopes; semantic gateway extractions). The payload-artifact / sidecar architecture is explicitly excluded as owned by the `agent-payload-artifacts` Objective.

## Objective Impact

The Objective is no longer snapshot-stale. `objective.md` gained a "Scope re-baseline (2026-06-05)" subsection, a revised first assumption, a new snapshot-drift risk, and a partial resolution to the "which clusters update existing Objectives" open question. `roadmap.md` moved two clusters to Parked with do-not-re-suggest rationale, narrowed two open clusters to what survives the landed work, and added the cross-cutting failure-as-data / gateway-extraction cluster.

Evidence: current master `HEAD` `87fa5b45`; objective baseline `d235dfc3`; `git log master --first-parent d235dfc3..HEAD` = 72 commits; working tree clean on `master` (no branch/PR diff — landed state is current master). No sibling Objective slug directories were added, moved, or removed.

## Follow-Ups

- Next `objective-next` for this Objective should re-snapshot master first, then offer one of: Pi CLI command lifecycle, narrowed source-control mutation UX, narrowed handoff (coordinating with `/handoff-tab`), slot occupancy, or the new failure-as-data / gateway-extraction cluster.
- Re-snapshot master before each subsequent cluster selection — the snapshot-drift risk recurs while master moves fast.
