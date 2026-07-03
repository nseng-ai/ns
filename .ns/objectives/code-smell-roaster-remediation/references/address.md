# ts/packages/address -- code-smell findings

Source: automated code-smell-roaster sweep (see repo root `.sdl/reviews/code-smell-roaster.md`), adversarially verified. 3 confirmed finding(s) (0 high, 1 medium, 2 low).

Re-verify file paths and line numbers at pickup time -- the repo moves between the sweep and implementation.

## ts/packages/address/src

1. **Data Clumps** (medium) -- `ts/packages/address/src/core/pr-checks.ts:13-22`
   - Roast: The six-field PR-target clump (kind/pr_number/branch/title/url/head_ref_name/base_ref_name) is hand-copied into a second interface, a second builder function, and a second zod schema instead of existing once.
   - Evidence: PrChecksTargetPayload (core/pr-checks.ts:13-22) duplicates DownloadFeedbackTargetPayload (core/download-feedback.ts:21-29) field-for-field (plus head_ref_oid), and the same pair is duplicated again as prChecksTargetSchema vs downloadFeedbackTargetSchema in operation-schemas/collection.ts:34-43 and :83-91.
   - Smallest fix: Extract one shared PrTargetPayload type/schema (with head_ref_oid optional) in core/pr-target.ts and have both download-feedback.ts and pr-checks.ts build/validate against it instead of maintaining four parallel copies.

2. **Speculative Generality** (low) -- `ts/packages/address/src/json-input.ts:14-23`
   - Roast: json-input.ts is built as a general-purpose three-source (stdin/option/file) loader with a multi-source conflict check, but the only caller in the package feeds it exactly one option-or-stdin pair and never touches the file path machinery.
   - Evidence: ReadJsonInputTextOptions exposes filePath, fileOptionName, and canReadStdin, and readJsonInputFile/the "accepts only one ... source" branch (json-input.ts:35-43, 79-91, 103-124) exist purely for those, yet map-branch-prs.ts:44-51 is the sole caller and passes none of them.
   - Smallest fix: Strip filePath/fileOptionName/canReadStdin and the file-reading path until a real caller needs file-based JSON input; keep loadJsonInput scoped to option-value-or-stdin.

3. **Repeated Switches** (low) -- `ts/packages/address/src/primitive-commands.ts:249-258`
   - Roast: Every operation that calls resolvePrTarget re-derives the identical ok/git_failure/pr_feedback_failure/detached_head dispatch instead of sharing one mapping.
   - Evidence: primitive-commands.ts:249-258 (runPrChecks) switches on result.type with the same git_failure/pr_feedback_failure/detached_head arms as download-feedback.ts:50-61 (runDownloadFeedbackOperation), differing only in the "ok"/"miss" cases.
   - Smallest fix: Add a shared helper in exec-operation.ts that maps the common {git_failure, pr_feedback_failure, detached_head} result variants to a ClinkrExit, leaving each call site to handle only its bespoke "ok"/"miss" cases.
