# pr-address CLI reference — mutation and drift

Shared invocation conventions live in [cli-reference.md](cli-reference.md).

## Session-native mutation flow

Build helpers resolve plans from the current payload session and write PR-scoped build artifacts. `resolve-thread-batch` never accepts a composed payload; it mutates GitHub only from an explicit persisted build artifact.

### `build-resolve-thread-batch-payload`

Build a PR-scoped resolve-build artifact from the latest single-PR `plan-feedback` artifact.

```bash
pr-address exec build-resolve-thread-batch-payload \
  --pr-number 630 \
  --batch-id single_file \
  --commit-sha abc1234 \
  --decisions-file decisions.json \
  --format json
```

Options: `--pr-number`, `--batch-id`, `--decisions-file` are required. `--commit-sha`, `--continue-on-error`, and `--harness-session-id` are optional. `decisions.json` is the agent-authored array of resolve/skip decisions. The command writes `data.build_reference` with descriptor `pr-address-pr-<n>-batch-<batch>-resolve-build` when `data.valid` is true, including valid no-payload builds.

Removed: `--payload-json`, `--payload-file`, and stdin wrapper payloads.

### `build-stack-resolve-thread-payloads`

Build one PR-scoped resolve-build artifact per PR entry from the latest `stack-feedback-plan` artifact.

```bash
pr-address exec build-stack-resolve-thread-payloads \
  --batch-id local \
  --commit-sha abc1234 \
  --decisions-file stack-decisions.json \
  --format json
```

Options mirror the single-PR builder except there is no `--pr-number`; each decision includes `pr_number`. Output includes `data.build_references` and per-entry `build_reference` values.

Removed: `--payload-json`, `--payload-file`, `--stack-plan-reference`, and stdin wrapper payloads.

### `resolve-thread-batch`

Mutating helper. Requires exactly one persisted build artifact reference:

```bash
pr-address exec resolve-thread-batch --from-build 17 --format json
pr-address exec resolve-thread-batch --from-build-reference /abs/path/to/build.summary.json --format json
```

`--from-build <sequence>` resolves within the current harness payload session. `--from-build-reference <payload-path>` is for manual/debug replay. The referenced artifact must be a resolve-build artifact with `payload_ready: true`; no-payload builds are rejected before any GitHub call. Provenance validation happens before the first mutation. After any mutation attempt, including partial gateway failure, the command writes `data.resolution_reference` with descriptor `...-thread-resolution`.

No build reference returns `error_type: explicit_artifact_required`. Removed: direct `--payload-json`, `--payload-file`, and stdin mutation payloads.

### `resolve-thread-with-reply`

One-off fallback for a single review thread:

```bash
pr-address exec resolve-thread-with-reply PRRT_kw... fixed "Updated the guard." abc1234 --format json
```

Modes: `fixed`, `pre_existing`, `explained`, `planned`. Planned mode requires `--provenance-json`.

### `reply-to-review` / `reply-to-discussion`

Use these for PR-level reviews and discussion comments after code changes or when no code change is needed.

### `stack-feedback-diff-current`

Read-only drift check. It still supports session lookup and explicit reference payloads as documented by `--json-schema`; it is not part of the strict build/resolve mutation surface removed above.
