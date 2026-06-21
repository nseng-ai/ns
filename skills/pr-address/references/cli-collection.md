# pr-address command collection

`pr-address` provides LM-ready feedback download plus shared PR feedback primitives. The old addressing workflow engine is retired; the current primitive commands are not retired.

## Download / stack plumbing

### `download-feedback`

Download one PR's current feedback as Markdown for agent triage.

```bash
pr-address exec download-feedback --pr-number <pr-number> --format json
```

If the current branch has an open PR, callers may omit `--pr-number`:

```bash
pr-address exec download-feedback --format json
```

The result includes `markdown` for editor/session prefill plus target/count metadata. The Markdown is initial triage context only: it does not start an addressing run, authorize edits, or mutate GitHub.

### `map-branch-prs`

`/pr:download-stack-feedback` uses structured stack discovery plus per-PR downloads. `map-branch-prs` maps structured branch lists to PRs before download:

```bash
slot gt exec stack-branches --format json \
  | pr-address exec map-branch-prs --format json
```

The stack command should then call `download-feedback` once per discovered PR. Do not route stack feedback through the retired stack-address or payload-session workflows.

## Read primitives

Use these when an agent needs structured current PR state instead of parsing downloaded Markdown:

```bash
pr-address exec pr-details --pr-number <pr-number> --format json
pr-address exec branch-pr --branch <branch> --format json
pr-address exec open-prs --format json
pr-address exec pr-reviews --pr-number <pr-number> --format json
pr-address exec pr-review-threads --pr-number <pr-number> --format json
pr-address exec pr-review-threads --pr-number <pr-number> --include-resolved --format json
pr-address exec pr-discussion-comments --pr-number <pr-number> --format json
```

## Mutation primitives

Replies and resolutions are GitHub mutations. Use them only after the human has asked the agent to address feedback, current repo state has been inspected, the fix is implemented or verified, and appropriate validation has passed.

```bash
pr-address exec reply-review-thread --thread-id <THREAD_ID> --body "Fixed in <commit/branch>." --format json
pr-address exec resolve-review-thread --thread-id <THREAD_ID> --format json
```

For multiple thread IDs, loop over the primitive instead of using raw GraphQL:

```bash
for thread_id in <THREAD_ID_1> <THREAD_ID_2> <THREAD_ID_3>; do
  pr-address exec resolve-review-thread --thread-id "$thread_id" --format json
done
```

Do not use raw `gh api graphql` for review-thread resolve/reply mutations when these primitives cover the operation.

## Retired helpers

The following historical helpers are obsolete and deleted from the current CLI: `prepare-run`, `get-feedback` payload modes, `classification-template`, `validate-feedback-classification`, `plan-feedback`, `read-feedback-detail`, `read-feedback-details`, resolver-payload builders, old batch mutation helpers, checkpoints, and finalization.
