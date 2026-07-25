# Follow-up: Flow after the repository reorganization

**Point in time:** 2026-07-25\
**Origin:** consolidation of four Flow Objectives and Flow-related findings from the stack-repair work before closing those records in favor of `professional-repo-curation`\
**Status at capture:** deliberately deferred until after the capability→extension rename and two-zone repository reorganization; not an active commitment

## Why this follow-up exists

`professional-repo-curation` makes Flow an incubator resident and parks its graduation until a real sponsor or consumer appears. Continuing Flow package moves, command renames, skill-family changes, dependency work, or README promotion before the repository reorganization would create avoidable churn: the package is expected to move, extension vocabulary is changing, the package graduation contract is being recalibrated, and Flow is not required for the first team-facing ship unless the Objectives dependency verdict says otherwise.

The closed Flow Objectives contained useful design decisions and unfinished work that should be discoverable without reconstructing several historical records. This note consolidates those insights as point-in-time input for a future sponsored Flow graduation. It is not a replacement roadmap. Revalidate every path, package name, command name, extension API, and dependency against the post-reorganization tree before implementation.

## Product direction worth preserving

Flow owns the everyday lifecycle of Graphite-backed stacked development: describe and checkpoint work, create branches, submit stacks, keep them operable, and land them. Its value is not “another Graphite abstraction.” The intended value story is:

1. **Keep large stacks cheap to operate.** Graphite still owns topology; Flow reduces the repeated coordination cost around it.
2. **Reduce decision fatigue.** Routine branch names, checkpoint text, PR descriptions, checks, submission, and landing follow explicit workflows.
3. **Let teams encode policy without policing.** Repository settings and extension points adapt validation and prompts without forking Flow.
4. **Eliminate repetitive mechanics.** Portable commands own deterministic operations; agent-driven workflows add judgment where a command alone is insufficient.

Flow is named for preserving the engineer’s flow state. Parallel work must remain method-agnostic: ordinary clones and worktrees are valid, while the Slots extension is an optional enhancement rather than Flow’s identity.

The intended documentation shape is value-first and human-adopter-first, with agent behavior woven in:

- Why Flow and the four value pillars.
- The everyday loop: `cp` → `submit` → `land` → `pull-trunk`, including a realistic worked example.
- Working in parallel: `autobranch`, optional `autoslot`, and `branch-latest-commit`.
- Keeping stacks clean: stack squash, PR regeneration, change summaries, and agent-driven stack workflows.
- Making Flow yours through settings and extension points.
- Detailed requirements, command/dependency matrix, failure contracts, and configuration reference below the fold.

The review-conversation boundary remains outside Flow: Flow may point users to `ns address` / PR-feedback workflows, but review-thread triage and resolution are not stack-state workflows.

## Workstream 1: decide Flow’s role in the Objectives first ship

The first post-reorganization decision may arrive before a general Flow graduation. The single-player Objectives ship currently has a dependency on Flow and Branch Context. Its owning slice must decide whether to:

- cut the Objectives → Flow edge;
- graduate a genuinely minimal Flow slice with Objectives; or
- accept another explicit packaging arrangement consistent with the clean-zone invariant.

Do not treat the existence of the old dependency as proof that all of Flow should graduate. If no first-ship need survives rebaselining, leave Flow in the incubator until separately sponsored.

## Workstream 2: make Slots optional

### Preserved decisions

Flow’s core loop should work without the Slots extension. With Slots present, `autoslot` is available and `land` can clean up managed-slot worktrees. Without Slots, the rest of Flow remains coherent.

The prior design settled these points:

- **One presence fact:** an extension is present when its package name occurs in the effective declared-extension registry, regardless of whether it is preinstalled or project-declared.
- **Declarative and imperative faces over one fact:** command entries can declare a required extension, while invocation-time code can query extension presence.
- **Proposed names at the time:** `requiresExtension` on an entry and `hasExtension(packageName): boolean` on the ns extension API. Revalidate these names after the extension vocabulary and SDK reshape.
- **Absent `autoslot` is hidden:** do not register it when Slots is absent rather than exposing a command that predictably fails.
- **Do not import another installed extension at runtime:** managed npm extensions live in isolated sibling trees under `.ns/managed-extensions/npm/<pkg>/`, so optional or peer dependencies do not make cross-extension imports resolvable in consumer repositories.
- **Use the public command boundary:** replace Flow’s in-process Slots client use with `ns slot checkout --format json`, behind a testable process gateway.
- **Land uses LBYL behavior:** ordinary non-slot worktrees require no Slots check. If slot-patterned worktrees exist after Slots has been removed, pre-merge handling should block with manual-detach guidance; post-landing cleanup should report a skipped outcome without undoing or blocking an otherwise completed landing.
- **Do not generalize prematurely:** write a general optional inter-extension convention only after a second real consumer proves the pattern.

