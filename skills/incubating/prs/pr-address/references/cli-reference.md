# ns address exec CLI reference notes

`ns address exec` is the machine-readable PR feedback primitive surface: feedback download, stack plumbing, structured PR reads, and confirmed review-thread mutations.

## JSON envelope

All retained `ns address exec <command> --format json` helpers emit a machine envelope:

- success: `{ "exit_code": 0, "data": ... }`
- negative/validation: `{ "exit_code": 1, "message": ..., "data": ... }`
- invalid request/failure: `{ "exit_code": 2, "error_type": ..., "message": ... }`

Use `--json-schema` before relying on a helper shape.

## Current operation families

- Feedback download: `download-feedback`.
- Stack download plumbing: `map-branch-prs`, used to map structured branch lists to PRs before per-PR downloads.
- Batched checks plumbing: `branch-pr-checks`, which resolves a branch list to open PRs plus normalized checks in one GitHub GraphQL request.
- Read primitives: `pr-details`, `branch-pr`, `open-prs`, `pr-reviews`, `pr-review-threads`, `pr-discussion-comments`.
- Mutation primitives: `reply-review-thread`, `resolve-review-thread`, `close-review-threads`.

## Examples

```bash
ns address exec download-feedback --pr-number <pr-number> --format json
ns address exec map-branch-prs --format json
ns address exec branch-pr-checks --branches-json '{"branches":["<branch>"]}' --format json
ns address exec pr-details --pr-number <pr-number> --format json
ns address exec branch-pr --branch <branch> --format json
ns address exec open-prs --format json
ns address exec pr-reviews --pr-number <pr-number> --format json
ns address exec pr-review-threads --pr-number <pr-number> --format json
ns address exec pr-review-threads --pr-number <pr-number> --include-resolved --format json
ns address exec pr-discussion-comments --pr-number <pr-number> --format json
ns address exec reply-review-thread --thread-id <THREAD_ID> --body "Fixed in <commit/branch>." --format json
ns address exec resolve-review-thread --thread-id <THREAD_ID> --format json
ns address exec close-review-threads --thread-ids-json '{"threadIds":["<THREAD_ID_1>","<THREAD_ID_2>"]}' --body "Fixed and validated." --format json
printf '%s' '{"threadIds":["<THREAD_ID_1>","<THREAD_ID_2>"]}' | ns address exec close-review-threads --format json
```

For multiple addressed thread IDs, default to `close-review-threads` rather than shell loops or raw GraphQL. Omit `--body` for resolve-only bulk closure.

## Safety policy

Agents should use `/pr:download-feedback` or `/pr:download-stack-feedback` to view downloaded Markdown reports. Download is non-mutating. It triggers the read-only disposition planning defined in `SKILL.md`, but neither planning nor download starts an addressing run or authorizes edits or GitHub mutation.

After the human approves the addressing plan, current repo state has been inspected, fixes are implemented or verified, and appropriate validation has passed, default to using the mutation primitives above for review-thread replies/resolutions rather than raw `gh api graphql`. Do not ask for a second confirmation before closing addressed threads unless the feedback is ambiguous, broad, or outside the approved scope.

## Retired operation families

The old workflow engine is retired and deleted from the current CLI: payload sessions, classification templates, classification validation, planning, payload detail lookup, resolver-payload construction, old batch GitHub mutation helpers, checkpoints, and finalization should not be used for new agent workflows.
