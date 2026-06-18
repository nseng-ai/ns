# Download helpers

`pr-address` is retained only as read-only feedback-download plumbing after deletion of the old addressing workflow.

## `download-feedback`

Download one PR's current feedback as Markdown for agent triage.

```bash
pr-address exec download-feedback --pr-number <pr-number> --format json
```

If the current branch has an open PR, callers may omit `--pr-number`:

```bash
pr-address exec download-feedback --format json
```

The result includes `markdown` for editor/session prefill plus target/count metadata. It does not start an addressing run, create payload artifacts, validate classifications, plan batches, or mutate GitHub.

## Stack download support

`/pr:download-stack-feedback` uses structured stack discovery plus per-PR downloads. `map-branch-prs` remains as minimal branch-to-PR lookup plumbing:

```bash
slot gt exec stack-branches --format json \
  | pr-address exec map-branch-prs --format json
```

The stack command should then call `download-feedback` once per discovered PR. Do not route stack feedback through the retired stack-address or payload-session workflows.

## Retired helpers

The following historical helpers are obsolete and deleted from the current CLI: `prepare-run`, `get-feedback` payload modes, `classification-template`, `validate-feedback-classification`, `plan-feedback`, `read-feedback-detail`, `read-feedback-details`, resolver-payload builders, mutation helpers, checkpoints, and finalization.
