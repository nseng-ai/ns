# Roadmap

## Work

- [x] Reproduce and preserve the oversized-PR failure as deterministic evidence.
  - Capture a unit/scenario fixture that simulates PR #1419's failure shape: more than 300 changed files, hundreds of changed paths, and a prompt estimate over the model limit. Include assertions for the observed failure classes: GitHub diff API `too_large`, roaster `prompt_too_long`, and failure metadata loss to `unknown`.
  - Evidence: marked complete from explicit maintainer report; local checkout had no uncommitted or branch-diff evidence to inspect for this update.

- [x] Decide and document the oversized-review policy.
  - Chosen policy: hard-fail oversized roaster reviews before Claude Code. The red check explains that the review was not run, reports the review key, base ref, changed-path count, full-diff token estimate, thresholds, and tells authors to split/shrink the PR or follow a documented maintainer bypass process if one exists.

- [x] Add roaster preflight budgeting before Claude Code invocation.
  - `roaster.review_budget` now assesses local checkout diffs before harness invocation with `max_changed_paths=300` and `max_diff_tokens=150_000`. Oversized diffs return a typed `LocalReviewFailureResult` and tests assert the fake harness receives no execution request.

- [~] Make GitHub diff/file discovery large-PR aware.
  - The roaster review hard-fail path uses the existing local checkout diff gateway in Actions rather than `gh pr diff`, so this implementation avoids GitHub's 300-file diff endpoint for review budgeting. Broader GitHub inventory hardening remains open if another path still depends on PR diff endpoints.

- [~] Preserve review identity and base identity through failures and skips.
  - Budget preflight failures now use structured negative Clinkr envelopes that carry `review_name`, `review_path`, `model`, `base_ref`, and budget facts into publication. Existing unstructured infrastructure failures still fall back to generic failure handling.

- [~] Harden summary comment publication for matrix-job failures.
  - Budget-failure comments now use review-key-specific markers and hard-fail wording, and inline posting no-ops without GitHub file/comment reads when there are no findings or the payload is an error. Broader live PR race behavior remains to be verified.

## Parked

- [ ] Re-check workflow status semantics on an oversized case after merge.
  - Deferred to manual post-merge verification; this is not a pre-merge implementation blocker for the hard-fail budget slice. Confirm ordinary deterministic workflows remain useful, roaster's selected degradation status is reflected accurately in GitHub checks, and duplicate/canceled runs do not obscure the latest actionable status in the PR rollup.
- [ ] Explore semantic sharding for large reviews if the first fix chooses skip/hard-fail rather than bounded review chunks.
- [ ] Consider a separate repo policy for maximum PR size once tooling emits clear data about file count, diff size, and skipped review coverage.
