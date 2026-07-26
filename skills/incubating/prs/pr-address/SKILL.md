---
name: pr-address
description: "Use when downloading GitHub PR feedback or using ns address exec PR feedback primitives for agent triage, PR lookup, review-thread inspection, or confirmed review-thread reply/resolution."
---

# pr-address

Address is the repo-owned PR feedback surface: feedback report download plus shared `ns address exec` primitives for PR lookup, review inspection, and confirmed review-thread mutations.

## Initial feedback download

Prefer the Pi commands when available:

- `/pr:download-feedback [pr-number]` — download one PR's feedback into the current session.
- `/pr:download-stack-feedback` — download feedback for the current Graphite stack.

Manual CLI fallback:

```bash
ns address exec download-feedback --pr-number <pr-number> --format json
```

The JSON result includes a `markdown` field intended for editor/session viewing. It is a read-only report: submitting it to the agent triggers proactive analysis and disposition planning, but does not authorize implementation or GitHub mutation. After proposing the plan below, wait for the human to confirm it, revise it, or request something else. An approved addressing plan includes the normal authorization to edit and to resolve or reply to review threads directly addressed by the implemented and validated change, unless the human says otherwise.

## Disposition structures

Every feedback item belongs to exactly one disposition:

- **Primary batch** — the default bounded home for mechanical, behavior-preserving fixes. For one PR this is a direct batch on the current PR branch; for a stack this is an omnibus follow-up PR. *Avoid:* do not call the single-PR batch an omnibus, and do not put design-bearing refactors in either primary batch.
- **Split-out** — a single-thesis PR carrying one design-bearing fix. *Avoid:* do not batch unrelated design-bearing fixes into one split-out; one thesis per PR.
- **Decline** — a stale, already-fixed, or rejected item. Itemize each decline, give the reason, and flag judgment calls so the human can override them.
- **Defer** — an item intentionally kept outside the approved immediate batch. Itemize each deferral and explain why.

**Downstack surgery** is an execution-placement option, not a disposition. Amending an offending PR in place is explicit opt-in only because it restacks upstack work; never choose it silently.

## Addressing workflows

Both workflows below are one bounded pass over one downloaded snapshot, and both stop at the same boundary: PR feedback addressing owns that snapshot through fix, validation, submit, and thread resolution, then stops. `code-fix-gh-stack` explicitly owns waiting, re-querying checks, and iterative repair until the stack is green. After the pass, do not wait for or poll CI, Graphite mergeability, automated review jobs, or newly generated feedback; re-download feedback only when the user explicitly requests another pass or invokes a stack-repair/checks workflow.

### Downloaded feedback: disposition plan (always HITL)

When presented with downloaded single-PR or stack feedback, proactively summarize the feedback and likely implementation impact, then propose a disposition plan even if the human only submitted the report. The download authorizes this read-only planning, not edits, commits, submission, replies, or thread resolution. Explicitly offer the human the choices to confirm, revise the plan, or do something else, and wait for approval before changing anything.

Plan format:

- Account for every item under primary batch, split-out, decline, or defer.
- Show counts and a concise category line for each non-empty group.
- Suggest coherent change batches rather than merely restating comments.
- Identify likely code, test, and documentation impacts where the report and repository inspection support them.
- Itemize every decline and deferral individually; never fold them into counts.
- Distinguish verifiably stale or already-fixed declines from judgment calls, and flag judgment calls so the human can override them.
- Propose placement and build-now-vs-defer rationale for each split-out when relevant; there is no universal rule.

Single-PR variant:

- The primary batch lands directly on the current PR branch as a separate follow-up commit after approval.
- Design-bearing work is proposed as one single-thesis split-out per change.
- Do not introduce omnibus or stack-placement terminology.

Stack variant:

- The primary batch is one omnibus follow-up PR for mechanical fixes.
- At the stack tip, stack the omnibus there. Otherwise never choose silently: offer stacking at the tip versus a mid-stack insert (`gt create -i`).
- Extend the omnibus already known to this session by default; recognition is session-context only — no naming conventions or branch metadata. Create a fresh omnibus when none is known.
- After approval, the bounded pass covers the omnibus plus approved build-now split-outs, then submit, resolve the addressed threads, and stop.

### Single PR: approved addressing pass

After the human approves the disposition plan for a single PR, run one bounded pass:

1. Apply unambiguous, behavior-preserving fixes directly to the branch.
2. Run appropriate local validation.
3. Create a separate follow-up commit for the feedback changes; do not amend or rewrite existing commits unless the human explicitly requests it or a documented workflow specifically requires commit replacement.
4. Resubmit the branch through the repo's normal workflow.
5. Resolve the addressed threads. Verifiable declines (already fixed, stale) are also automatic: reply and resolve directly.
6. Batch judgment-call declines and deferrals and bring them back to the human at the end of the pass.
7. Stop and report the changes, validation, submission, and thread resolution.

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

Mutation primitives — prefer these over raw `gh api graphql`/GraphQL/REST; full envelopes and flags in `references/cli-reference.md`:

- `reply-review-thread --thread-id <id> --body <body>` — one-off reply.
- `resolve-review-thread --thread-id <id>` — one-off resolution.
- `close-review-threads --thread-ids-json '{"threadIds":["<id>"]}' [--body <body>]` — bulk closure; omit `--body` for resolve-only; the JSON payload can also be provided on stdin.

After current repo state has been inspected, a fix is implemented or verified, and appropriate validation has passed, default to closing the addressed or confidently stale review threads with `close-review-threads`.

## Retired workflow

The old payload-session/classification/batch orchestration engine is retired and its commands removed; the primitives above are the current surface.

## References

- `references/cli-collection.md` — load when you need the full `ns address exec` command catalog or a command's stack-plumbing/safety notes.
- `references/cli-reference.md` — load when you need the JSON envelope shape, exact flags, or worked command examples.
