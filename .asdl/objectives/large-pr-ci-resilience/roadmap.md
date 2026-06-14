# Roadmap

## Work

- [x] Reproduce and preserve the oversized-PR failure as deterministic evidence.
  - Capture a unit/scenario fixture that simulates PR #1419's failure shape: more than 300 changed files, hundreds of changed paths, and a prompt estimate over the model limit. Include assertions for the observed failure classes: GitHub diff API `too_large`, roaster `prompt_too_long`, and failure metadata loss to `unknown`.
  - Evidence: marked complete from explicit maintainer report; local checkout had no uncommitted or branch-diff evidence to inspect for this update.

- [~] Decide and document the oversized-review policy.
  - A hard-fail budget preflight was explored first, but code-quality review found it overfit and semantically awkward for Clinkr failure handling. That implementation has been removed from this branch.
  - Current branch state preserves only generic publication-side handling for structured nonzero roaster envelopes when such metadata is already present. The broader oversized-review product policy remains unresolved/deferred.

- [ ] Add roaster preflight budgeting before Claude Code invocation.
  - Deferred. The temporary `roaster.review_budget` implementation, `ReviewBudgetFacts`, and `LocalReviewFailureResult` path were removed after review. Harness prompt assembly still owns defensive prompt caps directly, but roaster does not currently hard-fail before harness invocation.

- [x] Make GitHub diff/file discovery large-PR aware.
  - Audit found no remaining roaster path that depends on GitHub's 300-file PR diff endpoint. Discovery and review execution use local checkout `git diff`; workflow base-ref lookup uses `gh pr view` metadata only; inline posting uses the paginated Pull Request Files API only when findings exist.

- [~] Preserve review identity and base identity through failures and skips.
  - Publication parsing now preserves `review_name`, `base_ref`, `error_type`, and `message` for generic nonzero Clinkr envelopes that already contain structured `data`. Roaster review execution no longer produces custom negative result payloads for harness/runtime failures.

- [~] Harden summary comment publication for matrix-job failures.
  - Structured nonzero envelopes can render review-key-specific summary markers, and inline posting no-ops without GitHub file/comment reads when there are no findings or the payload is an error. Broader live PR race behavior remains to be verified.

## Parked

- [ ] Re-check workflow status semantics on an oversized case after a future oversized-review policy lands.
  - Deferred to manual verification once there is an active oversized-review behavior to validate. Confirm ordinary deterministic workflows remain useful, roaster's selected degradation status is reflected accurately in GitHub checks, and duplicate/canceled runs do not obscure the latest actionable status in the PR rollup.
- [ ] Explore semantic sharding for large reviews if the first durable fix chooses skip/hard-fail rather than bounded review chunks.
- [ ] Consider a separate repo policy for maximum PR size once tooling emits clear data about file count, diff size, and skipped review coverage.
