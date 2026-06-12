# pr-address CLI reference

Routing index for `pr-address exec` helpers. Shared conventions live in this
file; per-helper input/output tables live in the category files mapped in
[Helper routing](#helper-routing). Read this index first, then read **only the
mapped category file's section for the helper you are about to call**.

All commands are literal `pr-address ...` invocations of the `pr-address` CLI
on `PATH` (installed from an asdl checkout with `just install-pr-address`).

The per-helper reference is authoritative — if it disagrees with memory, the
reference wins. If unsure about a field's exact shape, also run
`pr-address exec <helper> --json-schema` to print the JSON schemas for that
helper's input/output/error shapes.

## Helper routing

| Helper                                | File                                   |
| ------------------------------------- | -------------------------------------- |
| `prepare-run`                         | [cli-collection.md](cli-collection.md) |
| `get-feedback`                        | [cli-collection.md](cli-collection.md) |
| `stack-feedback-prep`                 | [cli-collection.md](cli-collection.md) |
| `map-branch-prs`                      | [cli-collection.md](cli-collection.md) |
| `read-feedback-detail`                | [cli-collection.md](cli-collection.md) |
| `read-feedback-details`               | [cli-collection.md](cli-collection.md) |
| `summarize-feedback`                  | [cli-collection.md](cli-collection.md) |
| `classification-template`             | [cli-planning.md](cli-planning.md)     |
| `validate-feedback-classification`    | [cli-planning.md](cli-planning.md)     |
| `plan-feedback`                       | [cli-planning.md](cli-planning.md)     |
| `stack-feedback-plan`                 | [cli-planning.md](cli-planning.md)     |
| `resolve-thread-with-reply`           | [cli-mutation.md](cli-mutation.md)     |
| `build-resolve-thread-batch-payload`  | [cli-mutation.md](cli-mutation.md)     |
| `stack-feedback-diff-current`         | [cli-mutation.md](cli-mutation.md)     |
| `build-stack-resolve-thread-payloads` | [cli-mutation.md](cli-mutation.md)     |
| `resolve-thread-batch`                | [cli-mutation.md](cli-mutation.md)     |
| `reply-to-review`                     | [cli-mutation.md](cli-mutation.md)     |
| `reply-to-discussion`                 | [cli-mutation.md](cli-mutation.md)     |
| `record-batch-checkpoint`             | [cli-lifecycle.md](cli-lifecycle.md)   |
| `finalize-run`                        | [cli-lifecycle.md](cli-lifecycle.md)   |
| Other commands                        | [cli-lifecycle.md](cli-lifecycle.md)   |

Do not read all category files up front; load each file's relevant section
lazily, when a run actually needs that helper.

## TypeScript implementation status

Every `exec` operation and every operation `--json-schema` route is
TypeScript-managed. The `pr-address` shim on `PATH` runs the TypeScript sources
from the enclosing asdl checkout when invoked inside one, and from the
installing checkout everywhere else. It requires `node` (Node 24 or newer).

Use the standalone `pr-address` binary for all commands in this reference. Do
not route these helpers through the umbrella command or a Python fallback.

## Invocation convention

All `pr-address exec <command> --format json` helpers:

- Accept input as CLI options/arguments and produce the machine envelope
  `{"exit_code": 0|1|2, "data": ..., "error_type": ..., "message": ...}`
  on stdout.
- Successful runs set `exit_code: 0` and place the payload under `data`.
- Negative, non-fatal outcomes set `exit_code: 1`, include `message`, and may
  include `data` with partial evidence.
- Failures set `exit_code: 2` with `error_type` and `message` (no `data`).
- Support `--json-schema` to print JSON schemas for input/output/error shapes
  and exit without running the operation.

```bash
pr-address exec resolve-thread-with-reply \
  PRRT_kw... fixed "Updated the guard." abc1234 --format json
```

Operations that call GitHub (`prepare-run`, `get-feedback`,
`summarize-feedback`, `stack-feedback-prep`, `map-branch-prs`, `reply-to-*`,
and `resolve-thread-*` mutations) must run from inside the target repository:
`gh` resolves `owner/repo` from the current directory's git remotes. Outside a
git work tree they fail fast with `error_type: "repo_context_required"`
(exit 2).

### Payload artifact commands

`prepare-run` and `get-feedback` default to `payload_mode: "payload"`. In
payload mode, the command prints a compact manifest under `data` and writes the
full feedback envelope to a store-owned `.raw.json` payload. The manifest carries
`payload_reference.payload_path` plus item-level body locators; it does not paste
full review bodies into the main transcript.

Payload mode requires one caller-supplied payload session id, passed with
`--payload-session-id <id>` or the `ASDL_PAYLOAD_SESSION_ID` environment
variable. The id must be a lowercase safe path segment matching
`^[a-z0-9][a-z0-9._-]{0,127}$`. Use the same id for every payload feedback
command in one skill invocation.

Use `--payload-mode inline` only as an explicit debugging or migration escape
hatch. Inline mode prints the full raw payload and does not require a payload
session id.

## ID scoping

- **`thread_id`** — GraphQL node IDs (e.g. `PRRT_kwDO...`). Globally unique
  across all PRs. No `pr_number` needed for thread operations.
- **`comment_id`** — REST numeric IDs. Require `pr_number` alongside them.
- **`pr_number`** — required for operations scoped to a PR (reviews,
  discussion comments, feedback fetches).
