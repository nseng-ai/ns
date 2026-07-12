---
name: pr-address
description: "Use when downloading GitHub PR feedback or using ns address exec PR feedback primitives for agent triage, PR lookup, review-thread inspection, or confirmed review-thread reply/resolution."
---

# pr-address

Address is the repo-owned PR feedback surface: feedback report download plus shared `ns address exec` primitives for PR lookup, review inspection, and confirmed review-thread mutations. The skill slug remains `pr-address` for discoverability.

## Initial feedback download

Prefer the Pi commands when available:

- `/pr:download-feedback [pr-number]` — download one PR's feedback into the current session.
- `/pr:download-stack-feedback` — download feedback for the current Graphite stack.

Manual CLI fallback:

```bash
ns address exec download-feedback --pr-number <pr-number> --format json
```

The JSON result includes a `markdown` field intended for editor/session viewing. It is a report, not an automatic triage or implementation prompt by itself; inspect it before acting. If the human asks you to address feedback, that instruction includes the normal authorization to edit and to resolve or reply to review threads directly addressed by the implemented and validated change, unless the human says otherwise.

## Disposition structures

Feedback fixes land through one of three structures:

- **Omnibus** — one follow-up PR that absorbs a stack's mechanical fixes. *Avoid:* an omnibus is not a place for design-bearing refactors; those get a split-out.
- **Split-out** — a single-thesis PR carrying one design-bearing fix. *Avoid:* do not batch unrelated design-bearing fixes into one split-out; one thesis per PR.
- **Downstack surgery** — amending the offending PR in place. *Avoid:* surgery is explicit opt-in only — it restacks upstack work; never choose it silently.

## Addressing workflows

Both workflows below are one bounded pass over one downloaded snapshot, and both stop at the same boundary: PR feedback addressing owns that snapshot through fix, validation, submit, and thread resolution, then stops. `code-fix-gh-stack` explicitly owns waiting, re-querying checks, and iterative repair until the stack is green. After the pass, do not wait for or poll CI, Graphite mergeability, automated review jobs, or newly generated feedback; re-download feedback only when the user explicitly requests another pass or invokes a stack-repair/checks workflow.

### Stack feedback: disposition plan (always HITL)

When presented with downloaded stack feedback, proactively produce a disposition plan even if the human only submitted the report. Ask the human to confirm it, explicitly offering the option to revise the plan or do something else, and wait for explicit approval before changing anything.

Plan format:

- Group items by disposition (omnibus, split-out, decline, defer) with counts and category lines per group.
- Itemize every decline and deferral individually; never fold them into counts.
- Flag judgment-call declines explicitly so the human can override them.
- Propose split-out placement and build-now-vs-defer per item, with rationale — there is no universal rule.

Omnibus placement:

- At the stack tip, stack the omnibus there.
- Not at the tip: never silently choose. Surface the situation and offer stacking at the tip vs a mid-stack insert (`gt create -i`).
- Extend the omnibus already known to this session by default; recognition is session-context only — no naming conventions, no branch metadata. Create a fresh omnibus when none is known.

After approval, the bounded pass covers the omnibus plus the approved build-now split-outs, then submit, resolve the addressed threads, and stop.

### Single PR: autonomous pass

When asked to address feedback on a single PR, run one bounded autonomous pass:

1. Apply unambiguous, behavior-preserving fixes directly to the branch.
2. Run appropriate local validation.
3. Resubmit the branch through the repo's normal workflow.
4. Resolve the addressed threads. Verifiable declines (already fixed, stale) are also automatic: reply and resolve directly.
5. Batch judgment-call declines and deferrals and bring them back to the human at the end of the pass.
6. Stop and report the changes, validation, submission, and thread resolution.

The pass behaves the same regardless of stack position. A restack conflict is an ordinary abort: stop and report rather than resolving it in-pass.

### Thread resolution

Both workflows resolve threads the same way:

- A fix that lands in a different PR resolves the thread with a "Fixed in #X" reply.
- A deferral gets a reply but stays **unresolved** — the open thread is the durable cross-session record.
- A decline gets a reply and is resolved.

Use the `close-review-threads` bulk closure and one-off reply/resolve primitives described below.

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

After current repo state has been inspected, a fix is implemented or verified, and appropriate validation has passed, default to closing the addressed or confidently stale review threads with `ns address exec close-review-threads --thread-ids-json '{"threadIds":["<THREAD_ID>","<THREAD_ID>"]}' --body "<BODY>" --format json`. Omit `--body` for resolve-only bulk closure. The same JSON payload can be provided on stdin.

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
