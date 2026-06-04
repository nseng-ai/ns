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

For each cluster, the expected pattern is: inspect the current modules and tests, name the important interface and seam, decide whether a deepening change is warranted, execute an independent slice when it is, and record semantic evidence or a parked rationale.

Review-skill routing should be explicit per cluster. Use `improve-codebase-architecture` when the main question is what Module, Interface, Seam, Adapter, locality, or leverage should exist. Use `thermo-nuclear-code-quality-review` when the main question is whether the implementation is structurally too messy: giant files, spaghetti conditionals, wrong-layer logic, casts/optionality, or missed code-judo simplification. The default order is architecture first, then thermo-nuclear implementation pressure-test; the exception is an obviously messy implementation where a quick thermo scan may reveal a deletion/restructuring move before deeper interface design.

## Non-Goals

- Do not force every cluster into one omnibus refactor or PR.
- Do not treat architecture review as a mandate to rewrite working code without demonstrated locality or leverage gains.
- Do not create a workflow controller, task database, YAML registry, or hidden state for this review backlog.
- Do not reopen broad historical architecture Objectives unless a specific cluster genuinely depends on their closure decisions.
- Do not make routine validation, CI waiting, or repo-wide formatting a standalone roadmap item; use them as evidence under the semantic slice they validate.

## Completion Criteria

This Objective is complete when each in-scope cluster has one of the following durable outcomes:

- an implemented architecture-deepening slice with tests and a Semantic Update describing the new module/interface/seam and evidence;
- an explicit parked decision explaining why the current shape is acceptable or why the work should wait;
- a smaller follow-up Objective created only if one cluster proves too broad to manage inside this Objective.

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

- The seven clusters from the refreshed master analysis are the right initial scope for this Objective.
- The risk-first order is the right starting sequence: cmux command suite, Pi CLI lifecycle, source-control mutation UX, handoffs, slots, plans/dispatch identity, and agent resource ontology.
- Most clusters can be assessed and executed independently enough to avoid a single large coupled branch.
- Existing tests and scenario tests are close enough to the user-facing seams to validate targeted deepening work.
- Architecture-first, thermo-second is the right default skill ordering because it chooses the battlefield before judging implementation structure.

Risks:

- The cmux and Pi CLI lifecycle clusters may be more coupled than they look, causing the first slices to expand unless interfaces are named narrowly.
- Some clusters overlap existing open Objectives such as `command-output-summaries`, `agent-payload-sidechannels`, `planned-branch-ts-cli`, `repo-ontology`, or `typescript-style-audit-fixes`; work should update or reference those records when it materially advances them.
- Architecture changes could churn recently landed behavior if the review optimizes for cleanliness instead of locality and user-visible safety.
- Parking decisions may be too terse unless each parked cluster records the concrete reason future agents should not re-suggest the same change immediately.
- Running the thermo-nuclear review before naming the architecture seam could overfit to local messiness and miss the deeper Module shape; running only architecture on implementation-heavy clusters could miss simple code-judo deletions.

## Open Questions

- Should cmux get one deep workflow module with `slot`, `gt`, `cmux`, and `asdl exec` as adapters, or should each cmux command keep its own local module boundary?
- Should Pi command lifecycle behavior become a harness-neutral module before more `/code:*` and cmux commands depend on it?
- Which clusters, if any, should update existing Objectives instead of only recording progress here?
- What is the smallest useful evidence standard for saying a cluster was reviewed and intentionally parked?
- For each cluster, does the recommended skill route still hold after inspecting the first concrete files, or should the route be narrowed to architecture-only, thermo-only, or both?
