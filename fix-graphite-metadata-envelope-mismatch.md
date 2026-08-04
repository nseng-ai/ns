# Handoff: Investigate Flow land Graphite metadata envelope mismatch

Continuation focus: Diagnose and fix why `ns flow land` rejects the output of `ns flow exec read-graphite-branch-metadata` as non-array JSON for the real Graphite metadata database.

## Context

On branch `sdk-filesystem-host-cutover`, PR #4091 (`Rebuild SDK host composition on filesystem sources`) was brought green after fixing CI-sensitive source-dev test setup and modern Clinkr envelope consumers. A subsequent `/ns:flow:land` attempt exited 1 during land preflight with:

`land stopped: ns flow exec returned non-array JSON for the Graphite metadata DB at /Users/schrockn/code/nseng-ai/ns/.git/.graphite_metadata.db; refusing to land.`

The captured stdout is dominated by terminal control/progress rendering and does not expose the hidden exec command's raw payload. Investigate the command directly rather than inferring its JSON shape from the TUI transcript.

## Current State

- Current branch: `sdk-filesystem-host-cutover`.
- Worktree was clean after the failed land attempt.
- PR #4091 remains open and unmerged at head `a4437c188b95cd106ebe87251376bc212c06ce04`.
- GitHub CI, dprint, integration, isolated, sanity, style-guard, and automated Reviews checks passed for that head before landing was attempted.
- The failed land attempt stopped during preflight; no PR merge occurred.
- The branch has Graphite parent `clinkr-scope-local-topology-issues` and child `objectives-real-host-acceptance`; the previous submit restacked the child.
- No diagnosis or fix for the land error has yet been made.

## Decisions / Findings

- Treat this as an output-contract mismatch until proven otherwise. The direct error site is `graphite-topology.ts`, which parses the hidden command's stdout with `JSON.parse` and then requires an array.
- The filesystem-host cutover changed structured command output to modern Clinkr machine envelopes. A likely hypothesis is that `ns flow exec read-graphite-branch-metadata --format json` now emits an envelope object such as `{ status, exitCode, data }`, while the land caller still expects the old bare row array. Verify this directly; do not assume it.
- A closely related cutover bug was already fixed in this session: Reviews publication and smart-restack consumers still expected legacy envelope statuses/shapes after commands moved to modern Clinkr output.
- Preserve fail-closed land behavior for malformed output, missing databases, schema mismatch, and rows without `branch_name`. Fix the producer/consumer contract rather than weakening guards or bypassing metadata verification.
- Avoid rerunning `ns flow land` until the hidden command output is understood and a targeted test covers the real invocation shape; landing is destructive/external workflow work.

## Next Steps

1. Run the exact hidden command against `/Users/schrockn/code/nseng-ai/ns/.git/.graphite_metadata.db` with machine output and capture stdout/stderr without the Pi live-progress renderer. Inspect whether output is a modern Clinkr envelope, a bare array, or another shape.
2. Trace `graphite-command-channel.ts` and `graphite-topology.ts` to see the exact argv, format flags, and decoding boundary used by land.
3. Inspect the route adapter and command implementation for `read-graphite-branch-metadata`, including its result schema and return value, to identify whether the intended contract is a modern envelope or raw array.
4. Compare current tests with the real command path. Existing scenario tests may invoke the command object below the CLI envelope boundary, while integration stubs may return the pre-cutover bare array.
5. Add a regression test that exercises the actual land-to-hidden-command output contract. Prefer a narrow fake-driven contract test plus a representative hosted/CLI smoke if needed; do not broaden into real landing mutation.
6. Apply the minimum compatible fix, run focused Flow tests plus `just`, `just ts-test-integration`, and relevant specialized lanes, then amend/submit through Graphite. Only retry landing after checks are green and the user authorizes it.

## Investigation Sources

- Source Pi session ID: 019fcee7-7312-7ef7-8752-ec5efaddde11
- Source Pi session log: /Users/schrockn/.pi/agent/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-05--/2026-08-04T22-31-42-610Z_019fcee7-7312-7ef7-8752-ec5efaddde11.jsonl
- Related files:
  - `ts/packages/incubating/extensions/flow/src/land/stack/graphite-topology.ts` — parses hidden-command stdout and emits the exact non-array refusal.
  - `ts/packages/incubating/extensions/flow/src/land/stack/graphite-command-channel.ts` — owns invocation of the hidden Graphite metadata command.
  - `ts/packages/incubating/extensions/flow/src/ns/cli/flow/exec/read-graphite-branch-metadata/command.ts` — filesystem route adapter selected by the hidden CLI path.
  - `ts/packages/incubating/extensions/flow/src/ns/commands/exec-read-graphite-branch-metadata.ts` — command implementation and result contract.
  - `ts/packages/incubating/extensions/flow/test/scenario/exec-read-graphite-branch-metadata-command.test.ts` — command-level behavior coverage that may stop below the CLI envelope boundary.
  - `ts/packages/incubating/extensions/flow/test/unit/land-stack-topology-guards.test.ts` — fail-closed topology/parser coverage.
  - `ts/packages/incubating/extensions/flow/test/integration/land-stack-graphite-cli.test.ts` — real Graphite CLI integration and hidden-command interception behavior.
  - `ts/packages/incubating/extensions/flow/test/integration/land-stack-sandbox.test.ts` — sandbox land integration with a stubbed hidden command.
  - `/Users/schrockn/.local/state/ns/enriched-plan/gh--nseng-ai--ns/sdk-filesystem-host-cutover/restore-sdk-filesystem-host-tests.md` — saved follow-up plan for deletion-audit coverage gaps; separate from this land failure but relevant branch context.

## Useful Commands / Files

- PR: https://github.com/nseng-ai/ns/pull/4091
- Direct database path from failure: `/Users/schrockn/code/nseng-ai/ns/.git/.graphite_metadata.db`
- Inspect the hidden command surface: `ns flow exec read-graphite-branch-metadata --help`
- Reproduce machine output directly: `ns flow exec read-graphite-branch-metadata --db-path /Users/schrockn/code/nseng-ai/ns/.git/.graphite_metadata.db --format json`
- Current branch checks: `gh pr checks 4091 --repo nseng-ai/ns`
- Current Graphite topology: `gt branch info --no-interactive`; `gt parent --no-interactive`; `gt children --no-interactive`
