# Single-PR lifecycle session artifacts

## Summary

The single-PR lifecycle helpers now use the payload session as the source of pipeline-produced facts.

Implemented behavior:

- `build-resolve-thread-batch-payload --pr-number --batch-id --commit-sha --decisions-file` resolves the latest PR plan from the session and writes a PR/batch resolve-build artifact for every valid build result, including valid no-payload results.
- `resolve-thread-batch --from-build <payload-path>` remains explicit-reference only, rejects non-ready build artifacts before mutation, records `resolved_inputs.build`, and writes a managed PR/batch resolution-result artifact after successful or partial mutation attempts.
- `record-batch-checkpoint --pr-number --batch-id --commit-sha --evidence-file` reads only agent-authored checkpoint evidence from the file, derives changed files from git, resolves plan/build/resolution artifacts from the session, and writes a PR/batch checkpoint artifact.
- `finalize-run --pr-number` resolves the latest plan, latest final feedback raw artifact, and latest checkpoint per planned batch from the session. Missing planned-batch checkpoints are explicit `missing_checkpoint_evidence` errors.
- Lifecycle `--payload-json` / `--payload-file` composed pipeline inputs were removed for `record-batch-checkpoint` and `finalize-run`; removed flags fail as raw usage errors.

Evidence considered: local branch diff against Graphite parent `validate-feedback-classification-session-only`, PR #1563, and the submitted commit `37e5d0a9b`.

Verification: full TypeScript check passed; full TypeScript test passed; dprint check passed; git whitespace check passed before PR submission.

## Objective Impact

This completes the Objective roadmap row for shrinking single-PR lifecycle helpers to agent-owned inputs, and advances the mutation explicit-reference, composed-input removal, and CLI-reference rewrite rows.

The Objective is still open. Remaining work includes stack build/lifecycle parity, compact-by-default stdout across all exec helpers, complete removal of remaining composed-payload compatibility paths, and the full `pr-address` skill rewrite beyond the updated lifecycle/mutation references.

## Follow-Ups

- Finish the stack mutation/build/lifecycle migration using the same descriptor and explicit-reference contract.
- Continue removing remaining composed pipeline-produced input compatibility paths deliberately, without reintroducing lifecycle compatibility.
- Keep compact stdout default migration separate from the lifecycle artifact slice.
