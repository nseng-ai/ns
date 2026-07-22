# Fix branch PR checks snapshot consistency and completeness

## Goal and outcome

Repair the two HIGH findings from the thermo-nuclear review of PR #3725 without changing the successful `ns address exec branch-pr-checks` machine-output shape:

1. Every paginated check or review-thread continuation page must belong to the same PR head SHA observed by the initial branch query. If the head moves, fail the whole invocation with a structured pagination error and require the caller to rerun; never combine pages from different heads.
2. `collectBranchPrChecks` must refuse to derive or publish `pr_status` from a gateway outcome whose check connection is still partial (`counts.hasMore: true`), even when an injected gateway violates the real adapter’s complete-only contract.

Use vertical-slice TDD at the two agreed observable seams:

- the real GitHub adapter protocol seam in `ts/packages/capability-kit/test/github/github-pr-feedback.test.ts`;
- the capability core/injected-gateway seam in `ts/packages/capabilities/pr-feedback/test/unit/core-branch-pr-checks.test.ts`.

The completed change should preserve branch order, missing/ambiguous behavior, existing success payload fields, freshness semantics, and the current all-or-failure pagination policy.

## Context and discovered facts

### Provenance

- Planning checkout: `branch-pr-checks-complete-pagination-freshness`
- Reviewed head: `8027215ff07949f68886890b0a369b06c600e7d7`
- PR parent / diff base: `0659847dce620325dc1313fb1d6cf7437e230956` (`rewrite-stack-repair-skill`)
- Pull request: #3725, “Enrich branch PR checks with complete triage and freshness data”
- Working tree was clean when this plan was prepared.

These identifiers are forensic provenance, not a requirement that implementation run on a branch with the same name. The attached plan and implementation-session branch context are authoritative.

### Current implementation

- `branchPrChecksQuery` in `ts/packages/capability-kit/src/github/pr-feedback/queries.ts` fetches `headRefOid`, the matching latest commit, the first 100 check contexts, and the first 100 review threads for each branch.
- `RealGithubPrFeedbackGateway.normalizeBranchPrChecksResponse` in `ts/packages/capability-kit/src/github/pr-feedback/gateway.ts` verifies the initial commit OID equals the initial `headRefOid`, then paginates checks and threads.
- `branchPrCheckContextsQuery` and `branchPrCheckThreadsQuery` select continuation pages by PR number but currently do not request `headRefOid`.
- The continuation response schemas in `ts/packages/capability-kit/src/github/pr-feedback/schemas.ts` likewise contain no head identity.
- The gateway currently normalizes a successfully exhausted connection with `hasMore: false` and returns no partial branch outcomes after a continuation failure.
- `GithubBranchPrChecksOutcome` in `ts/packages/capability-kit/src/github/pr-feedback/types.ts` uses the general `GithubStatusChecks` shape, so `checks.counts.hasMore: true` remains representable at the injected gateway seam.
- `collectBranchPrChecks` in `ts/packages/capabilities/pr-feedback/src/core/branch-pr-checks.ts` maps every successful gateway outcome directly to a classified entry and does not verify `hasMore` before deriving `pr_status`.
- `core-branch-pr-checks.test.ts` currently constructs a found outcome with `hasMore: true` and expects successful classification, directly codifying the defect.

### Existing contract and failure vocabulary

The durable contract is `.ns/objectives/stack-repair-loop-hardening/references/branch-pr-checks-json-contract.md`. Its pagination section already requires:

- all check and review-thread pages to be fetched;
- `counts.hasMore: false` for every successful found entry;
- no classification from partial data;
- whole-command failure for invalid continuation state.

Existing gateway failures already provide the right family of semantics:

- code: `github_pr_feedback_pagination_invalid` for continuation invariants;
- operation: `getBranchPrChecks`;
- contextual details: `prNumber` and `cursorContext` (`branchPrCheckContexts` or `branchPrCheckReviewThreads`).

The command boundary maps a gateway/core failure through `prFeedbackFailureExit` to the existing `pr-gateway-failure` Clinkr failure. No new CLI status, flag, result field, or exit-code behavior is needed.

### Decisions from structured grilling

- Prove the repair at both the real gateway protocol seam and the capability core seam.
- If any continuation page reports a head SHA different from the initial SHA, fail closed and require a rerun. Do not add automatic retries or a restart state machine.
- Use TDD one vertical slice at a time; do not write all tests before implementation.

### Rejected alternatives

- **Automatically restart the affected PR or whole batch:** rejected because it adds retry limits and another race window while hiding that the observed head changed. A structured failure plus caller rerun is simpler and consistent with existing all-or-failure pagination behavior.
- **Trust only the real adapter to set `hasMore: false`:** rejected because `PrAddressGithubGateway` is an injected public seam. The core must fail closed if another implementation or future regression supplies partial facts.
- **Parallelize or restructure all pagination orchestration:** out of scope. The adversarial review dropped this concern because it adds scheduling/rate-limit complexity without addressing either confirmed defect.
- **Introduce branch-batch chunking or split the large gateway test file:** out of scope for this repair; neither is required to restore the two violated invariants.

