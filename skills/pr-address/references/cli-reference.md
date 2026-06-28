# sdl address exec CLI reference notes

`sdl address exec` is the machine-readable PR feedback primitive surface: feedback download, stack plumbing, structured PR reads, and confirmed review-thread mutations.

## JSON envelope

All retained `sdl address exec <command> --format json` helpers emit a machine envelope:

- success: `{ "exit_code": 0, "data": ... }`
- negative/validation: `{ "exit_code": 1, "message": ..., "data": ... }`
- invalid request/failure: `{ "exit_code": 2, "error_type": ..., "message": ... }`

Use `--json-schema` before relying on a helper shape.

## Current operation families

- Feedback download: `download-feedback`.
- Stack download plumbing: `map-branch-prs`, used to map structured branch lists to PRs before per-PR downloads.
- Read primitives: `pr-details`, `branch-pr`, `open-prs`, `pr-reviews`, `pr-review-threads`, `pr-discussion-comments`.
- Mutation primitives: `reply-review-thread`, `resolve-review-thread`.

## Examples

```bash
sdl address exec download-feedback --pr-number <pr-number> --format json
sdl address exec map-branch-prs --format json
sdl address exec pr-details --pr-number <pr-number> --format json
sdl address exec branch-pr --branch <branch> --format json
sdl address exec open-prs --format json
sdl address exec pr-reviews --pr-number <pr-number> --format json
sdl address exec pr-review-threads --pr-number <pr-number> --format json
sdl address exec pr-review-threads --pr-number <pr-number> --include-resolved --format json
sdl address exec pr-discussion-comments --pr-number <pr-number> --format json
sdl address exec reply-review-thread --thread-id <THREAD_ID> --body "Fixed in <commit/branch>." --format json
sdl address exec resolve-review-thread --thread-id <THREAD_ID> --format json
```

For multiple thread IDs, loop over the primitive instead of using raw GraphQL:

```bash
for thread_id in <THREAD_ID_1> <THREAD_ID_2> <THREAD_ID_3>; do
  sdl address exec resolve-review-thread --thread-id "$thread_id" --format json
done
```

## Safety policy

Agents should use `/pr:download-feedback` or `/pr:download-stack-feedback` for initial triage, inspect the downloaded Markdown, ask for confirmation before code changes, and avoid resolving or replying during the initial triage prompt.

After the human asks the agent to address feedback, current repo state has been inspected, fixes are implemented or verified, and appropriate validation has passed, use the mutation primitives above for review-thread replies/resolutions rather than raw `gh api graphql`.

## Retired operation families

The old workflow engine is retired and deleted from the current CLI: payload sessions, classification templates, classification validation, planning, payload detail lookup, resolver-payload construction, old batch GitHub mutation helpers, checkpoints, and finalization should not be used for new agent workflows.
