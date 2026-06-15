# pr-address CLI reference — run lifecycle

Shared invocation conventions live in [cli-reference.md](cli-reference.md).

## `record-batch-checkpoint`

Record compact evidence for one batch from session-resolved artifacts plus agent-authored evidence files/options.

```bash
pr-address exec record-batch-checkpoint \
  --pr-number 630 \
  --batch-id single_file \
  --commit-sha abc1234 \
  --validation-file validation.json \
  --non-thread-outcomes-file non-thread-outcomes.json \
  --format json
```

Required: `--pr-number`, `--batch-id`. The command resolves the latest PR plan, latest resolve-build artifact, and (when the build has `payload_ready: true`) latest thread-resolution artifact for that PR/batch from the current payload session.

Optional pins:

- `--from-build <sequence>` or `--from-build-reference <payload-path>`
- `--from-resolution <sequence>` or `--from-resolution-reference <payload-path>`
- `--harness-session-id <id>`

Agent-authored evidence inputs:

- `--validation-file` or `--validation-json`: array of `{command,status,exit_code,summary}`.
- `--non-thread-outcomes-file` or `--non-thread-outcomes-json`: array of PR-level review/discussion outcomes.

Changed files are derived from `--commit-sha` through git. Output includes `data.resolved_inputs` and, when evidence is valid, `data.checkpoint_reference` with descriptor `pr-address-pr-<n>-batch-<batch>-checkpoint`.

Removed: composed checkpoint `--payload-json`, `--payload-file`, and stdin wrapper payloads.

## `finalize-run`

Finalize from the current payload session.

Before finalization, refresh feedback:

```bash
pr-address exec get-feedback 630 --include-resolved --format json
```

Then run:

```bash
pr-address exec finalize-run --pr-number 630 --format json
```

The command resolves the latest PR feedback manifest and all PR-scoped checkpoint artifacts for that PR. Output includes `data.resolved_inputs.feedback` and `data.resolved_inputs.checkpoints`.

Removed: composed finalization `--payload-json`, `--payload-file`, and stdin wrapper payloads.

## Other commands

Use `pr-address exec <command> --json-schema` for exact schemas. Mutation command details live in [cli-mutation.md](cli-mutation.md); planning and collection commands live in their category files.
