# pr-address exec CLI reference notes

`pr-address exec` is now a retained single-PR helper surface plus read-only download helpers used by Pi PR triage commands.

## JSON envelope

All `pr-address exec <command> --format json` helpers emit a machine envelope:

- success: `{ "exit_code": 0, "data": ... }`
- negative/validation: `{ "exit_code": 1, "message": ..., "data": ... }`
- invalid request/failure: `{ "exit_code": 2, "error_type": ..., "message": ... }`

Use `--json-schema` to print the helper's input/output schema. Unknown commands and malformed raw CLI arguments are usage errors on stderr.

## Active operation families

- Collection/setup: `prepare-run`, `get-feedback`, `download-feedback`, `map-branch-prs`, `classification-template`, `read-feedback-detail`, `read-feedback-details`.
- Planning: `validate-feedback-classification`, `plan-feedback`.
- Mutation support: `build-resolve-thread-batch-payload`, `resolve-thread-batch`, `resolve-thread-with-reply`, `reply-to-review`, `reply-to-discussion`, `record-batch-checkpoint`, `finalize-run`.

Agent-authored JSON files such as classifications and resolver decisions should live outside the worktree. Worktree-local `--classification-file` paths are rejected to prevent accidental commits of scratch decisions.
