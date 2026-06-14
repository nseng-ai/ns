# Oversized PR CI/CD Resilience

## Thesis

Oversized pull requests should not make CI/CD unusable or non-actionable. PR #1419 exposed that the current review/CI surface can cross multiple platform and model limits at once: GitHub cannot serve the PR diff through the normal diff endpoint once the file count exceeds 300, roaster sends an unbounded whole-diff prompt to Claude Code, and all roaster review matrix jobs fail with `prompt_too_long` instead of producing a deterministic, review-key-specific, actionable status.

The fix should make large-PR behavior explicit and graceful: detect oversized diffs before invoking expensive/fragile review paths, degrade or shard according to a documented policy, preserve useful CI signal from ordinary checks, and publish clear comments/check outcomes that tell the author what happened and how to proceed.

Observed evidence from PR #1419 (`retire-pr-address-python-package-and-bridge`, head `48d4e885`, base `master`):

- GitHub PR: https://github.com/dagster-io/asdl-tools/pull/1419
- Current status rollup: ordinary `ci` workflow passed, `dprint` passed, Vercel reported success/ignored deployment, but the `roaster` workflow failed and left the PR `UNSTABLE`.
- PR size from GitHub files API: 318 changed files. Local diff stat against `origin/master...HEAD`: 318 files changed, 207 insertions, 20,252 deletions; status mix: 219 renames, 71 deletes, 27 modifications, 1 add.
- `gh pr diff 1419 --name-only` and `gh pr diff 1419 --patch` both fail with HTTP 406: `Sorry, the diff exceeded the maximum number of files (300). Consider using 'List pull requests files' API or locally cloning the repository instead.` / `PullRequest.diff too_large`.
- Latest roaster run `27467860661` succeeded in `discover`, then all three review jobs failed:
  - `review (dignified-python)` job `81193310062`: `changed_paths=318`, `harness_execution_failed`, Claude Code API 400 `Prompt is too long · the request is ~207124 tokens (limit 200000)`, `terminal_reason=prompt_too_long`.
  - `review (duplicative-abstractions)` job `81193310066`: `changed_paths=318`, prompt about `~207048` tokens, same 200k limit.
  - `review (typescript-style)` job `81193310069`: `changed_paths=318`, prompt about `~206842` tokens, same 200k limit.
- Earlier roaster runs for the same PR showed the same failure pattern:
  - Run `27467760596` at head `91eadee1`: 319 changed paths; all three reviews failed with prompt sizes about `206787`–`207133` tokens.
  - Run `27467822998` at head `3314265c`: 318 changed paths; all three reviews failed with prompt sizes about `206844`–`207122` tokens.
- The roaster workflow shell captures `uv run roaster review run "$REVIEW_KEY" --base-ref "$BASE_REF" --format json`, prints the failed envelope, still runs inline/summary publication helpers, then exits with the roaster status. This preserves a red check but publishes failure details.
- Failure publication currently loses review identity and base identity: `parse_findings_payload_result` maps any non-zero clinkr envelope to `review_name="unknown"` and `base_ref="unknown"`. The PR comments therefore use `<!-- roaster:unknown -->` and `## roaster · unknown`, causing different review jobs to create/update the same summary marker instead of one stable comment per review key.
- Several duplicate/canceled workflow runs appeared for the same head commit because workflow concurrency cancels in-progress duplicates (`ci`, `dprint`, and `roaster` each had canceled runs adjacent to completed runs). This may be expected for repeated events, but it contributes to noisy status rollups and should be understood while hardening CI/CD behavior.

## Scope

- Make roaster and GitHub Actions behavior robust when a PR is too large for GitHub's normal diff API and/or the selected LLM context window.
- Add deterministic preflight limits using file count, diff byte/token estimate, and/or changed path count before invoking Claude Code.
- Define and implement a graceful degradation policy for oversized reviews: skip with a clear neutral/successful explanatory result, shard into bounded review units, or require smaller PRs depending on the chosen product decision.
- Preserve review metadata on failures so summary comments/check output include the actual review key and base ref, not `unknown`.
- Ensure publication remains one-comment-per-review-key and does not race or clobber unrelated review summaries when multiple matrix jobs fail.
- Handle GitHub diff-fetch limits explicitly where tooling uses `gh pr diff`; use local checkout diff or the paginated Pull Request Files API when appropriate.
- Clarify CI/CD status expectations for oversized PRs: ordinary deterministic checks should remain meaningful, review-bot failures should be actionable, and duplicate/canceled runs should not obscure the latest relevant result.
- Cover the behavior with regression tests and at least one realistic oversized-PR fixture or synthetic scenario that exceeds the relevant thresholds without depending on live GitHub limits.

