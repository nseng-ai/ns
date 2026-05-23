# Roadmap

## Work

- [ ] PR 1 — Add unified core Gh API while keeping old names temporarily
  - Add the new/reshaped PR-domain types: `PRDiscussionComment`, `PRLookupMiss`, `PRGatewayFailure`, `PRReviewThreadState`, `PRMergeOutcome`, enriched `PRSummary`, and unified `PRReview` creation result.
  - Expand `PRGateway`, `RealPRGateway`, and `FakePRGateway` to cover current lifecycle plus conversation operations now living behind `IssueGateway`.
  - Keep old `IssueGateway`/`RealIssueGateway`/`FakeIssueGateway` path alive only as a temporary parallel API so the PR is reviewable and green.
  - Update asdl-core unit, fake, real-sanity, and live-conformance tests for the additive unified API.

- [ ] PR 2 — Migrate `asdl-pr-address` to unified `PRGateway`
  - Replace `gh_issue_gateway` usage with `pr_gateway`.
  - Use `PRDiscussionComment`, unified `PRReview`, unified `PRSummary`, `PRLookupMiss` / `PRGatewayFailure`, and `PRReviewThreadState`.
  - Adjust resolve/unresolve and resolve-with-reply outputs away from fake-only `was_already_*` semantics toward trusted post-state.
  - Update `asdl-pr-address` scenario tests and result schemas.

- [ ] PR 3 — Migrate `asdl-reviewer`, `asdl-slots`, plugin smoke tests, and live wiring
  - Move reviewer contexts and findings-comment flows to `PRGateway` and `PRDiscussionComment`.
  - Update slots GC/lifecycle code for enriched `PRSummary` and the lookup-miss/failure split.
  - Update top-level plugin smoke tests and live GitHub conformance fixtures to the unified gateway.
  - Keep stack green after all production consumers no longer need `IssueGateway`.

- [ ] PR 4 — Delete old API names and finalize docs/Objectives
  - Delete `IssueGateway`, `RealIssueGateway`, `FakeIssueGateway`, direct issue-listing surface, and old result/type names once no production/test consumer remains.
  - Remove temporary compatibility shims and parallel-path tests.
  - Finalize `packages/asdl-core/CONTEXT.md` `## Gh` vocabulary and update `CONTEXT-MAP.md` if the relationship/ambiguity map needs the final language.
  - Update the `repo-ontology` Objective record if the refactor changes its Gh-context completion evidence, unresolved ambiguity list, or follow-up plan.
  - Run `just` and apply repo autofix recipes (`just fix`, `just dprint-fix`) rather than hand-formatting when needed.

## Parked

- A true GitHub issue-tracking gateway. No current production workflow uses direct issue listing; revisit only when a real issue-management workflow appears.
- A separate `PRConversationGateway`. The chosen direction is one unified `PRGateway`; split later only if actual consumer pressure makes the gateway too broad.
- A broad `GitHubGateway` or raw GitHub API client. This remains intentionally out of scope.
- Public skill updates that mention internal class/module names. If skills need changes, keep public skill text focused on CLI operations and user-facing behavior.
- Preserving deprecated aliases beyond the final PR. Temporary parallel names are allowed only while the stack is in flight.
