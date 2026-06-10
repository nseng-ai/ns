# Landed Architecture Review Umbrella

## Thesis

The landed architecture review should remain useful as provenance without continuing to act as one broad implementation backlog. This umbrella preserves the review premise and the 2026-06-05 re-baseline, then reduces active work to a short checklist of child Objectives to create. Each child owns its own roadmap, evidence, implementation, parking decisions, and closure after it is created.

The active need is coordination: keep the historical “why” from `landed-architecture-review`, create focused child Objectives for the unresolved seams, and then let those children carry their own context. The umbrella is not the implementation backlog for the architecture-review family.

## Scope

This Objective covers only the umbrella setup for the remaining landed-architecture-review descendants:

- Preserve the useful context from the old `landed-architecture-review` Objective and its 2026-06-05 re-baseline.
- Maintain a five-item checklist of child Objectives to create.
- On `objective-next`, choose one unchecked roadmap item, create a child Objective with slug pattern `landed-architecture-review-<topic>`, and mark that umbrella item `[x]`.
- Close and archive `landed-architecture-review` as superseded provenance.
- Keep child progress, evidence, validation, parking decisions, and closure out of this umbrella after each child is created.

The five retained child Objective candidates are Pi CLI lifecycle, source-control mutation UX, handoff over Branch Memory, slot occupancy locality, and failure-as-data / gateway conventions.

## Non-Goals

- Do not implement the architecture-review child work inside this umbrella.
- Do not spawn all child Objectives up front.
- Do not mirror child status, reviews, roadmap progress, validation, parking, or closure in the umbrella after a child is created.
- Do not add YAML/frontmatter, UUIDs, hidden parent/child metadata, registries, task databases, schedulers, or state-machine behavior.
- Do not build a new `objective-next` command, Objective CLI feature, or spawn automation unless the existing prose-policy mechanism is proven insufficient.
- Do not reopen completed or superseded clusters unless a future child Objective finds fresh concrete drift.

## Completion Criteria

This umbrella is complete when:

- every roadmap checklist item has been marked `[x]` because its corresponding child Objective was created;
- the old `landed-architecture-review` Objective has been closed and archived as superseded provenance;
- no unchecked child-creation items remain in this umbrella roadmap.

The umbrella does not wait for child Objectives to finish. Child implementation, review, roadmap progress, parking decisions, and closure belong to the child records.

## Definition of Progress

Progress is keepable when exactly one unchecked roadmap item has been turned into a child Objective under `.asdl/objectives/landed-architecture-review-<topic>/`, and the corresponding umbrella roadmap item has been marked `[x]`.

The child Objective should be self-contained enough for future work on that topic, but the umbrella should not pre-solve that child’s architecture decisions or track its later progress.

## Runner Policy

This Objective is execution-friendly for `objective-next` only for child Objective creation.

After the Tracking Gate passes, `objective-next` may offer to execute one unchecked roadmap item at a time. A confirmed execution may:

- create one child Objective using slug pattern `landed-architecture-review-<topic>`;
- write that child’s initial `objective.md`, `roadmap.md`, and `updates/` directory through existing Objective creation conventions;
- mark the selected umbrella roadmap item `[x]`;
- leave child implementation, review, parking, and closure to the child Objective.

The execution preview must name the selected item, intended child slug/title, files to create, and the one umbrella row to check off. Stop and ask before changing slug patterns, adding hidden state, spawning multiple children, editing child progress after creation, changing Objective CLI behavior, or touching external systems.

Branch creation, commits, Graphite operations, PR submission, publishing, deployment, and remote write APIs are out of scope unless the user explicitly asks for them in the confirmed preview.

## Historical Disposition

The old `landed-architecture-review` Objective was snapshot-based. It captured architecture seams from landed work across cmux workflows, Pi command execution/rendering/confirmation lifecycle, Graphite and source-control mutation UX, handoff artifacts layered over Branch Memory, slot lifecycle safety, saved-plan/planned-branch dispatch identity, and agent resource/skill ontology.

By the 2026-06-05 re-baseline, master had moved far enough that the original broad backlog was partly stale:

- The cmux command-suite review is complete. The useful slice consolidated `/cmux:workspace:dispatch-plan` onto shared slot-launch behavior in `cmux/slot.ts` and `cmux/worktree-description.ts`, with targeted TypeScript validation.
- Saved-plan / planned-branch / dispatch identity is superseded by `@asdl/planned-branch`, including shared content slug derivation, Branch Memory / git / Graphite gateways, and dispatch composition from the closed `planned-branch-ts-cli` and `planned-branch-quality-hardening` Objectives.
- Agent resource / skill ontology is substantially superseded by `areg-review-remediation`, including typed skill lockfile parsing, lockfile consistency checks, skill-install hardening, and `SkillxWorkspaceInstaller` gateway work.
- Source-control mutation UX and handoff artifacts were narrowed by landed work rather than left as broad original clusters.
- Failure-as-data and gateway-extraction conventions emerged as a useful cross-cutting topic from the same landed-work window.

The remaining unresolved or narrowed topics are now only checklist items for child Objective creation.

## Assumptions and Risks

Assumptions:

- Existing Objective prose policy is enough for `objective-next` to execute the simple child-creation workflow after preview and confirmation.
- The five retained items are the useful unresolved descendants from the old re-baseline.
- Future child Objectives will own their own implementation details, validation evidence, roadmap changes, and closure.

Risks:

- Future agents may re-complicate the umbrella into a mirrored tracker; the mitigation is the explicit Non-Goals and narrow Runner Policy.
- Child slugs may drift; the mitigation is the `landed-architecture-review-<topic>` prefix convention and intended slug on each roadmap row.
- The old Objective may remain active if it is only closed but not archived; the mitigation is archiving it under `.asdl/objective-archive/landed-architecture-review/`.
- If `objective-next` is run in recommend-only mode, it may recommend rather than execute; that is acceptable unless the user asks it to execute.

## Open Questions

No setup questions remain open for this umbrella. Future child Objectives may define their own open questions.

## Closure

Outcome: completed (2026-06-10). Every completion criterion is met:

- All five child Objectives were created: `landed-architecture-review-pi-cli-lifecycle`, `landed-architecture-review-source-control-mutation-ux`, `landed-architecture-review-handoff-brmem`, `landed-architecture-review-slot-occupancy-locality`, and `landed-architecture-review-failure-data-gateways`. All five have themselves since closed.
- The old `landed-architecture-review` parent Objective was closed and archived under `.asdl/objective-archive/landed-architecture-review/` as superseded provenance.
- Every roadmap checklist row is `[x]`; no unchecked child-creation items remain.

Verified on disk at closure time: each of the five child directories contains `closed.md`, and the archive directory exists. The umbrella never waited on child completion by design; the child records own their own evidence and closure context.