## Scope

### In scope

- `ts/packages/capability-kit/src/github/pr-feedback/queries.ts` — include PR head identity on both continuation query shapes.
- `ts/packages/capability-kit/src/github/pr-feedback/schemas.ts` — validate the continuation head identity returned by GitHub.
- `ts/packages/capability-kit/src/github/pr-feedback/gateway.ts` — compare every continuation page’s OID with the initial expected OID and return a structured pagination failure on movement.
- `ts/packages/capability-kit/test/github/github-pr-feedback.test.ts` — adapter-level red/green scenarios for moved heads during check and thread pagination, while retaining successful same-head pagination coverage.
- `ts/packages/capabilities/pr-feedback/src/core/branch-pr-checks.ts` — reject any successful gateway result containing a found outcome with `checks.counts.hasMore === true` before deriving entries.
- `ts/packages/capabilities/pr-feedback/test/unit/core-branch-pr-checks.test.ts` — replace the test that blesses partial classification with a red/green fail-closed contract test and keep complete classification coverage.
- `.ns/objectives/stack-repair-loop-hardening/references/branch-pr-checks-json-contract.md` — clarify that every continuation page is revalidated against the initial `headRefOid` and head movement is a whole-command failure.

`ts/packages/capability-kit/src/github/pr-feedback/types.ts` may be touched only if a small type refinement materially clarifies the continuation response or complete-result invariant. Runtime core validation remains required even if a narrower compile-time type is introduced.

### Out of scope

- `wait-for-checks` settlement behavior; it was not one of the two retained findings.
- REST fingerprint pagination, bulk review-thread resolution, and generic PR lookup schema redesign; these were outside the reviewed change or were not retained by the adversarial challenge.
- Changing `pr_status`, freshness, trailing-check, pending-check, cancelled-check, or unknown-check semantics.
- Adding retries, concurrency, branch batch limits, or a new pagination framework.
- Changing the CLI input/output schema or introducing a new failure code when the existing pagination-invalid and gateway-failure paths are sufficient.
- Splitting the existing 2,000-line gateway test file solely for file size; moving tests would not delete concepts or fix these invariants.

## Files, symbols, tests, and docs

### Production symbols

- `branchPrCheckContextsQuery`, `branchPrCheckThreadsQuery` — `ts/packages/capability-kit/src/github/pr-feedback/queries.ts`
- `ghBranchPrCheckContextsResponseSchema`, `ghBranchPrCheckThreadsResponseSchema` — `ts/packages/capability-kit/src/github/pr-feedback/schemas.ts`
- `RealGithubPrFeedbackGateway.getBranchPrChecks`
- `RealGithubPrFeedbackGateway.normalizeBranchPrChecksResponse`
- `RealGithubPrFeedbackGateway.collectGraphqlPages` — reuse its per-page `connectionFromResponse` callback; do not create a second pagination loop
- `GithubBranchPrChecksOutcome` — `ts/packages/capability-kit/src/github/pr-feedback/types.ts`
- `collectBranchPrChecks`, `branchPrChecksEntry` — `ts/packages/capabilities/pr-feedback/src/core/branch-pr-checks.ts`

### Existing test helpers and anchors

- `branchPrNode`, `branchPrChecksResponse`, `ScriptedCommandRunner`, `branchPrCheckContextsPageArgs`, and `branchPrCheckThreadsPageArgs` in `ts/packages/capability-kit/test/github/github-pr-feedback.test.ts`
- Existing scenario: `completes branch check and review-thread continuation pages`
- Existing malformed/null/later-page failure scenarios around the same branch pagination block
- `InMemoryGithubPrFeedbackGateway` and `collectFoundEntry` support in the capability tests
- Current first unit test in `core-branch-pr-checks.test.ts`, which supplies `hasMore: true` and must no longer expect a successful classified collection

## Implementation steps

### 1. TDD slice: reject a moved head during check-context pagination

**Red:** In `github-pr-feedback.test.ts`, add one focused real-adapter scenario:

1. Initial branch response identifies PR 101 at `headRefOid: "abc101"`, includes a matching head commit, and advertises another check page.
2. The scripted check continuation response returns `headRefOid: "new-head"` plus an otherwise valid check connection.
3. Assert `getBranchPrChecks` returns `ok: false`, code `github_pr_feedback_pagination_invalid`, operation `getBranchPrChecks`, PR 101, and cursor context `branchPrCheckContexts`.
4. Assert the scripted runner is exhausted and no partial value is returned.

