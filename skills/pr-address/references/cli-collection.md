# Collection helpers

## `prepare-run`

Used by `/code:pr-feedback-watch` to discover the current PR and seed the payload session.

```bash
pr-address exec prepare-run \
  --harness-session-id "$HARNESS_SESSION_ID" \
  --format json
```

Common flags:

- `--include-all-threads`
- `--include-empty-reviews`
- `--payload-mode inline|payload`
- `--stdout-mode full|compact`

## `get-feedback`

Collect raw feedback for a known PR number and store a session payload artifact.

```bash
pr-address exec get-feedback <pr-number> --format json
pr-address exec get-feedback <pr-number> --include-resolved --format json
```

## `download-feedback`

Read-only Markdown feedback download used by `/pr:download-feedback` and `/pr:download-stack-feedback`.

```bash
pr-address exec download-feedback --pr-number <pr-number> --format json
```

The result includes `markdown` for editor prefill. It is triage-only and does not start the addressing pipeline.

## `map-branch-prs`

Map branch names to open PRs for the Pi stack download prompt.

```bash
slot gt exec stack-branches --format json \
  | pr-address exec map-branch-prs --format json
```

Callers may also pass `--branches-json <json>`.

## `classification-template`

Build the classification packet skeleton from the latest collected manifest.

```bash
pr-address exec classification-template --pr-number <pr-number> --format json
```

## Detail lookup

Use detail helpers when the compact manifest points to a body or item that needs expansion.

```bash
pr-address exec read-feedback-detail \
  --pr-number <pr-number> \
  --json-pointer /data/review_threads/0/comments/0/body \
  --format json

pr-address exec read-feedback-details \
  --pr-number <pr-number> \
  --selection-json '<json>' \
  --format json
```
