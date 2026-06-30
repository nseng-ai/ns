# Eliminate Redundant Optional Undefined

## Thesis

This Objective is the single open standing record for autonomous follow-up work on redundant optional `undefined` in TypeScript declarations.

It continues from the closed `.sdl/objectives/normalize-optional-undefined-boundaries` Objective. The closed Objective established the semantic process: inventory before editing, normalize loose inputs at boundaries, preserve compatibility surfaces deliberately, avoid regex-driven sweeps, and summarize before/after counts and rationale for every slice.

The standing goal is to continuously reduce semantically redundant `?: T | undefined` where a runner can make and validate a local semantic claim. It is not a blanket zero-count campaign. The Objective should operate like a long-running cleanup/research loop: repeatedly inventory candidates, classify their semantics, make a review-substantive coherent improvement, validate it, record reusable findings, and continue in later sessions without requiring human steering for ordinary local slices.

## Scope

In scope:

- Keep one open Objective for redundant optional-undefined follow-up work.
- Autonomously pursue small, coherent cleanup slices across SDL TypeScript when the runner can justify that present-key `undefined` has no domain, compatibility, input, or external-conformance meaning.
- Use the closed normalization Objective as precedent and process source.
- For each cleanup slice, classify candidates before editing and remove explicit `undefined` only when present-key `undefined` has no domain, compatibility, input, or external-conformance meaning.
- Normalize producers/builders/parsers before narrowing internal result, diagnostic, presentation, or durable-record shapes.
- Preserve `null` where it carries external or domain meaning while dropping only redundant explicit `undefined` when justified.
- Record before/after scoped counts, fields changed, semantic claims, preserved/deferred categories, validation evidence, and reusable classification findings when progress is kept.
- Continue to treat the already-submitted packagechk / GitHub PR feedback / pr-feedback-watch / preview-checks / worktree-status stack as current evidence and seed inventory, while allowing later autonomous slices elsewhere in the TypeScript workspace when they satisfy this Objective's policy.

## Non-Goals

- Do not reopen the closed `normalize-optional-undefined-boundaries` Objective; it remains historical precedent.
- Do not create competing open Objectives for the same optional-undefined follow-up.
- Do not adopt a hard repo-wide ban, checked-in allowlist, CI guard, or zero-count target in this Objective unless a human explicitly approves that as a new scope decision.
- Do not perform broad package-wide or repo-wide mechanical rewrites just to reduce grep counts.
- Do not tighten public SDK/kernel, CLI option, dependency bag, external payload mirror, environment/process, Zod input, or fixture/fake-builder surfaces unless a separate normalized internal type or explicit semantic claim justifies it.
- Do not collapse meaningful `null`, omission, and explicit-undefined distinctions accidentally.
- Do not submit PRs, merge, publish, deploy, mutate GitHub state, or perform other external write actions unless explicitly requested in the current session or authorized by a separate workflow.

## Completion Criteria

This is a standing Objective. It has no goal-met finish line. Close it when the goal is obsolete, superseded by another Objective, no longer worth maintaining, intentionally abandoned by a human, or replaced by an explicitly approved hard-enforcement / allowlist Objective.

Closure should summarize the final known candidate landscape, delivered cleanup evidence, preserved categories, validation posture, and the reason autonomous pursuit should stop.

## Definition of Progress

Progress is keepable when it improves the semantic optional-undefined model by doing one or more of:

- Removing `| undefined` from optional properties where present-key `undefined` has no domain, compatibility, input, or external-conformance meaning.
- Normalizing producers, builders, parsers, or adapters so internal result/presentation/diagnostic/durable shapes can honestly use omission-only optional properties.
- Splitting loose external/input/compatibility surfaces from stricter internal types.
- Classifying candidates into remove / preserve / defer categories with rationale future agents can reuse.
- Reducing scoped candidate counts without broad mechanical rewrites.
- Adding or preserving validation evidence for touched packages.
- Recording durable findings that prevent future runners from rediscovering the same semantic boundary.

Do not keep changes that:

- Tighten public/input/options/dependency/environment/signal surfaces without explicit semantic justification.
- Collapse meaningful `null`, omission, and explicit-undefined distinctions.
- Create broad unrelated type fallout or review noise.
- Reduce grep counts by mechanical rewrite alone.
- Mix unrelated cleanup domains into the same slice only because they share the same syntax.

