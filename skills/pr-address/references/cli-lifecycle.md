# Single-PR lifecycle

1. Start or reuse a payload session. `/code:pr-feedback-watch` passes `HARNESS_SESSION_ID` through `prepare-run`.
2. Collect feedback with `prepare-run` or `get-feedback`.
3. Build and fill a classification template.
4. Validate classification.
5. Plan feedback.
6. Build resolver payloads for approved batches.
7. Apply approved mutations.
8. Record checkpoints and finalize.

## Finalization

Before finalizing, refresh feedback so the session sees current thread state:

```bash
pr-address exec get-feedback <pr-number> --include-resolved --format json
pr-address exec finalize-run --pr-number <pr-number> --format json
```

`finalize-run` reports remaining unresolved work and recorded checkpoints from the payload session.

## Session artifacts

Payload artifacts are session-scoped. Do not copy them into the repo unless the user explicitly wants evidence preserved. Use returned `payload_path` references when chaining helpers.