Run the narrow gateway test and confirm this new test fails for the expected reason before production edits.

**Green:** Make the minimum cohesive protocol change:

- Add `headRefOid` to `branchPrCheckContextsQuery`’s `pullRequest` selection.
- Add the corresponding field to `ghBranchPrCheckContextsResponseSchema`.
- In the check continuation `connectionFromResponse` callback, compare the continuation `headRefOid` to the initial `node.headRefOid` before returning the connection.
- On mismatch, return `feedbackErr(failureFromMessage(...))` using `github_pr_feedback_pagination_invalid`, `getBranchPrChecks`, the PR number, and `branchPrCheckContexts`. The message should state that the PR head changed during pagination and the caller must rerun.
- Keep malformed/null rollup handling intact.

Rerun the narrow gateway test until green. Do not implement the thread case yet.

### 2. TDD slice: reject a moved head during review-thread pagination

**Red:** Add the analogous real-adapter test for a thread continuation page:

1. Initial response is at `abc101` and advertises another review-thread page.
2. Continuation returns a different head OID and an otherwise valid thread connection.
3. Assert the same pagination-invalid failure shape with cursor context `branchPrCheckReviewThreads` and no partial result.

Confirm red.

**Green:**

- Add `headRefOid` to `branchPrCheckThreadsQuery`.
- Extend `ghBranchPrCheckThreadsResponseSchema` accordingly.
- Verify the expected initial OID in the thread continuation callback before accepting its connection.
- Reuse one small failure-construction helper only if it removes duplicated message/context assembly across the two callbacks; do not introduce a generic pagination abstraction or wrapper around `collectGraphqlPages`.

Rerun the narrow gateway test. Also update the existing successful continuation fixture(s) to return the unchanged expected OID, proving same-head pagination still completes and deduplicates workflow attempts only after all pages are collected.

### 3. TDD slice: reject partial check outcomes at the capability core seam

**Red:** In `core-branch-pr-checks.test.ts`, replace or split the current first scenario so a gateway outcome with a found PR and `checks.counts.hasMore: true` expects `collectBranchPrChecks` to return `type: "failure"`, not a collection or `pr_status`.

The assertion should independently specify a stable failure shape:

- code `github_pr_feedback_response_invalid` (the gateway contract supplied an invalid successful response);
- operation `getBranchPrChecks`;
- a message identifying the branch/PR and incomplete check pagination.

Use the existing in-memory gateway constructor state rather than mocking internal functions. Confirm red.

**Green:** In `collectBranchPrChecks`, validate the entire successful outcome array before mapping any entry:

- Find any `type: "found"` outcome whose `checks.counts.hasMore` is true.
- Return a `BranchPrChecksResult` failure immediately with no partial collection and no readiness classification.
- Represent the boundary violation as a `GithubPrFeedbackFailure` using the existing `github_pr_feedback_response_invalid` vocabulary and `getBranchPrChecks` details. Keep this check local and direct; do not add a general validation framework.
- Only after the completeness guard passes should `outcomes.value.map(branchPrChecksEntry)` run.

Then restore/retain a separate complete (`hasMore: false`) test covering ordinary found-entry classification and request order. This ensures the red test does not erase positive behavior coverage.

A narrower `GithubBranchPrChecksOutcome` type may be added as compile-time documentation only if it stays small and does not force casts in the defensive runtime test. The runtime guard is the acceptance requirement because injected JavaScript, fakes, and future adapters can still violate structural intent.

### 4. Clarify the durable contract

Precisely edit `.ns/objectives/stack-repair-loop-hardening/references/branch-pr-checks-json-contract.md`:

- State that each check/thread continuation response must carry the PR head OID and match the initial observation.
- State that a moved head is a pagination-invalid whole-command failure and callers rerun; no automatic restart is promised.
- State that the capability layer rejects partial found outcomes from any gateway implementation before deriving `pr_status`.

Do not change the successful JSON example or add a new machine field; this is invariant clarification, not a contract expansion.

### 5. Review/remediation pass

After all TDD slices are green:

- Inspect the diff for one source of truth for the expected OID (the initial validated `node.headRefOid`) and ensure both continuation paths compare against it.
- Ensure every page is checked, not just the first continuation. The verification must live inside `collectGraphqlPages`’ per-page callback path.
- Ensure no result is accumulated or returned after a mismatched page.
- Ensure `collectBranchPrChecks` checks completeness before mapping any outcome, so it cannot emit a partially classified batch.
- Ensure successful output schemas and snapshots remain additive/unchanged.
- Re-run the thermo-nuclear acceptance lens: the remedy should add two explicit invariant checks, not a retry mode, new framework, or scattered conditionals.

## Execution strategy for same-shape edits

Use **precise semantic edits in one cohesive TDD sequence**, not a codemod, ad hoc `text.replace()` script, or refactor swarm.