## Non-Goals

- Do not require all large PRs to receive the same depth of automated semantic review as small PRs.
- Do not solve the product/process problem of splitting PR #1419 itself; this Objective tracks tooling resilience exposed by that PR.
- Do not add hidden state, external databases, or a new CI orchestration system.
- Do not make roaster mutate code or auto-fix findings as part of this Objective.
- Do not broaden this into a complete branch protection redesign unless the investigation proves branch protection/check-run semantics are the blocker.

## Completion Criteria

- An oversized PR no longer fails roaster with Claude Code `prompt_too_long` caused by an unbounded whole-diff prompt.
- The chosen oversized-review policy is documented in code/tests and is visible in PR output: authors can tell whether review was skipped, sharded, or intentionally failed and why.
- Roaster failure/skip comments preserve `review_name`, `base_ref`, run URL, and inline-posting status; matrix jobs no longer collapse into `roaster:unknown` comments.
- Tooling paths that need PR file inventories or diffs handle GitHub's 300-file diff limit deliberately rather than surfacing raw HTTP 406 as an unexpected failure.
- CI evidence demonstrates the fix with a synthetic or real PR-sized case at or above the observed threshold (318 changed files / ~207k prompt tokens) and ordinary repo checks remain green.
- The final Objective update or closure records the selected policy, the thresholds used, and any accepted residual limitations for very large PRs.

## Assumptions and Risks

Assumptions:

- The immediate red-check cause is roaster's unbounded prompt assembly around the full unified diff plus changed path list; ordinary deterministic CI (`lint`, `ty`, Python tests, TypeScript checks, docs build, `areg-check`, and dprint) can pass on the same oversized PR.
- Claude Code's effective request limit for the observed roaster invocation is 200,000 tokens, and PR #1419 crossed it by roughly 6,800–7,100 tokens depending on reviewer instructions.
- GitHub's normal PR diff endpoint/file rendering limit is relevant to local and CI tooling because `gh pr diff` fails once the PR exceeds 300 files, while the paginated Pull Request Files API can still enumerate the 318 files.
- A deterministic preflight can estimate enough about prompt size before calling the model to avoid provider-side 400 failures.

Risks:

- The too-permissive degradation risk is de-risked for the first implementation slice: oversized roaster reviews are intentionally red checks, not soft-pass or neutral skips.
- The too-strict policy risk is accepted for now. Valid mechanical migrations that exceed the budget must split/shrink or follow a documented maintainer bypass process if one is later established.
- Sharding reviews by path or diff size remains parked. It may reduce context quality and could create duplicate/noisy findings unless finding identity and summary publication are redesigned carefully.
- Failure publication changes touch GitHub comments and matrix concurrency; current tests cover budget-failure marker/comment shape, structured non-budget post-metadata failure metadata, and no-inline noop paths, but broader live PR race behavior remains to be verified manually after merge.
- Duplicate/canceled workflow runs may be normal GitHub event behavior; chasing them as the primary bug could distract from the prompt-size and publication failures unless post-merge evidence shows they affect mergeability.

## Open Questions

- Resolved for the first implementation slice: oversized roaster reviews are hard failures. The red check should say the review was not run, include review key/base/size facts, and tell authors to split/shrink the PR or use a documented maintainer bypass process if one exists.
- If sharding is revisited later, what is the first sharding unit: file-count chunks, package/path groups, reviewer applicability groups, or token-budgeted diff slices?
- Resolved for the first implementation slice: roaster enforces GitHub's 300 changed-path boundary, a conservative 150,000 estimated full-diff token budget below Claude Code's observed 200,000-token limit, and a 40,000-token per-file budget matching the harness assembly guard.
- Resolved for the first implementation slice: post-metadata failures remain review-key-specific, not aggregate, so budget failures and harness/runtime failures after review resolution use distinct `<!-- roaster:<review_name> -->` summary markers.
