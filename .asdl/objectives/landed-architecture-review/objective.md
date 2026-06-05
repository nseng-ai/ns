# Landed Architecture Review

## Thesis

Recent landed changes created several broad architecture seams across cmux workflows, Pi command execution, Graphite/source-control mutation UX, handoff artifacts, slot lifecycle safety, planned-branch dispatch, and agent resource ontology. This Objective tracks the durable review backlog for those clusters so each can be assessed, deepened when worthwhile, or explicitly parked with rationale instead of remaining an informal chat list.

The work should improve locality and leverage: each cluster should leave behind clearer module interfaces, better seams and adapters, stronger test surfaces, or an explicit decision that no refactor is currently justified.

## Scope

This Objective covers the architecture clusters identified from `master --first-parent --since='24 hours ago'` after updating master on 2026-06-03:

- cmux command suite, sidebar, workspace summary, slot dispatch, and open-branch flows.
- Pi CLI command execution/rendering/confirmation lifecycle.
- Graphite and source-control mutation UX across submit, land-stack, and cmux dispatch.
- Handoff artifacts layered over Branch Memory.
- Slot lifecycle operation occupancy for rebase/bisect safety.
- Saved-plan, planned-branch slugging, attachment, and cmux plan dispatch identity.
- Agent resource and skill ontology across `skills/`, `.agents/skills/`, `.claude/skills/`, docs, and review tooling.

### Scope re-baseline (2026-06-05)

The cluster list above was snapshotted on 2026-06-03. By 2026-06-05, 72 further first-parent commits had landed on master, and the closures of `planned-branch-ts-cli`, `planned-branch-quality-hardening`, and `areg-review-remediation` overtook part of this backlog. The re-snapshot disposition:

- Saved-plan / planned-branch / dispatch identity (cluster 6) is **superseded** and parked: the `@asdl/planned-branch` package now owns the identity seam (`deriveContentSlug` collapsing plan-content and saved-plan slug derivation, plus brmem/git/graphite gateways and dispatch composition), delivered by the now-closed `planned-branch-ts-cli` and `planned-branch-quality-hardening` Objectives.
- Agent resource / skill ontology (cluster 7) is **substantially superseded** and parked: typed `SkillsLockfile` + `LockfileConsistencyCheck` (12 `PENDING_REGEN` debt entries), skill-install hardening, and the `SkillxWorkspaceInstaller` gateway landed via the now-closed `areg-review-remediation` Objective.
- Source-control mutation UX (cluster 3) is **partially overtaken**: `land-stack` is now discriminated returned data and `asdl-dev-submit-consolidation` is closed; the surviving question is shared mutation policy across the remaining flows.
- Handoff artifacts (cluster 4) now **overlap** the separate `/handoff-tab` Objective and have already had parser-as-data conversion and a namespace remap land; the surviving question is the module/interface over Branch Memory.
- A new cross-cutting cluster is added: the failure-as-data (throw → discriminated returned data) and gateway-extraction conventions now sweeping the codebase. The payload-artifact / sidecar architecture is explicitly out of scope here because it is owned by the `agent-payload-artifacts` Objective.

For each cluster, the expected pattern is: inspect the current modules and tests, name the important interface and seam, decide whether a deepening change is warranted, execute an independent slice when it is, and record semantic evidence or a parked rationale.

Review-skill routing should be explicit per cluster. Use `improve-codebase-architecture` when the main question is what Module, Interface, Seam, Adapter, locality, or leverage should exist. Use `thermo-nuclear-code-quality-review` when the main question is whether the implementation is structurally too messy: giant files, spaghetti conditionals, wrong-layer logic, casts/optionality, or missed code-judo simplification. The default order is architecture first, then thermo-nuclear implementation pressure-test; the exception is an obviously messy implementation where a quick thermo scan may reveal a deletion/restructuring move before deeper interface design.

## Non-Goals

- Do not force every cluster into one omnibus refactor or PR.
- Do not treat architecture review as a mandate to rewrite working code without demonstrated locality or leverage gains.
- Do not create a workflow controller, task database, YAML registry, or hidden state for this review backlog.
- Do not reopen broad historical architecture Objectives unless a specific cluster genuinely depends on their closure decisions.
- Do not make routine validation, CI waiting, or repo-wide formatting a standalone roadmap item; use them as evidence under the semantic slice they validate.
- Do not track, mirror, or reconcile a spun-off follow-up Objective's state from here. Once a cluster is handed to its own Objective it is closed in this one and the follow-up owns it outright; cross-Objective state reconciliation is explicitly out of scope.

## Completion Criteria

This Objective is complete when each in-scope cluster has one of the following durable outcomes:

- an implemented architecture-deepening slice with tests and a Semantic Update describing the new module/interface/seam and evidence;
- an explicit parked decision explaining why the current shape is acceptable or why the work should wait;
- a smaller follow-up Objective created only if one cluster proves too broad to manage inside this Objective. The moment that follow-up Objective is created, the cluster is closed here — parked with a one-line pointer to the new slug. Spin-off is fire-and-forget: this Objective records the handoff and then never tracks, mirrors, or reconciles the follow-up's progress.