### Candidate implementation slices

1. Rebaseline the current SDK/registry and decide whether a generic presence seam is still warranted.
2. Add the declarative command-entry gate and imperative predicate over the same registry fact; document them in the authoritative SDK reference.
3. Cover an actual consumer repository without Slots. The development checkout normally has Slots present and cannot prove the absent state by itself.
4. Rewrite `autoslot` to invoke the Slots CLI through a fakeable gateway; remove Flow’s hard package dependency.
5. Implement and test land’s missing-after-use edge case.
6. Document Slots as optional and describe the hidden `autoslot` surface and cleanup behavior.

## Workstream 3: establish an agent-driven stack-workflow tier

A useful two-tier model emerged:

- **Commands people run:** deterministic portable `ns flow ...` operations.
- **Workflows an agent drives:** judgment-bearing loops implemented as skills over sanctioned machine-readable primitives.

A candidate belongs to Flow when it mutates or traverses stack state. Work operating on review conversations stays in PR feedback / Address. Agent workflows should not become hollow all-in-one CLI orchestrators; push deterministic fact gathering down, while leaving conflict resolution and semantic repair to the agent.

Four candidate workflows were identified:

1. **Restack and resolve.** Fold the existing restack-resolution workflow into the eventual Flow skill family. Consume the already-landed `ns slot gt exec restack-preflight` primitive where it still exists.
2. **Validate the stack.** Replace the old hardcoded `just` assumption with repository policy. Re-decide whether this uses `flow.submit.pre` or a distinct validation point, and choose a name that does not encode one repository’s task runner.
3. **Linearize descendants.** Consume the already-landed `ns slot gt exec descendants-report` facts rather than retaining a hand-rolled per-branch evidence loop.
4. **Repair a failing GitHub stack.** Build on the hardened repair-loop contract and the enriched PR-feedback check facts described below.

For each eventual fold-in:

- follow post-reorganization skill naming and registration conventions rather than preserving the proposed `ns-flow-*` names blindly;
- sweep and update cross-references with the rename;
- consume existing sanctioned exec surfaces instead of duplicating Graphite or GitHub queries;
- add only those new Flow exec primitives whose deterministic facts have no better owning domain; and
- document the workflow in the value-led README without blurring the PR-feedback boundary.

After these workflows prove the tier, reconsider the old `code-workflows` router candidates such as delete-stack, stackify-branch, and stacker-agent. They are not assumed members merely because they mention stacks.

## Workstream 4: a Flow-owned Pi tier and stack view

The prior Pi-layer decision was that “see the state of my stack” belongs to Flow’s turn-saving Pi surface rather than a standalone stack-view extension. At capture time, stack view remained consumer-side internal Pi tooling and its old module header proposed a standalone package; that promotion path was considered superseded.

A future promotion should:

- move stack-view behavior into Flow’s Pi layer only if Flow itself is being graduated;
- earn tests at the promotion boundary rather than moving vibecoded TUI code unchanged;
- separate and test the data layer before or alongside the overlay when that keeps the slice bounded;
- consume stack topology from the sanctioned Slot/Graphite exec surface and checks/threads from the PR-feedback exec surface;
- avoid promoting stack view’s duplicate GraphQL layer into supported Flow code;
- update Pi surface parity metadata and remove the internal registration only after parity is proven; and
- remove or rewrite any stale standalone-package promotion comment.

Naming remains open and must be decided against the post-reorganization command catalog: a Flow view name, a Flow stack-view name, or a compatibility alias for the current surface. The same applies to the old `gt:squash-stack` → Flow namespace normalization. A clean break is allowed, but daily-driver references in skills, prompts, docs, and parity metadata require a deliberate sweep.

The removed Compose and stack-level Summarize experiments were not part of the intended promotion contract.

## Workstream 5: retain and finish the reusable stack-repair primitives when sponsored

The stack-repair work delivered an enriched `ns address exec branch-pr-checks` contract before closure. Its durable semantics are useful to future Flow consumers:

- mapping `status` remains separate from `pr_status`;
- `pr_status` uses `draft`, `checks-failing`, `unresolved`, `ready`, and `no-pr`;
- pending checks can coexist with `ready`, so consumers must inspect check counts rather than treating `pr_status` as settlement;
- check freshness is derived against the verified head commit’s `committedDate`; a same-SHA repush remains unobservable;
- check and review-thread pagination must be complete before classification;
- unresolved review-thread counts are present for routing, while thread resolution remains outside the repair workflow; and
- `Graphite / mergeability_check` is marked as a trailing signal only under the exact identity/name and pending-state rules.

The unfinished repair work was:

1. Add and test a failed-check log excerpt command that resolves a run/job from PR plus check name and returns the failed-step tail, reusing the proven resolution logic from stack view rather than requiring agents to assemble IDs manually.
2. Rewrite the stack-repair skill so inventory and triage use one enriched-command invocation plus explicit JSON interpretation rules.
3. Audit the remainder of the repair loop for deterministic push-down candidates and explicitly push down, defer, or reject each one.

