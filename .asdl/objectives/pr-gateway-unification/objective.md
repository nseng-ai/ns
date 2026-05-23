# PRGateway Unification

## Thesis

The `asdl-core.gh` boundary currently exposes two gateway names, `IssueGateway` and `PRGateway`, because GitHub implements pull-request conversation features through a mixture of PR, issue-comment, REST, GraphQL, and `gh` CLI surfaces. That implementation detail has leaked into asdl's domain language: current workflows are PR-centered, but consumers talk about `IssueGateway`, `IssueComment`, `PRDetails`, `PRReviewSubmission`, lookup errors, command errors, and fake-only thread-state booleans.

The refactor should make `PRGateway` the single canonical gateway for current GitHub pull-request workflows. It should unify lifecycle, review, thread, inline-comment, discussion-comment, reaction, changed-file, and guarded-merge operations behind PR-domain vocabulary while keeping GitHub's lower-level issue-comment endpoints private to the real implementation. The end state should match the Gh context language from the repo-ontology grilling: no `IssueGateway` in production API, no compatibility shims in the final state, and clear distinctions among PR review events, review threads, review comments, discussion comments, inline comment drafts, PR diff anchors, lookup misses, and gateway failures.

## Scope

- Add a unified `PRGateway` surface in `asdl-core.gh` covering all current GitHub PR workflows:
  - branch-to-PR lookup, PR search, PR lifecycle state, enriched PR summaries, and guarded merge/auto-merge;
  - PR review reads and creation;
  - PR review thread reads, replies, resolve, and unresolve;
  - PR discussion comment reads, creation, update-by-marker workflows, and reactions;
  - PR changed files for inline commentability.
- Reshape Gh domain types around PR vocabulary:
  - `IssueComment` becomes `PRDiscussionComment`.
  - `PRReviewSubmission` merges into `PRReview`; creating a review should parse the author from GitHub's response rather than dropping it.
  - `PRDetails` merges into `PRSummary`; `PRSummary` carries head commit OID even if that means modest overfetching.
  - `PRLookupError` and `PRCommandError` split into `PRLookupMiss` for successful negative lookup and `PRGatewayFailure` for `gh`/GitHub/API failures.
  - `ResolveReviewThreadResult` and `UnresolveReviewThreadResult` become `PRReviewThreadState`, reporting trusted post-mutation state rather than fake-only `was_already_*` pre-state claims.
  - `PRMergeResult` becomes `PRMergeOutcome`; stdout/stderr are diagnostics, not success-domain fields.
  - Keep `PRReviewState` as GitHub's full review-state vocabulary and name the `COMMENTED` / `APPROVED` / `CHANGES_REQUESTED` subset as actionable PR reviews in code/docs where needed.
- Migrate consumers to the unified gateway:
  - `asdl-pr-address` should depend on `PRGateway`, use PR-domain comment/review/thread types, and adjust CLI results that currently expose `was_already_resolved` / `was_already_unresolved`.
  - `asdl-reviewer` should use `PRGateway` and `PRDiscussionComment` for findings comments and bot-comment update flows.
  - `asdl-slots` should consume the unified `PRSummary` and `PRLookupMiss` / `PRGatewayFailure` split.
  - top-level plugin smoke tests and live GitHub conformance wiring should follow the unified gateway.
- Keep the stack reviewable by allowing temporary parallel old/new API names in intermediate PRs, but the final PR must hard-delete the old names and shims.
- Update context/docs alignment as part of the refactor, including `packages/asdl-core/CONTEXT.md`, `CONTEXT-MAP.md` if needed, and the `repo-ontology` Objective record if the refactor changes that Objective's Gh-context completion evidence or follow-up plan.

## Non-Goals

- Do not add new GitHub product surfaces beyond current PR-centered workflows. True issue-tracking workflows are out of scope; if they appear later, they can earn their own issue-focused gateway.
- Do not preserve final compatibility aliases, deprecated modules, or re-export shims for `IssueGateway`, `RealIssueGateway`, `FakeIssueGateway`, `IssueComment`, `PRDetails`, `PRReviewSubmission`, `PRLookupError`, `PRCommandError`, `PRMergeResult`, `ResolveReviewThreadResult`, or `UnresolveReviewThreadResult`.
- Do not broaden the gateway into a generic `GitHubGateway` or raw API client. Keep the boundary capability-shaped and PR-centered.
- Do not change public CLI command names unless required by changed result semantics. The refactor is primarily domain/API cleanup, not a user-facing command redesign.
- Do not hide gateway failures by raising arbitrary subprocess exceptions from PR operations. Failure behavior should be explicit at the gateway boundary.
- Do not change Graphite, Git, Clinkr, or non-Gh ontology except for necessary imports, tests, and relationship documentation caused by this refactor.

## Completion Criteria