Closure should summarize the final cluster disposition table, the most important shared architecture decision, and any remaining risks that were accepted or moved elsewhere.

## Definition of Progress

A useful execution slice for this Objective advances exactly one roadmap cluster at a time unless the inspected seam proves that two clusters are inseparable and the agent asks before broadening scope. Progress means the slice leaves durable Objective evidence for the selected cluster:

- a named module/interface/seam decision and the review route actually used;
- either a small architecture-deepening implementation with targeted tests, or a parked rationale explaining why no refactor is currently justified;
- updated assumptions, risks, roadmap notes, or Semantic Updates when the inspection changes durable understanding.

Routine validation, formatting, CI waiting, or repo-wide checks are completion evidence for a semantic slice, not standalone Objective progress unless the validation behavior itself becomes the deliverable.

## Runner Policy

After the Tracking Gate passes, `objective-next` may offer execution for the next non-parked roadmap cluster when the preview limits work to one coherent semantic slice and cites this policy. The default execution boundary is local worktree edits only: inspect code, make targeted source/test/doc changes when warranted, run relevant local validation, and update this Objective under `.asdl/objectives/landed-architecture-review/` with meaningful evidence.

The execution preview must name the selected roadmap cluster, likely files or packages, expected validation, how work will be left, and stop/ask conditions. Branch creation, commits, Graphite stack operations, PR submission, publishing, deployment, and other write-capable external systems are out of scope unless the user explicitly asks for them in the confirmed preview.

Stop and ask before continuing if the slice appears to require a broad rewrite, crosses into another active Objective as the primary deliverable, needs ambiguous product/terminology judgment, would change Objective slug identity or hidden state, or cannot be validated with targeted local evidence.

## Assumptions and Risks

Assumptions:

- The seven clusters from the 2026-06-03 master analysis were the right initial scope. Revised 2026-06-05: clusters 6 and 7 are now parked as superseded by landed/closed Objectives, clusters 3 and 4 are narrowed to what survives those landings, and a cross-cutting failure-as-data / gateway-extraction cluster was added.
- The risk-first order is the right starting sequence: cmux command suite, Pi CLI lifecycle, source-control mutation UX, handoffs, slots, plans/dispatch identity, and agent resource ontology.
- Most clusters can be assessed and executed independently enough to avoid a single large coupled branch.
- Existing tests and scenario tests are close enough to the user-facing seams to validate targeted deepening work.
- Architecture-first, thermo-second is the right default skill ordering because it chooses the battlefield before judging implementation structure.

Risks:

- The cmux command-suite review found several workflow Modules rather than one coherent deep Module. The slot-launch seam is now narrower, but planned-branch creation/attachment remains a potential follow-up seam if `slot-dispatch-plan.ts` continues to carry too much Branch Memory and Graphite detail.
- The cmux and Pi CLI lifecycle clusters may be more coupled than they look, causing future slices to expand unless interfaces are named narrowly.
- Some clusters overlap existing open Objectives such as `command-output-summaries`, `agent-payload-sidechannels`, `planned-branch-ts-cli`, `repo-ontology`, or `typescript-style-audit-fixes`; work should update or reference those records when it materially advances them.
- Architecture changes could churn recently landed behavior if the review optimizes for cleanliness instead of locality and user-visible safety.
- Parking decisions may be too terse unless each parked cluster records the concrete reason future agents should not re-suggest the same change immediately.
- Running the thermo-nuclear review before naming the architecture seam could overfit to local messiness and miss the deeper Module shape; running only architecture on implementation-heavy clusters could miss simple code-judo deletions.
- This Objective's scope is snapshot-anchored and drifts as master moves: in the two days after creation, 72 first-parent commits and the closures of `planned-branch-ts-cli`, `planned-branch-quality-hardening`, and `areg-review-remediation` overtook two clusters and narrowed two more. Mitigation: re-snapshot master before selecting the next cluster rather than trusting the original list; this risk recurs whenever the Objective sits idle while master moves fast.

## Open Questions

- Resolved for cmux command-suite review: cmux should remain several workflow Modules, not one deep workflow Module; the shared slot-launch seam should carry slot checkout, worktree description, and cmux workspace opening.
- Should Pi command lifecycle behavior become a harness-neutral module before more `/code:*` and cmux commands depend on it?
- Partially resolved 2026-06-05: clusters 6 and 7 were fully owned and resolved by other Objectives (`planned-branch-ts-cli`, `planned-branch-quality-hardening`, `areg-review-remediation`) and are parked here rather than re-reviewed; the handoff cluster should coordinate with `/handoff-tab` rather than duplicate it.
- What is the smallest useful evidence standard for saying a cluster was reviewed and intentionally parked?
- For each cluster, does the recommended skill route still hold after inspecting the first concrete files, or should the route be narrowed to architecture-only, thermo-only, or both?
