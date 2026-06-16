---
name: pr-address
description: "Download GitHub PR feedback for agent triage. The old pr-address addressing workflow is retired; use only the read-only download helpers."
---

# pr-address

`pr-address` is now a transitional, read-only feedback-download surface.

Use it to fetch GitHub PR review feedback as Markdown for an agent to inspect. Do **not** use it as an addressing workflow engine: the old payload-session, classification, planning, resolver-payload, checkpoint, finalization, and mutation workflow is retired and scheduled for deletion.

## Supported workflow

Prefer the Pi commands when available:

- `/pr:download-feedback [pr-number]` — download one PR's feedback into the current session.
- `/pr:download-stack-feedback` — download feedback for the current Graphite stack.

Manual CLI fallback:

```bash
pr-address exec download-feedback --pr-number <pr-number> --format json
```

The JSON result includes a `markdown` field intended for editor/session prefill. It is triage-only: ask the human before making code changes, and do not resolve or reply to GitHub threads from the download result alone.

## Transitional retained helpers

During the deletion transition, `map-branch-prs` may remain as implementation plumbing for stack downloads:

```bash
slot gt exec stack-branches --format json \
  | pr-address exec map-branch-prs --format json
```

Treat every other historical `pr-address exec` operation as obsolete unless a current implementation session is explicitly deleting or migrating it.

## Retired workflow

Do not run or teach agents to run these old workflow families:

- payload/session setup: `prepare-run`, payload paths, harness-session payload chaining;
- classification/planning: `classification-template`, `validate-feedback-classification`, `plan-feedback`;
- detail lookup: `read-feedback-detail`, `read-feedback-details`;
- mutation orchestration: `build-resolve-thread-batch-payload`, `resolve-thread-batch`, `resolve-thread-with-reply`, `reply-to-review`, `reply-to-discussion`;
- checkpoint/finalization: `record-batch-checkpoint`, `finalize-run`.

Future addressing work should rebuild from the download-feedback foundation rather than preserving the old workflow machinery.

## References

- `references/cli-collection.md` — download-only helper notes.
- `references/cli-reference.md` — JSON envelope and transitional CLI notes.
