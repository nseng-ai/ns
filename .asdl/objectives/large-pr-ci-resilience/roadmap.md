# Roadmap

## Work

- [x] Reproduce and preserve the oversized-PR failure as deterministic evidence.
  - Capture a unit/scenario fixture that simulates PR #1419's failure shape: more than 300 changed files, hundreds of changed paths, and a prompt estimate over the model limit. Include assertions for the observed failure classes: GitHub diff API `too_large`, roaster `prompt_too_long`, and failure metadata loss to `unknown`.
  - Evidence: marked complete from explicit maintainer report; local checkout had no uncommitted or branch-diff evidence to inspect for this update.

- [x] Decide and document the oversized-review policy.
  - Selected policy: filtered bounded semantic review with disclosed coverage. Roaster applies configured `[roaster.diff].exclude` patterns before prompt budgeting, then bounds prompt input with a total diff cap (`120_000` estimated tokens) and per-file diff cap (`40_000` estimated tokens).
  - Bounded review remains a normal successful review if Claude Code returns valid findings/no-findings. JSON output and PR summary comments disclose whether the filtered diff was fully supplied or which whole file diff segments were omitted from prompt input and why. Semantic sharding and automatic generated-file detection remain parked.

- [x] Bound roaster diff prompt input before Claude Code invocation.
  - Harness prompt assembly now applies the per-file cap before the total cap, omits whole file diff segments when needed, preserves prompt-internal omission notes, and returns structured coverage facts from the same decision path. This replaces the removed hard-fail preflight shape without laundering harness/runtime failures through successful negative results.

- [x] Make GitHub diff/file discovery large-PR aware.
  - Audit found no remaining roaster path that depends on GitHub's 300-file PR diff endpoint. Discovery and review execution use local checkout `git diff`; workflow base-ref lookup uses `gh pr view` metadata only; inline posting uses the paginated Pull Request Files API only when findings exist.

- [~] Preserve review identity and base identity through failures and skips.
  - Publication parsing now preserves `review_name`, `base_ref`, `error_type`, and `message` for generic nonzero Clinkr envelopes that already contain structured `data`. Roaster review execution no longer produces custom negative result payloads for harness/runtime failures.

- [~] Harden summary comment publication for matrix-job failures.
  - Structured nonzero envelopes can render review-key-specific summary markers, and inline posting no-ops without GitHub file/comment reads when there are no findings or the payload is an error. Successful bounded reviews now render a compact input-coverage section before findings/no-findings, including a capped omitted-file list and bounded-input no-findings wording. Broader live PR race behavior remains to be verified.

## Parked

- [ ] Re-check workflow status semantics on an oversized case after bounded-review coverage lands.
  - Confirm ordinary deterministic workflows remain useful, roaster's bounded-review status and coverage disclosure are reflected accurately in GitHub checks/comments, and duplicate/canceled runs do not obscure the latest actionable status in the PR rollup.
- [ ] Explore semantic sharding for large reviews if bounded single-call review coverage proves insufficient.
- [ ] Consider a separate repo policy for maximum PR size once tooling emits clear data about file count, diff size, and skipped review coverage.