There are two paired same-shape changes—adding `headRefOid` to the check and thread continuation query/schema pairs—but each is only one semantic GraphQL selection plus one schema field and one context-specific verification callback. Apply them one vertical slice at a time so each red test proves its own protocol path. Although the overall plan touches more than five files, this is not a broad file-local refactor: production edits are concentrated in three gateway modules plus one core module, with their tests and one semantic contract document. Automated bulk editing would obscure the TDD evidence and context-specific failure details.

No symbol or terminology rename is planned, so no stale-name grep is required. Finish with a targeted grep showing both continuation queries and both continuation schema/callback paths now mention `headRefOid`.

## Validation guidance

Follow repository policy and use `uv` for any Python need (none is expected). Ordinary test/check breadth remains the implementing agent’s responsibility, but these gates must be represented:

1. **Red/green gateway cycles:** run the focused capability-kit Vitest target/filter after each new moved-head test. Each new test must fail before its corresponding production edit and pass afterward.
2. **Red/green core cycle:** run the focused `core-branch-pr-checks.test.ts` target. The partial-result test must fail before the guard and pass afterward.
3. **Relevant package tests:** run the capability-kit GitHub PR-feedback tests and PR-feedback capability unit/scenario tests selected by the changed-file judgment.
4. **Type and style gates:** run the repository TypeScript format, lint, native TypeScript 7 check, and TypeScript style guard through the documented `just`/pnpm entrypoints.
5. **Default repository validation:** run `just`; expected result is success. If dprint is the only formatting failure, run `just dprint-fix`, then rerun `just` as instructed by `AGENTS.md`.
6. **Integration/isolated lanes:** run them if required by the final changed-file scope and repository policy. This change should not add real-backend setup to default tests or ambient Vitest state.

Do not accept green tests alone. Read the changed assertions and confirm they prove:

- mismatch on check page fails;
- mismatch on thread page fails;
- unchanged OID succeeds;
- every continuation page is verified;
- `hasMore: true` cannot produce any `pr_status` or partial collection.

## Risks, assumptions, and open questions

### Risks

- **Schema strictness:** GitHub’s `headRefOid` may be nullable if the head ref disappears. Treat absence/malformed protocol data as failure; do not fall back to the initial value. Preserve existing schema-invalid versus pagination-invalid distinctions unless the response contains a valid but different OID, which must be pagination-invalid.
- **Only checking one continuation:** a helper placed outside the per-page callback could miss movement on later pages. Keep verification in the callback invoked for every fetched page.
- **Partial core output:** validating while mapping could accidentally classify earlier branches before discovering a partial later branch. Validate all successful gateway outcomes first, then map.
- **Over-refactoring:** `gateway.ts` is already large, but this repair should not create a new pagination subsystem. Prefer a narrowly named failure helper or two clear checks.

### Assumptions

- A continuation query for `pullRequest(number:)` can select `headRefOid` alongside either connection.
- The initial `node.headRefOid` remains the expected identity because the gateway already verifies the fetched head commit OID against it.
- Existing codes `github_pr_feedback_pagination_invalid` and `github_pr_feedback_response_invalid` are sufficient; no user-visible error taxonomy change is needed.
- Callers can rerun the read-only command after head movement.

### Open questions

No material requirements remain unresolved. Exact private helper naming and the narrow Vitest commands are implementation details to choose from current package scripts.

## Plan-specific STOP conditions

Stop and report rather than improvising if any of these occur:

1. GitHub GraphQL does not permit `headRefOid` on the continuation `PullRequest` selection, or observed fixtures/types show it cannot identify the current head. Reassess the identity strategy before coding a fallback.
2. The continuation pagination helper does not invoke `connectionFromResponse` for every page, making the proposed per-page invariant false. Re-map the actual control flow before implementation.
3. Rejecting `hasMore: true` at `collectBranchPrChecks` would break a documented supported gateway implementation that intentionally returns partial successful branch observations. That conflicts with the durable contract and requires an explicit contract decision.
4. Implementing the guard requires changing the successful CLI output shape or `pr_status` semantics. Stop; the repair is intended to be failure-only and backward-compatible on success.

## Trust-nothing closeout

Before declaring completion:

- Re-run all declared gates and record any skipped lane with a concrete reason.
- Compare changed files against the in-scope list; explain any additional file.
- Inspect the final GraphQL query strings and Zod schemas, not just their tests.
- Trace one same-head and one moved-head page through `collectGraphqlPages` to the returned result.
- Trace a forged `hasMore: true` outcome through `collectBranchPrChecks` and verify no entry or status is constructed.
- Read the changed tests for behavior-level assertions rather than trusting green output or call-count-only assertions.
- Review documentation wording against the actual failure code and retry behavior.
- Confirm the worktree is clean except for intended changes and summarize any deviations from this plan.