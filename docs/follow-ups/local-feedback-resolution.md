# Follow-up: Local feedback resolution (pre-PR review-to-fix loop)

**Point in time:** 2026-07-18\
**Origin:** the `local-feedback-resolution` Objective and its seven-PR Graphite stack (`add-local-feedback-resolution-foundation` #3715 → `crystallize-manual-review-steelthread` #3718 → `reviews-revision-range-roster-core` #3722 → `lm-backed-review-aggregation-resolution` #3724 → `refactor-review-runners-structured-output` #3752 → `split-review-aggregation-resolution-api` #3753), closed unmerged on 2026-07-18 with all branches deleted. The Objective record (`.ns/objectives/local-feedback-resolution/`) existed only on those branches and was never on `master`; this note is its surviving capture.\
**Status at capture:** requirements fully crystallized into a manual-first steelthread roadmap; extension-layer implementation (roster runs, LM aggregation, engineer resolution) built and reviewed but never landed; command-journey and real-usage exercise never started.

## The idea

Give engineers a coherent **local, pre-PR path from adversarial review to validated candidate fixes**:

- Run multiple engineer-authored, engineer-controlled adversarial Review definitions locally against an explicit revision range, before a PR exists.
- Combine findings from all applicable reviewers into one resolution journey while preserving per-reviewer source, severity, and evidence.
- Have a model propose finding **clusters** (never silently merge), with engineer-correctable proposals, recommendation-conflict flags, and actionability.
- Triage at cluster level with per-finding accounting, using simple dispositions: `fix`, `fix-manually`, `reject`, `defer`; support bulk confirmation but force flagged conflicts through explicit engineer attention.
- Steer confirmed clusters into an engineer-confirmed **ordered planned-PR list** (title plus complete member-cluster references) for manual remediation.
- Later stages (explicitly deferred): apply candidate fixes in a disposable ordinary slot/worktree with structured outcomes and validation evidence; never mutate the engineer's active checkout.

The result was framed as base infrastructure — structured findings, triage decisions, candidate changes, and validation outcomes reusable by later TUI, web, PR-feedback, and landing experiences — without committing to those surfaces. It was edge-linked to `prod-submit-roast-and-fix`: this work owned the submit/ship-independent local review-to-fix foundation; that Objective retains Flow orchestration and shipping policy.

## Requirements decisions already made (2026-07-16 Semantic Updates)

The requirements Frontier was resolved through eight recorded decisions; the crystallized steelthread encoded:

- **Explicit range and roster:** the engineer confirms a revision range and a review roster up front; roster runs load the range diff once for applicability and all selected reviews.
- **Continue-on-review-failure execution:** individual runner failures do not abort the run; toggled-off and failed reviews are retained in the run record for coverage visibility.
- **Cluster-never-merge, proposed-and-correctable model judgment:** LM clustering is a proposal; every original finding is preserved exactly once; the engineer can iteratively correct clusters.
- **Cluster-level triage with per-finding accounting** and deterministic disposition totals.
- **Ordered planned PRs** as the manual remediation output.
- **Minimal artifact baseline:** simple run/finding/final-state records; no premature persistence, package-boundary, or cross-source data-model decisions.
- **Manual-first staging:** autofix (disposable-worktree fix application), validation evidence, and submit/ship integration deliberately parked behind the manual steelthread.

Non-goals held throughout: no `ns flow submit`/`ship`/landing/deploy design, no TUI/web UI in the first loop, no GitHub human-feedback or third-party-reviewer ingestion, no automatic mutation/commit/push of the engineer's checkout, and stakeholder "conversational change review / agentic CI/CD / Ships" proposals treated as motivating context, not accepted requirements.

## What was actually built (closed unmerged)

The extension-layer slices existed as working, tested code on the deleted branches:

- **Revision-range roster runs** (#3722): Reviews Capability API extension with strict roster request/result contracts — ordered entries, coverage, usage, failures, timestamped source-attributed finding occurrences; revision-range Git diffs; typed progress; read-only execution; `ns reviews run` single-review compatibility preserved.
- **LM-backed aggregation** (#3724, reshaped by #3753): one schema-constrained LM call clustering roster findings while preserving every source-attributed finding exactly once; iterative correction; conflict-aware bulk confirmation; typed all-or-nothing failures; no persistence or checkout mutation.
- **Shared structured-output transport** (#3752): Claude Code, Codex, and Pi subprocess execution centralized behind one routing transport (harness dispatch, binary resolution, cancellation, output parsing, usage normalization) with domain runners owning prompt construction and payload validation. This refactor may be independently valuable to the Reviews capability regardless of this feature.
- **Proposal/resolution split** (#3753): `aggregateReviewRoster` replaced by LM-backed `proposeReviewAggregation` plus runtime-free, pure `resolveReviewAggregation` (exact-cluster-membership confirmed-state preservation, explicit conflict state, dispositions, bulk confirmation).

Never started: the end-to-end local command journey (range/roster confirmation UX, report-to-prompt stage boundaries, correction and bulk-triage interaction, planned-PR steering) and exercising the steelthread on representative real pre-PR changes.

## Risks and design cautions recorded

- Over-normalizing findings can erase reviewer provenance and disagreements, creating false triage confidence.
- Model-proposed clusters and fixes can look authoritative despite uncertainty; human control and uncertainty must stay visible.
- "Validated" must state exactly what ran; incomplete validation must not read as "safe".
- Reusing the Address workflow for both local findings and GitHub messages risks forcing unlike feedback into one workflow; source semantics must be preserved rather than unified for its own sake.
- The effort drifts easily toward the much broader agentic-CI/CD vision and fails to deliver the bounded local loop.

## Reverify before acting

- Whether the closed PR branches' code is recoverable/still relevant (closed PRs #3715–#3754 retain their diffs on GitHub even after branch deletion; check remote refs).
- The current state of the Reviews and Address extensions — the roster/aggregation APIs were designed against their 2026-07 shape.
- Whether `prod-submit-roast-and-fix`, `roaster-review-convergence`, or `reviews-via-pi-gateway` have since absorbed or obsoleted parts of this scope.
- The shared structured-output transport (#3752) as a possible first, standalone re-landing candidate.

## Promotion trigger

Recreate this as an Objective (seeded from this note plus the closed PRs) when there is renewed appetite for a local pre-PR review loop, or when `prod-submit-roast-and-fix` needs the submit-independent review-to-fix foundation it was edge-linked to.
