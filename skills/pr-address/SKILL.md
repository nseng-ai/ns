---
name: pr-address
description: "Use when downloading GitHub PR feedback or using ns address exec PR feedback primitives for agent triage, PR lookup, review-thread inspection, or confirmed review-thread reply/resolution."
---

# pr-address

Address is the repo-owned PR feedback surface: LM-ready feedback download plus shared `ns address exec` primitives for PR lookup, review inspection, and confirmed review-thread mutations. The skill slug remains `pr-address` for discoverability.

## Initial feedback download

Prefer the Pi commands when available:

- `/pr:download-feedback [pr-number]` — download one PR's feedback into the current session.
- `/pr:download-stack-feedback` — download feedback for the current Graphite stack.

Manual CLI fallback:

```bash
ns address exec download-feedback --pr-number <pr-number> --format json
```

The JSON result includes a `markdown` field intended for editor/session prefill. The generated prompt authorizes automatic handling of straightforward feedback: inspect the current repo state, fix localized/mechanically-verifiable/low-risk items, validate, and close addressed review threads via `ns address exec close-review-threads`. Single-PR downloads should fix the immediate PR/current checkout; stack downloads should put straightforward stack-wide fixes in a single omnibus follow-up PR/current branch unless the human explicitly asks for downstack surgery. Ask before ambiguous, high-risk, product/design, broad-refactor, human-authored, or dirty-tree work.

## Current primitive surface

Download / stack plumbing:

- `download-feedback`
- `map-branch-prs`
- `branch-pr-checks --branches-json '{"branches":["<branch>"]}'`

Read primitives:

- `pr-details`
- `branch-pr`
- `open-prs`
- `pr-reviews`
- `pr-review-threads [--include-resolved]`
- `pr-discussion-comments`

Mutation primitives:

- `reply-review-thread --thread-id <id> --body <body>`
- `resolve-review-thread --thread-id <id>`
- `close-review-threads --thread-ids-json '{"threadIds":["<id>"]}' [--body <body>]`

After current repo state has been inspected, a fix is implemented or verified, and appropriate validation has passed, use `ns address exec close-review-threads --thread-ids-json '{"threadIds":["<THREAD_ID>","<THREAD_ID>"]}' --body "<BODY>" --format json` for confirmed bulk review-thread closure. Omit `--body` for resolve-only bulk closure. The same JSON payload can be provided on stdin.

For one-off mutations, use `ns address exec resolve-review-thread --thread-id <THREAD_ID> --format json` rather than raw `gh api graphql` to resolve review threads. Use `ns address exec reply-review-thread --thread-id <THREAD_ID> --body <BODY> --format json` rather than raw GraphQL/REST to reply to review threads.

## Retired workflow

The retired workflow is the old payload-session/classification/planning/batch/checkpoint/finalization orchestration engine. Do not run or teach agents to run these old workflow families:

- payload/session setup: `prepare-run`, payload paths, harness-session payload chaining;
- classification/planning: `classification-template`, `validate-feedback-classification`, `plan-feedback`;
- detail lookup: `read-feedback-detail`, `read-feedback-details`;
- batch mutation orchestration: `build-resolve-thread-batch-payload`, `resolve-thread-batch`, `resolve-thread-with-reply`, `reply-to-review`, `reply-to-discussion`;
- checkpoint/finalization: `record-batch-checkpoint`, `finalize-run`.

Do not describe the current primitive commands as retired.

## References

- `references/cli-collection.md` — current command families and safety notes.
- `references/cli-reference.md` — JSON envelope and command examples.
