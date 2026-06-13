# Roadmap

## Work

- [ ] Reproduce and preserve the oversized-PR failure as deterministic evidence.
  - Capture a unit/scenario fixture that simulates PR #1419's failure shape: more than 300 changed files, hundreds of changed paths, and a prompt estimate over the model limit. Include assertions for the observed failure classes: GitHub diff API `too_large`, roaster `prompt_too_long`, and failure metadata loss to `unknown`.

- [ ] Decide and document the oversized-review policy.
  - Choose whether roaster should hard-fail, soft-pass/skip, or shard when the prompt/file budget is exceeded. The policy must explain the user-facing check conclusion, PR comment wording, and how authors should proceed for valid mechanical migrations.

- [ ] Add roaster preflight budgeting before Claude Code invocation.
  - Estimate diff/prompt size before invoking the harness, compare it with a configurable/model-aware budget, and return a typed oversized-review result instead of relying on provider-side API 400 failures. Keep ordinary small-PR behavior unchanged.

- [ ] Make GitHub diff/file discovery large-PR aware.
  - Where tooling needs PR paths or diffs, avoid assuming `gh pr diff` works above 300 files. Prefer local checkout diffs in Actions and/or paginated Pull Request Files API inventory where only filenames are needed.

- [ ] Preserve review identity and base identity through failures and skips.
  - Ensure non-zero roaster envelopes, preflight skips, and harness failures carry `review_name` and `base_ref` into `post-inline-findings`, `format-findings-comment`, and `post-findings-comment`. Different matrix reviews should not collapse into `<!-- roaster:unknown -->`.

- [ ] Harden summary comment publication for matrix-job failures.
  - Keep one stable summary comment per review key, preserve activity logs, avoid comment clobbering/races, and make inline-posting status meaningful when no inline findings can be produced because review was skipped or failed before findings generation.

- [ ] Re-check workflow status semantics on an oversized case.
  - Confirm ordinary deterministic workflows remain useful, roaster's selected degradation status is reflected accurately in GitHub checks, and duplicate/canceled runs do not obscure the latest actionable status in the PR rollup.

## Parked

- [ ] Explore semantic sharding for large reviews if the first fix chooses skip/hard-fail rather than bounded review chunks.
- [ ] Consider a separate repo policy for maximum PR size once tooling emits clear data about file count, diff size, and skipped review coverage.