Useful evidence includes scoped before/after grep counts, a short list of changed fields, construction-path evidence showing absent fields are omitted, preserved/deferred category notes, and relevant TypeScript validation results.

## Runner Policy

This is an autonomy-designed standing Objective for `objective-next`.

Direct local execution is allowed when the runner can select a coherent, review-substantive slice that satisfies the Definition of Progress and stays within repository-local edits, local validation, and Objective tracking. Future `objective-next` sessions may proactively offer or run such a slice under the normal confirmed-execution preview rules without asking the human to choose a candidate cluster first.

Slice sizing should now bias coarser than the early narrow follow-up slices. Avoid both extremes: do not run broad repo-wide syntactic sweeps, but also do not spend a PR/commit on a trivial file or tiny helper cluster when nearby candidates form one semantic package/subsystem cluster. Prefer package/subsystem-level slices such as all safe internal `worktree-status` omission-only option/result/helper fields, a cohesive `pr-previews` internal command/model/view cleanup, a `pr-feedback-watch` internal model/rendering/API-helper cleanup, or a GitHub PR feedback parser/fingerprint/internal-diagnostic cleanup. As a default minimum, keep inventorying/classifying and include adjacent safe candidates until the proposed PR has at least 10 substantive edit sites / touched lines attributable to the optional-undefined cleanup. A smaller slice is acceptable only when the semantic boundary is genuinely exhausted, the change is independently review-substantive, or nearby candidates have been explicitly classified as unsafe/unrelated.

Default runner loop:

1. Recompute or narrow an inventory of `?: ... | undefined` candidates.
2. Classify candidates before editing: remove now, preserve, or defer.
3. Pick a review-substantive coherent safe slice, biased toward a package/subsystem cluster of internal result/diagnostic/presentation/durable shapes and nearby producers/builders/parsers rather than the narrowest single-file edit.
4. Normalize construction or boundary code before narrowing types.
5. Run relevant TypeScript validation before keeping work.
6. Record a Semantic Update only for kept progress, reusable classification findings, changed assumptions, validation evidence, or roadmap/policy changes.
7. Leave local edits uncommitted unless the user explicitly asks for commit/PR workflow, then continue in a later invocation.

Ask or stop when candidate meaning is ambiguous, public compatibility is at risk, external schemas are involved, validation fallout crosses unrelated packages, a proposed slice is too broad to review or too tiny to justify a standalone PR/commit, or the next useful step requires branch creation, committing, PR submission, merging, publishing, deployment, GitHub mutation, or another external write action not explicitly authorized. If the safe slice appears to be below the 10 substantive edit-site / touched-line default, prefer recording the classification and continuing inventory for an adjacent coherent cluster before opening a standalone PR.

PR submission, merging, publishing, deployment, and external write actions are out of scope unless explicitly requested or separately authorized in the current workflow.

## Assumptions and Risks

Assumptions:

- The closed normalization Objective's conservative process remains the right default for this repository.
- A long-running autonomous loop can make useful incremental progress if each slice remains small, semantic, validated, and evidence-recorded.
- Some remaining candidates are legitimate option/input/deps/config or external mirror surfaces and should remain until a local semantic claim is available.
- Qualitative semantic classification is more important than maximizing raw grep-count reduction.

Risks:

- A second open Objective or a divergent hard-enforcement Objective would confuse agents about whether this is a semantic cleanup campaign or a zero-count ban.
- Tightening options/deps/external surfaces mechanically can create review noise and compatibility churn.
- Editing interfaces before producers can push `exactOptionalPropertyTypes` fallout across unrelated callsites.
- Null-sensitive cases can lose meaning if `null`, omission, and explicit `undefined` are collapsed without tracing consumers.
- Autonomous pursuit can drift into syntactic churn unless each slice records the semantic claim and stop/ask decisions.

## Open Questions

- Whether any future objective should separately pursue a hard guard/allowlist policy. That is explicitly outside this Objective unless approved as a new scope decision.
- Whether repeated autonomous slices reveal a small number of recurring preserved categories that should be documented in repo TypeScript guidance.
