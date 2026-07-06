# Eliminate Redundant Optional Undefined

## Thesis

This Objective is the single open standing record for autonomous follow-up work on redundant optional `undefined` in TypeScript declarations.

It continues from the closed `.ns/objectives/normalize-optional-undefined-boundaries` Objective. The closed Objective established the semantic process: inventory before editing, normalize loose inputs at boundaries, preserve compatibility surfaces deliberately, avoid regex-driven sweeps, and summarize before/after counts and rationale for every slice.

The standing goal is to continuously reduce semantically redundant `?: T | undefined` where a runner can make and validate a local semantic claim. It is not a blanket zero-count campaign. The Objective operates like a long-running cleanup/research loop: repeatedly inventory candidates, classify their semantics, make a review-substantive coherent improvement, validate it, record reusable findings, and continue in later sessions without requiring human steering for ordinary local slices.

The first full campaign pass completed on 2026-07-01: the repo-wide raw optional-undefined count reached zero by classifying every remaining candidate as either a plain omission-only optional or a typed `ExplicitUndefined<Reason, T>` compatibility contract (defined in `ts/packages/infra/foundation/src/primitives/primitives.ts` with a named reason vocabulary, for example `public-api-compatibility` on the kernel SDK surfaces). The standing loop now watches for reintroduced raw candidates and classifies or removes them; it does not revisit already-classified groups without new evidence.

## Scope

In scope:

