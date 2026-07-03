# Fresh TypeScript reground run

## Summary

A fresh TypeScript `pr-address` evidence pass was run against the current branch PR, #1427 (`update-pr-address-session-store-objective`). The run stayed non-mutating: `prepare-run` was deliberately skipped because the current skill documents that it can reopen contested threads, while this Objective execution was scoped to non-mutating evidence gathering only.

Commands and artifacts captured under `/tmp/pr-address-reground-*.json` and payload session `pr-address-reground-20260613t14331781361230z`:

- `pr-address exec get-feedback 1427 --payload-session-id ... --format json` succeeded and wrote raw feedback artifact descriptor `pr-address-get-feedback-pr-1427` (`role: raw`, sequence 0001). The PR currently has zero reviews, zero review threads, and zero discussion comments.
- `classification-template --manifest-file ...` succeeded against the compact manifest and produced an empty strict classification scaffold.
- `validate-feedback-classification --manifest-file ... --classification-file ...` succeeded via split inputs. This is a correction to the older Objective wording: validation no longer strictly requires a `{manifest, classification}` wrapper, though wrapper compatibility remains.
- `plan-feedback --payload-file ...` still required an agent-composed `{manifest, classification}` wrapper. The run built `/tmp/pr-address-reground-plan-wrapper.json` to proceed.
- `finalize-run --payload-file ...` still required an agent-composed `{feedback, checkpoints}` wrapper. The run built `/tmp/pr-address-reground-finalize-wrapper.json` and finalized successfully with the expected warning that no checkpoint evidence was supplied.
- A one-PR stack-shaped read-only pass (`stack-feedback-prep`, `stack-feedback-plan`, `stack-feedback-diff-current`) also succeeded. It observed existing PR-scoped descriptors: `pr-address-stack-feedback-pr-1427`, `pr-address-stack-manifest-pr-1427`, `pr-address-stack-classification-template-pr-1427`, `pr-address-stack-feedback-prep`, and `pr-address-stack-feedback-plan`.

Because PR #1427 had no feedback, the run could not naturally exercise actionable batch helpers. Source/help inspection filled that part of the inventory without running mutations:

- `build-resolve-thread-batch-payload` still accepts only `--payload-json` / `--payload-file` / stdin and its input schema still contains `plan`, `batch_id`, `commit_sha`, `continue_on_error`, and `decisions`.
- `record-batch-checkpoint` still accepts only `--payload-json` / `--payload-file` / stdin and its input schema still contains `plan`, `batch_id`, `commit_sha`, `changed_files`, `validation_commands`, `thread_payload_build`, `thread_resolution_result`, and `non_thread_outcomes`.
- `resolve-thread-batch` still accepts `--payload-json` / `--payload-file` / stdin. There is no `--from-build` reference requirement yet; mutation was not run.
- `build-stack-resolve-thread-payloads` can consume `--stack-plan-reference`, but still requires caller-supplied decisions payload; it does not yet consume a reserved latest build artifact or emit `resolved_inputs`.
- `stack-feedback-diff-current` already supports explicit references for `stack_plan` and `current_prep`, but this is field-reference plumbing rather than latest-of-kind session resolution.

## Objective Impact

The live TypeScript surface still validates the Objective thesis: session artifacts are being written, but predecessor resolution remains helper-specific and agent-composed wrappers remain in the single-PR planning, batch-build, checkpoint, finalization, and mutation surfaces. The most important correction is that `validate-feedback-classification` has already moved partway away from wrapper composition through split manifest/classification inputs.

The descriptor-design row can start with fresher evidence. It should treat the current descriptor names as observed prior art, not the final reserved taxonomy: single-PR collection uses `pr-address-get-feedback-pr-<number>`, while stack prep already has PR-scoped raw/manifest/template descriptors and stack-level prep/plan descriptors. The missing contract is latest-of-kind resolution plus an auditable `resolved_inputs` block, especially around planning, build, checkpoint, finalization, and mutation boundaries.

## Follow-Ups

- In the descriptor/resolution contract, account for the existing split-input validation helper rather than assuming validation still needs a wrapper.
- Decide whether the first implementation slice should preserve or remove `validate-feedback-classification` wrapper compatibility after making validated classifications session artifacts.
- If an actionable-feedback PR is available before implementation, optionally repeat only the batch portion to observe real decisions/checkpoint payloads; otherwise the source-backed inventory above is sufficient to begin the artifact-kind and resolution-contract row.
