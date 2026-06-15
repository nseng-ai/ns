# pr-address exec CLI reference notes

## Artifact boundary

- Pipeline-produced artifacts live in the payload session and are resolved by PR number or by latest stack artifact lookup.
- Classification packets are agent-authored JSON inputs normally sent via stdin or `--classification-json`; `--classification-file` is allowed only for files outside the current git worktree.
- Agent-authored decisions files, checkpoint evidence files, and collection inputs remain explicit files where documented.
- Do not compose pipeline-produced wrapper JSON by hand.

## Session-only helpers

These helpers reject non-empty stdin with a machine `invalid_request` and treat removed explicit source flags as raw usage errors:

- `classification-template --pr-number <pr>` resolves the PR manifest from the session.
- `plan-feedback --pr-number <pr>` resolves the PR manifest and validated classification from the session.
- `stack-feedback-plan` resolves latest stack prep plus per-PR classifications from the session.
- `stack-feedback-diff-current` resolves latest stack plan plus current prep from the session.

## Helpers that still read explicit agent-authored input

- `validate-feedback-classification --pr-number <pr>` reads the agent-authored classification packet from stdin when no classification option is supplied.
- `validate-feedback-classification --pr-number <pr> --classification-json <json>` remains available for compact inline classification packets.
- `validate-feedback-classification --pr-number <pr> --classification-file <path>` reads an agent-authored classification packet only when `<path>` is outside the current git worktree; worktree-local paths hard-fail with no override.
- `build-resolve-thread-batch-payload --decisions-file <path>` and `build-stack-resolve-thread-payloads --decisions-file <path>` read agent-authored decisions.
- `record-batch-checkpoint --evidence-file <path>` reads agent-authored evidence.
- Collection helpers such as `map-branch-prs`, `stack-feedback-preflight`, and `stack-feedback-prep` may still read their documented collection inputs from stdin or explicit collection flags.

Every `exec` operation and every operation `--json-schema` route is
TypeScript-managed. The `pr-address` shim on `PATH` runs the TypeScript sources
from the enclosing asdl checkout when invoked inside one, and from the
installing checkout everywhere else. It requires `node` (Node 24 or newer).

Malformed argv (unknown/missing options, excess arguments, non-integer values,
invalid `--stdout-mode`/`--format` choices) is rejected in
TypeScript as a raw stderr usage error with exit code 2 — never a JSON
envelope.

## Invocation convention

All `pr-address exec <command> --format json` helpers:

- Accept `--stdout-mode compact|full`; `compact` is the default.
- In compact mode, require `HARNESS_SESSION_ID` or `--harness-session-id` whenever the helper must preserve a full result that is not already in a domain artifact. Missing sessions fail closed with the payload-store `harness_session_required` error.
- Compact `data` uses a stable digest shape: `operation`, optional `counts`, optional `summary`, optional `errors`/`warnings`, optional `resolved_inputs`, `artifacts.full_output` for generic preserved full output, `artifacts.produced[]` for domain artifacts, and `details` for small command-specific routing facts.
- Use `--stdout-mode full` for manual/debug invocations that need the previous full inline shape or need to run without a payload session for helpers that otherwise do not require one.
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
`summarize-feedback`, `stack-feedback-preflight`, `stack-feedback-prep`,
`map-branch-prs`, `reply-to-*`,
and `resolve-thread-*` mutations) must run from inside the target repository:
`gh` resolves `owner/repo` from the current directory's git remotes. Outside a
git work tree they fail fast with `error_type: "repo_context_required"`
(exit 2).

### Payload artifact commands

`prepare-run` and `get-feedback` write the full feedback envelope to a store-owned `.raw.json` payload and, in default compact stdout, print only a digest plus artifact references. `prepare-run` also writes a PR-scoped manifest summary artifact when a PR is found so `classification-template --pr-number` can use the same session. The manifest carries `payload_reference.payload_path` plus item-level body locators; it does not paste full review bodies into the main transcript.

Compact artifact mode requires `HARNESS_SESSION_ID` or `--harness-session-id <id>`. The payload store derives the safe on-disk payload session id from that raw harness id and outputs only the derived payload id plus a digest.

Use `--stdout-mode full` only as an explicit debugging escape. Full inline output can avoid a payload session for helpers that otherwise do not need one.

## ID scoping

- **`thread_id`** — GraphQL node IDs (e.g. `PRRT_kwDO...`). Globally unique
  across all PRs. No `pr_number` needed for thread operations.
- **`comment_id`** — REST numeric IDs. Require `pr_number` alongside them.
- **`pr_number`** — required for operations scoped to a PR (reviews,
  discussion comments, feedback fetches).

When in doubt, keep classification JSON out of the worktree, keep authored decisions/evidence in explicit files, and let `pr-address` locate pipeline artifacts through the current payload session.