Before resuming, rebaseline the renamed PR-feedback/Address package and current skill. Do not assume the old `ns address` noun, file locations, or command schema survived curation unchanged.

## Workstream 6: promote the value-led README as the graduation contract

The earlier work already shipped shared top-level model policy for Flow: model profiles and operation overrides live under `[models]`, omitted operations resolve through `fast`, projects may redefine `fast`, and no model-policy inspection command was part of v1. Reverify that contract rather than reimplementing it.

The old draft was not ready to promote. A future Flow Readme-Driven-Development Subobjective should start from current shipped behavior plus the product direction in this note, not copy the draft over the canonical README mechanically. It should:

1. Revalidate the four value pillars and choose explicit terse bullets versus a narrative presentation.
2. Confirm the primary reader, with human adopter first as the prior recommendation.
3. Write the everyday-loop worked example with realistic output.
4. Integrate optional Slots, the Pi tier, and agent-driven workflow sections only to the extent those behaviors have actually shipped.
5. Preserve accurate contract material below the fold: requirements, command matrix, pre-submit checks, failure marker, extension points/settings, and operational boundaries.
6. Promote only after every value claim and example is true in a cold consumer repository.

The README must merge concurrent outcomes rather than clobbering them. Documentation promotion should be the contract-setting front of a sponsored Flow graduation, not an independent polish pass while Flow remains incubating.

## Suggested post-reorganization sequence

1. **Require a sponsor.** A concrete consumer or the Objectives first-ship dependency verdict must justify reopening Flow work.
2. **Rebaseline.** Inventory Flow’s new location, package identity, dependencies, extension APIs, Pi registration, skills, settings/points, tests, and current README. Recheck every command and primitive named here.
3. **Create one focused Readme-Driven-Development / graduation Objective.** Use this note as input, not as its roadmap. Keep unrelated redesign out of the slice.
4. **Resolve dependency closure first.** Decide the Objectives edge and optional Slots work before promising external installability.
5. **Stabilize deterministic primitives.** Preserve existing sanctioned Graphite and PR-feedback facts; finish only the push-down needed by selected workflows.
6. **Implement selected portable behavior and tests.** Avoid moving TUI or skills merely for taxonomy.
7. **Settle and promote the README contract.** Include only shipped workflows and integrations.
8. **Graduate Flow only when the repository’s README-driven gate passes** and no clean-zone package depends back into the incubator.

## Open decisions to revisit

- Does the Objectives first ship need any Flow runtime behavior at all?
- Are extension-presence gates still the right SDK mechanism after the rename/reorganization?
- Does stack view still belong in Flow after re-evaluating its stack and review-conversation responsibilities?
- Which Pi command names should survive, and are aliases worth their maintenance cost?
- Should stack validation reuse submit’s pre-check point or receive a distinct point?
- What is the eventual skill-family naming convention?
- Which agent workflows have enough repeated demand to warrant promotion?
- Which remaining environment-backed Flow settings, if any, should move into typed repository settings?
- Is a policy-inspection surface now justified, or would it make configuration unnecessarily complex?

## Verification required before acting

- Read `professional-repo-curation` and its active child Objective(s); the two-zone and naming decisions supersede paths in this note.
- Inspect the current Flow package, package manifest, README, context file, tests, and published/installable surface.
- Verify the current SDK registry and managed-extension installation model.
- Verify the present `ns slot gt exec` and PR-feedback exec schemas rather than relying on historical command names.
- Inventory current Pi stack-view behavior, tests, data sources, parity metadata, and registration.
- Inspect current skill conventions and every candidate workflow’s installed version.
- Exercise behavior from a cold consumer repository, including a repository without Slots.
- Confirm the selected work is required for a supported ship or sponsored Flow graduation rather than being incubator polish.

## Promotion signal

Promote this note into a new Objective when all of the following are true:

- the repository reorganization and capability→extension vocabulary work have stabilized;
- a named consumer or ship requires Flow;
- the required Flow subset and dependency closure are explicit;
- a current README draft can state a truthful external contract;
- the first bounded implementation slice and its test evidence are known; and
- the work can satisfy the repository’s package graduation gate without unrelated redesign.

## Historical provenance

This note consolidates the decisions and unfinished work formerly tracked in:

- `.ns/objectives/flow-slots-opt-in/`
- `.ns/objectives/flow-fold-stack-skills-into-workflow-tier/`
- `.ns/objectives/flow-pi-tier-stack-view-promotion/`
- `.ns/objectives/flow-value-led-readme-restructure/`
- `.ns/objectives/stack-repair-loop-hardening/`

Those records remain checked in as immutable provenance, but this note is intended to be the starting point for post-reorganization Flow consideration.
