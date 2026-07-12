# Address command collection

Address provides feedback report download plus shared PR feedback primitives through `ns address exec ...`. This file is a command catalog; workflow policy (engine retirement, authorization semantics) lives in `SKILL.md`.

## Download / stack plumbing

### `download-feedback`

Download one PR's current feedback as a Markdown report.

```bash
ns address exec download-feedback --pr-number <pr-number> --format json
```

If the current branch has an open PR, callers may omit `--pr-number`:

```bash
ns address exec download-feedback --format json
```

The result includes `markdown` for editor/session viewing plus target/count metadata. Authorization semantics — report vs. triage prompt, and what a human "address feedback" request licenses — live in `SKILL.md`, not here.

### `map-branch-prs`

`/pr:download-stack-feedback` uses structured stack discovery plus per-PR downloads. `map-branch-prs` maps structured branch lists to PRs before download:

```bash
ns slot gt exec stack-branches --format json \
  | ns address exec map-branch-prs --format json
```

The stack command should then call `download-feedback` once per discovered PR. Do not route stack feedback through the retired stack-address or payload-session workflows.

### `branch-pr-checks`

`/pr:preview-checks` uses batched checks discovery: one GitHub GraphQL request resolves every branch's open PR and its normalized checks. Input matches `map-branch-prs` (`--branches-json` or stdin):

```bash
ns slot gt exec stack-branches --format json \
  | ns address exec branch-pr-checks --format json
```

The result is an `entries` array in request order; each entry is `status: "found"` (with `target`, `counts`, `checks`), `"missing"` (no open PR), or `"ambiguous"` (multiple open PRs; up to two `candidates` are reported). Exit semantics: 0 when every branch maps to one open PR; 1 with full `data` when any branch is missing/ambiguous; 2 on invalid input or gateway failure.

## Read primitives

Use these when an agent needs structured current PR state instead of parsing downloaded Markdown:

```bash
ns address exec pr-details --pr-number <pr-number> --format json
ns address exec branch-pr --branch <branch> --format json
ns address exec open-prs --format json
ns address exec pr-reviews --pr-number <pr-number> --format json
ns address exec pr-review-threads --pr-number <pr-number> --format json
ns address exec pr-review-threads --pr-number <pr-number> --include-resolved --format json
ns address exec pr-discussion-comments --pr-number <pr-number> --format json
```

## Mutation primitives

Replies and resolutions are GitHub mutations. Use them after the human has asked the agent to address feedback, current repo state has been inspected, the fix is implemented or verified, and appropriate validation has passed. Do not ask for a second confirmation before closing addressed threads unless the feedback is ambiguous, broad, or outside the requested scope.

```bash
ns address exec reply-review-thread --thread-id <THREAD_ID> --body "Fixed in <commit/branch>." --format json
ns address exec resolve-review-thread --thread-id <THREAD_ID> --format json
ns address exec close-review-threads --thread-ids-json '{"threadIds":["<THREAD_ID_1>","<THREAD_ID_2>"]}' --body "Fixed and validated." --format json
printf '%s' '{"threadIds":["<THREAD_ID_1>","<THREAD_ID_2>"]}' | ns address exec close-review-threads --format json
```

For multiple addressed thread IDs, default to `close-review-threads` rather than shell loops or raw GraphQL. Omit `--body` for resolve-only bulk closure.

Do not use raw `gh api graphql` for review-thread resolve/reply mutations when these primitives cover the operation.

## Retired helpers

The following historical helpers are obsolete and deleted from the current CLI: `prepare-run`, `get-feedback` payload modes, `classification-template`, `validate-feedback-classification`, `plan-feedback`, `read-feedback-detail`, `read-feedback-details`, resolver-payload builders, old batch mutation helpers, checkpoints, and finalization.
