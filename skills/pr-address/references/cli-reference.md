# pr-address exec CLI reference notes

`pr-address exec` is now a transitional read-only feedback-download helper surface.

## JSON envelope

All retained `pr-address exec <command> --format json` helpers emit a machine envelope:

- success: `{ "exit_code": 0, "data": ... }`
- negative/validation: `{ "exit_code": 1, "message": ..., "data": ... }`
- invalid request/failure: `{ "exit_code": 2, "error_type": ..., "message": ... }`

Use `--json-schema` before relying on a retained helper shape.

## Retained operation families

- Feedback download: `download-feedback`.
- Stack download plumbing: `map-branch-prs`, only as needed to map structured branch lists to PRs before per-PR downloads.

## Retired operation families

The old workflow engine is retired: payload sessions, classification templates, classification validation, planning, payload detail lookup, resolver-payload construction, GitHub mutation helpers, checkpoints, and finalization should not be used for new agent workflows and are scheduled for deletion.

Agents should use `/pr:download-feedback` or `/pr:download-stack-feedback`, inspect the downloaded Markdown, ask for confirmation before code changes, and treat any future addressing workflow as a rebuild on top of the downloader foundation.