- `asdl-core.gh` has one canonical PR gateway interface, real implementation, and fake implementation for current GitHub PR workflows.
- No production code imports or exposes `IssueGateway`, `RealIssueGateway`, `FakeIssueGateway`, or direct issue-listing domain types for current PR workflows.
- `IssueComment` is replaced by `PRDiscussionComment` in production and tests; GitHub issue-comment REST endpoints remain only an implementation detail inside the real gateway.
- `PRReviewSubmission` is gone; review creation returns `PRReview` with author, review state, body, and submitted timestamp.
- `PRDetails` is gone; `PRSummary` is the single PR metadata record and includes the head commit OID used by guarded merge flows.
- `PRLookupMiss` and `PRGatewayFailure` replace the current lookup/command error split, and consumers distinguish negative lookup answers from gateway failures.
- Review-thread resolve/unresolve returns trusted post-mutation state via `PRReviewThreadState`; CLI outputs no longer claim fake-only `was_already_*` pre-state unless they explicitly perform a pre-read.
- Guarded merge success returns `PRMergeOutcome`; raw stdout/stderr are not success-domain fields.
- `asdl-pr-address`, `asdl-reviewer`, `asdl-slots`, plugin smoke tests, live conformance wiring, and core gateway tests all pass against the unified API.
- The final stack contains no compatibility shims for the removed old names.
- `packages/asdl-core/CONTEXT.md` and `CONTEXT-MAP.md` reflect the final Gh vocabulary; the `repo-ontology` Objective is updated if this refactor supersedes, completes, or changes its Gh-context plan.
- `just` passes at stack tip after formatter/autofix recipes are used as required by repo instructions.

## Assumptions and Risks

Assumptions:

- All current in-repo GitHub workflows are PR-centered. Direct issue listing exists only in the current gateway/tests and unused conformance wiring, not in production workflows.
- `PRGateway` is the right final name. A broader `GitHubGateway` would become a dumping ground, and a separate `PRConversationGateway` would add premature split complexity.
- Modest overfetching of head commit OID into `PRSummary` is acceptable to avoid keeping a separate `PRDetails` concept.
- GitHub's review creation response can supply enough author information to return a full `PRReview`; if the author is missing, the existing deleted-author convention of an empty string remains acceptable.
- GitHub thread resolve/unresolve mutations provide trustworthy post-state, but not reliable pre-state/no-op information. Consumers that need pre-state can read before mutating.
- Temporary parallel API names are acceptable in intermediate PRs as long as the final PR hard-deletes them.

Risks:

- The refactor touches many consumers and tests; a single hard-cut PR would be hard to review. Mitigation: land as a 4-PR stack with additive core API first, then consumer migrations, then deletion/docs cleanup.
- CLI JSON outputs for resolve/unresolve may change. Mitigation: keep changes explicit in scenario tests and document the semantic improvement from fake-only `was_already_*` to post-state.
- Real GitHub API response shapes may differ between REST, GraphQL, and `gh` porcelain paths. Mitigation: update real gateway sanity tests and live conformance wiring around the unified API, especially create-review author parsing and thread post-state parsing.
- Deleting direct issue-listing support may surprise future code that expected `IssueGateway.list`. Mitigation: current evidence shows no production consumer; if true issue workflows appear later, create a separate issue-focused gateway rather than preserving confusing PR terminology now.
- Updating `repo-ontology` Objective files from this stack can blur Objective ownership. Mitigation: only update that Objective when the code refactor materially changes Gh-context completion evidence or follow-ups; keep `pr-gateway-unification` as the implementation Objective.
- Public skills must not mention internal class/module names. Any skill/doc updates must describe CLI operations and user-facing behavior rather than `asdl_core.gh` internals unless the skill is internal.

PR 1 evidence de-risks the additive core gateway shape: real and fake core tests now cover the unified PRGateway surface, PR discussion comment parsing, review creation author parsing, review-thread post-state parsing, `PRSummary.head_ref_oid` population, and guarded merge success/failure result semantics.

PR 2 evidence de-risks the first production consumer migration and answers the CLI-result naming questions for `asdl-pr-address`: review-thread mutation outputs now expose `is_resolved` as trusted post-mutation state and drop fake-only `was_already_*` pre-state claims.

PR 3 evidence de-risks the remaining consumer and wiring migration: reviewer contexts and publication flows, slots GC lookup handling, plugin smoke coverage, and live GitHub conformance wiring now use the unified PR gateway vocabulary. Final old-name deletion and final docs alignment remain active risks or follow-ups for PR 4.

## Open Questions

- Should direct `Issue` and issue-listing tests be deleted outright in the final deletion PR, or moved to parked notes explaining that true issue workflows are intentionally absent?
- Does `CONTEXT-MAP.md` need a Phase 4 ambiguity entry for the historical Issue/PR naming leak after the final cleanup, or is the cleaned `## Gh` section enough?