- Keep one open Objective for redundant optional-undefined follow-up work.
- Autonomously pursue small, coherent cleanup slices across SDL TypeScript when the runner can justify that present-key `undefined` has no domain, compatibility, input, or external-conformance meaning.
- Use the closed normalization Objective as precedent and process source.
- For each cleanup slice, classify candidates before editing and remove explicit `undefined` only when present-key `undefined` has no domain, compatibility, input, or external-conformance meaning; when explicit `undefined` is compatibility-significant, record it as a typed `ExplicitUndefined` contract with a precise reason instead of leaving raw, unclassified debt.
- Normalize producers/builders/parsers before narrowing internal result, diagnostic, presentation, or durable-record shapes.
- Preserve `null` where it carries external or domain meaning while dropping only redundant explicit `undefined` when justified.
- Record before/after repo-wide counts and scoped counts, fields changed, semantic claims, preserved/deferred categories, validation evidence, and reusable classification findings when progress is kept.
- Treat the merged 2026-06-30 seed stack (PR #2420, PR #2423, PR #2428, PR #2429 — packagechk / GitHub PR feedback / pr-feedback-watch / preview-checks / worktree-status) as historical precedent and delivered evidence; new slices start from a fresh metric inventory rather than that seed list.

## Non-Goals

- Do not reopen the closed `normalize-optional-undefined-boundaries` Objective; it remains historical precedent.
- Do not create competing open Objectives for the same optional-undefined follow-up.
- Do not adopt a hard repo-wide ban, checked-in allowlist, CI guard, or zero-count target in this Objective unless a human explicitly approves that as a new scope decision. The raw count reaching zero is a measurement milestone, not approval for enforcement.
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
- Converting compatibility-significant raw `?: T | undefined` into typed `ExplicitUndefined<Reason, T>` contracts with a precise named reason, so remaining explicit-undefined surfaces are auditable rather than hidden.
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

The Objective's measurement instrument is the checked-in script `tools/measure-objective.mjs` in this record (run from the repo root as `node .ns/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs [scope ...]`). It reports four metrics per scope:

1. **Raw optional-undefined properties (net debt)**: unclassified `foo?: T | undefined` declarations. This is the primary metric. It reached zero repo-wide on 2026-07-01 and should stay at or near zero; nonzero readings are reintroductions to classify or remove.
2. **Typed explicit-undefined contracts**: `ExplicitUndefined<Reason, T>` usages. These are deliberate, audited surfaces, not debt; converting raw debt into a typed contract is progress even though this count rises.
3. **Legacy preserve markers**: stale preserve annotations from the earlier campaign. Should remain zero.
4. **Undefined-normalization/check lines**: omission-building or explicit-undefined adapter code such as `...(request.key === undefined ? {} : { key: request.key })` and `if (value !== undefined)` construction guards. This metric fluctuates: it can rise when a slice first normalizes producers/builders before narrowing upstream request objects, and should later fall as omission-only contracts move up the stack. Interpret it by boundary location, not as a monotonic target. It also drifts with unrelated repo growth.

Every kept Objective update and submitted Objective PR should display both before/after repo-wide counts and before/after scoped counts in its update/PR description, along with the measurement scopes and any important classification caveats. Repo-wide counts are mandatory even for narrow slices so the standing Objective always reports visible total remaining debt; scoped counts explain the local slice. These counts are the Objective's visible progress scorecard, not a replacement for semantic review.

Useful evidence includes the repo-wide and scoped before/after metrics, a short list of changed fields, construction-path evidence showing absent fields are omitted, preserved/deferred category notes, and relevant TypeScript validation results.

## Runner Policy

This is an autonomy-designed standing Objective for `objective-next`.

Direct local execution is allowed when the runner can select a coherent, review-substantive slice that satisfies the Definition of Progress and stays within repository-local edits, local validation, and Objective tracking. Future `objective-next` sessions may proactively offer or run such a slice under the normal confirmed-execution preview rules without asking the human to choose a candidate cluster first.

Execution granularity and review granularity are different. Autopilot may make small, reversible, locally validated edits or checkpoints while exploring a semantic boundary. PR granularity should usually be coarser: aggregate those steps into one coherent, review-substantive unit that a reviewer can understand as a single semantic claim.

Slice sizing biases coarser than the early narrow follow-up slices. Avoid both extremes: do not run broad repo-wide syntactic sweeps, but also do not spend a PR on a trivial file or tiny helper cluster when nearby candidates form one semantic package/subsystem cluster. As a default minimum, keep inventorying/classifying and include adjacent safe candidates until the proposed PR has at least 10 substantive edit sites / touched lines attributable to the optional-undefined cleanup. A smaller PR is acceptable only when the semantic boundary is genuinely exhausted, the change is independently review-substantive, or nearby candidates have been explicitly classified as unsafe/unrelated. Do not batch unrelated optional-undefined edits just to make the PR bigger. In the post-zero phase, a slice may legitimately be small when the entire reintroduced inventory is small; record the exhaustion evidence rather than padding.

Default runner loop:

1. Re-run the metric inventory with `tools/measure-objective.mjs` to find current raw candidates; do not revisit already-classified groups without new evidence.
2. Classify candidates before editing: remove now, convert to a typed `ExplicitUndefined` contract, preserve, or defer.
3. Pick a review-substantive coherent safe slice, biased toward a package/subsystem cluster of internal result/diagnostic/presentation/durable shapes and nearby producers/builders/parsers rather than the narrowest single-file edit.
4. Normalize construction or boundary code before narrowing types.
5. Run relevant TypeScript validation before keeping work.
6. Measure both repo-wide (`ts`) and scoped before/after counts with the measurement tool.
7. Record a Semantic Update only for kept progress, reusable classification findings, changed assumptions, validation evidence, metric-policy changes, or roadmap/policy changes; kept cleanup updates must include the repo-wide before/after scorecard as well as the scoped scorecard.
8. When PR submission is authorized, encode both repo-wide and scoped before/after metrics and their scopes in the PR description.
9. Leave local edits uncommitted unless the user explicitly asks for commit/PR workflow, then continue in a later invocation.

Ask or stop when candidate meaning is ambiguous, public compatibility is at risk, external schemas are involved, validation fallout crosses unrelated packages, a proposed PR slice is too broad to review or too tiny to justify as a standalone review unit, or the next useful step requires branch creation, committing, PR submission, merging, publishing, deployment, GitHub mutation, or another external write action not explicitly authorized. If the safe slice appears to be below the 10 substantive edit-site / touched-line default, prefer recording the classification and continuing inventory for an adjacent coherent cluster before opening a standalone PR.

PR submission, merging, publishing, deployment, and external write actions are out of scope unless explicitly requested or separately authorized in the current workflow.

## Assumptions and Risks

Assumptions:

- The closed normalization Objective's conservative process remains the right default for this repository.
- A long-running autonomous loop can make useful incremental progress if each slice remains small, semantic, validated, and evidence-recorded.
- Remaining explicit-undefined surfaces are either typed `ExplicitUndefined` contracts with named reasons or new reintroductions; raw candidates found by the tool are presumed unclassified debt until a runner classifies them.
- Qualitative semantic classification is more important than maximizing raw grep-count reduction.
- The measurement tool's patterns keep matching the repo's declaration style; large TypeScript refactors (package moves, renames) shift the auxiliary counts without changing the semantic model.

Risks:

- A second open Objective or a divergent hard-enforcement Objective would confuse agents about whether this is a semantic cleanup campaign or a zero-count ban.
- Tightening options/deps/external surfaces mechanically can create review noise and compatibility churn.
- Editing interfaces before producers can push `exactOptionalPropertyTypes` fallout across unrelated callsites.
- Null-sensitive cases can lose meaning if `null`, omission, and explicit `undefined` are collapsed without tracing consumers.
- Autonomous pursuit can drift into syntactic churn unless each slice records the semantic claim and stop/ask decisions.
- Without periodic re-inventory, reintroduced raw candidates accumulate silently; the loop's value in the post-zero phase depends on actually re-running the measurement.

## Open Questions

- Whether any future objective should separately pursue a hard guard/allowlist policy. That is explicitly outside this Objective unless approved as a new scope decision.
- Whether repeated autonomous slices reveal a small number of recurring preserved categories that should be documented in repo TypeScript guidance.
- Whether the reason vocabulary of `ExplicitUndefined` should stay in `ts/packages/infra/foundation` or graduate into shared TypeScript guidance as it stabilizes.

## Closure

Closed at explicit human direction after the post-zero follow-up loop reached a healthy no-actionable-debt state.

Final known candidate landscape: `node .ns/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs --json ts` reports 3 raw optional-undefined declarations, all 3 matched by Objective-owned classified-preserve metadata, 0 actionable raw optional-undefined debt, 96 typed `ExplicitUndefined` contracts, 0 legacy preserve markers, and 0 stale preserve metadata. The remaining raw declarations are intentional discriminated-union `?: undefined` arms: `next` and `stackEnd` in the no-next-branch arm of `MergeNumberedBranchOptions`, and `load` in `PreinstalledNsCommandPackageCatalogEntry`.

Delivered cleanup evidence includes the 2026-07-01 raw-zero milestone, the post-zero cleanup that removed the reintroduced omission-only brmem, GitHub PR feedback normalizer, and areg-test helper candidates, and the classified-preserve reporting slice that made the remaining preserve set auditable as metadata-backed non-debt. Recent validation evidence recorded for the final kept slices includes `pnpm --dir ts run check`, the relevant Vitest subset for areg/capability-kit/brmem, and the measurement tool `--self-test` and `--json ts` checks.

The standing autonomous watch loop is intentionally stopped rather than continued as a no-natural-finish-line Objective. Future reintroductions can be handled by a new Objective or routine TypeScript cleanup if they recur. A hard guard or repo-wide allowlist remains unimplemented and was not authorized as part of this closure.
