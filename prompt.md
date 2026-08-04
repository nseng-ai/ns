## Completion instructions
After you finish the implementation:
1. Create or update the branch commit using the repo's normal workflow.
2. Then run `!ns flow submit`.

## Launch context
This branch was created from the existing local Graphite trunk and is intentionally unrelated to the caller's current stack.

Plan a durable fix for the Flow land Graphite metadata output-contract regression, using `master` as the design baseline rather than continuing implementation on `sdk-filesystem-host-cutover`.

Goal

Produce an implementation-ready plan explaining the smallest correct change that will let Flow land read Graphite branch metadata through the hosted `ns flow exec read-graphite-branch-metadata` command after the SDK filesystem-host/modern Clinkr cutover. Do not implement the fix unless explicitly instructed afterward.

Repository and workflow requirements

- Execute from the destination Slot worktree; treat its cwd as authoritative.
- Repository paths below are relative to the repository root.
- Load active initiative orientations before non-trivial work:
  `ns objective exec load-orientations --format md`
- Check active Objectives with `ns objective list`, especially anything concerning Clinkr, SDK host composition, Flow, provider-neutral stacking, or test boundaries.
- Read the root `AGENTS.md`, `ts/AGENTS.md`, and any nearer nested instructions before editing or finalizing a plan.
- For planning and terminology, read `CONTEXT-MAP.md` and `ts/packages/incubating/extensions/flow/CONTEXT.md`.
- Load the applicable TypeScript, CLI-design, fake-driven-testing, and bug-diagnosis skills.
- Plan from current `master`. Verify the destination checkout’s branch and commit before analysis. Do not commit on `main` or `master`; if any checkpoint is eventually needed, create a feature branch first.
- Do not run `ns flow land`; landing is destructive/external workflow work.

Source branch context

The regression was observed on branch `sdk-filesystem-host-cutover`, PR #4091, after commit:

- `30d0357a2` — `Rebuild SDK host composition on filesystem sources`

At the time of the source handoff, PR #4091 was open at:

- `a4437c188b95cd106ebe87251376bc212c06ce04`

That branch state is historical context only. The destination agent must verify what is now on `master`, whether the cutover commit or equivalent code has landed, and which relevant files differ between `master` and `sdk-filesystem-host-cutover`. Do not assume the historical branch head or PR state remains current.

Verified diagnosis from the source session

The actual land failure was reproduced directly against a real Graphite metadata database.

Land constructs and runs this hidden command without an explicit format flag:

`ns flow exec read-graphite-branch-metadata --db-path <db-path>`

The command implementation currently models its successful result as a string:

- `resultSchema: z.string()`
- `return ok(result.stdout.trim() === "" ? "[]" : result.stdout.trim())`

The string itself contains JSON produced by `sqlite3 -json`.

Before the SDK host cutover, the legacy command adapter special-cased successful strings as human output, so the process emitted the string bytes directly:

`[{"branch_name":"master", ...}]`

After the modern filesystem-host/Clinkr cutover, default human rendering JSON-serializes the successful string. The same invocation now emits a JSON string:

`"[{\"branch_name\":\"master\", ...}]"`

The land consumer performs `JSON.parse(result.stdout)` and then requires the parsed value to be an array. Parsing succeeds but yields a string, so the fail-closed parser emits:

`ns flow exec returned non-array JSON for the Graphite metadata DB ...; refusing to land.`

The source session’s deterministic reproduction reported:

- command exit code: `0`
- parsed top-level type: string
- failure signal: `RED: expected top-level row array, got string`

Running the command with `--format json` produced a modern Clinkr success envelope whose `data` remained a JSON-encoded string:

- top-level envelope object
- `status: "success"`
- `exitCode: 0`
- `data: "[{\"branch_name\":...}]"`

The command’s published `--json-schema` likewise described success `data` as a string.

Therefore:

- The Graphite database was readable.
- This was not evidence of Graphite metadata corruption.
- The original “envelope mismatch” hypothesis was directionally correct, but the real land invocation failed through default human rendering before any machine-envelope decoding.
- Adding `--format json` alone would not be sufficient if land continued to expect a top-level array; it would receive an envelope object whose `data` is still a serialized JSON string.

Verified test gap

Existing tests passed despite the installed CLI failure because they bypassed or replaced the hosted serialization boundary:

- Command scenario tests called the command handler directly and manually wrote successful string data unchanged.
- Unit land tests stubbed the `ns` invocation with a bare row-array JSON value.
- The sandbox integration’s fake `ns` executable returned a bare row array.
- The real Graphite integration intercepted the hidden command and invoked `sqlite3` directly.

The focused source-session run passed:

- 2 test files
- 13 tests

This was false confidence because none of those tests exercised the real modern Clinkr host serialization contract between land and the hidden command.

Primary anchors

Inspect these on current `master` and record any drift:

- `ts/packages/incubating/extensions/flow/src/land/stack/graphite-topology.ts`
  - `loadGraphiteTopology`
  - Parses hidden-command stdout and owns the non-array refusal.
- `ts/packages/incubating/extensions/flow/src/land/stack/graphite-command-channel.ts`
  - `readGraphiteBranchMetadataCommand`
  - Owns the hidden command argv.
- `ts/packages/incubating/extensions/flow/src/ns/cli/flow/exec/read-graphite-branch-metadata/command.ts`
  - Filesystem route adapter for the hidden command.
- `ts/packages/incubating/extensions/flow/src/ns/commands/exec-read-graphite-branch-metadata.ts`
  - `flowExecReadGraphiteBranchMetadataCommand`
  - Current result schema and handler contract.
- `ts/packages/public/infra/clinkr/src/app/outcome.ts`
  - Modern success outcomes and machine envelopes.
- `ts/packages/public/infra/clinkr/src/app/app.ts`
  - Human versus JSON terminal emission.
- `ts/packages/public/sdk/src/cli/index.ts`
  - Current SDK host composition and Clinkr command mounting.
- `ts/packages/public/sdk/src/sdk/command.ts`
  - SDK command definition/result schema behavior.
- `ts/packages/public/infra/foundation/src/primitives/machine-envelope.ts`
  - Existing machine-envelope parser; currently expects successful `data` to be an object, so verify whether it can support array data or whether a narrow command-specific decoder is more appropriate.
- `ts/packages/public/extension-kit/src/kit/machine-envelope-exec.ts`
  - Existing envelope-aware subprocess pattern; assess suitability without forcing an object-only abstraction onto array data.
- `ts/packages/public/extension-kit/src/graphite/metadata.ts`
  - `graphiteBranchMetadataReadonlyJsonArgs`
  - `parseGraphiteBranchMetadataRows`
  - Existing Graphite row/topology parsing and fail-closed diagnostics.

Tests to inspect

- `ts/packages/incubating/extensions/flow/test/scenario/exec-read-graphite-branch-metadata-command.test.ts`
- `ts/packages/incubating/extensions/flow/test/scenario/flow-command-fakes.ts`
  - The direct-handler harness manually renders outcomes and is not equivalent to hosted CLI output.
- `ts/packages/incubating/extensions/flow/test/scenario/ns-cli-fakes.ts`
- `ts/packages/incubating/extensions/flow/test/unit/land-stack-topology-guards.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/land-stack-snapshot.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/land-context-adapter.test.ts`
- `ts/packages/incubating/extensions/flow/test/unit/land-test-helpers.ts`
- `ts/packages/incubating/extensions/flow/test/integration/land-stack-graphite-cli.test.ts`
- `ts/packages/incubating/extensions/flow/test/integration/land-stack-sandbox.test.ts`

Planning direction to evaluate

The preferred durable direction is an explicit typed machine contract:

1. Parse `sqlite3 -json` output at the hidden command boundary.
2. Return typed row-array data rather than a string containing serialized JSON.
3. Invoke the hidden command with explicit `--format json`.
4. Decode and validate the Clinkr success envelope before passing its `data` to `parseGraphiteBranchMetadataRows`.
5. Add regression coverage that exercises the real hosted CLI serialization boundary used by land.

Treat this as a proposed direction, not an unquestionable implementation prescription. Verify on `master`:

- Whether a reusable Graphite metadata row schema/type already exists.
- Whether Clinkr or Foundation already exposes an appropriate generic envelope decoder supporting array payloads.
- Whether the hidden command should return minimally validated raw row objects or fully validated Graphite metadata rows.
- Which layer should classify malformed SQLite JSON.
- Whether the actual installed `ns` executable can be exercised hermetically through SDK source inventory in a focused test.
- Whether a representative hosted CLI smoke belongs in the default, integration, sanity, or isolated lane under current test-boundary rules.

Constraints and decisions

- Preserve the modern Clinkr envelope contract; do not restore legacy raw-string behavior globally.
- Do not add a custom human renderer merely to make the hidden command emit raw JSON. That would retain consumption of human output as an internal machine protocol.
- Keep the hidden command under the hidden `flow exec` subgroup.
- Preserve fail-closed behavior for:
  - malformed command output
  - malformed envelopes
  - unsuccessful envelopes
  - missing or unreadable databases
  - unsupported/missing SQLite schema
  - non-array metadata data
  - rows missing `branch_name`
  - corrupt `children` values
- Do not bypass metadata verification or weaken land safety guards.
- Prefer explicit machine format over TTY/default-human behavior.
- Avoid adding new ambient Graphite dependencies; this is an explicitly Graphite-branded existing boundary.
- Keep tests fake-driven by default. Real subprocess/CLI-host compatibility belongs in the appropriate specialized lane.
- Avoid module mocks, process mutation, shared fake timers, or other shared-cache violations.
- Use existing gateway and command-shape conventions rather than introducing a new broad subprocess abstraction.
- Scope the plan to this regression; do not mix in unrelated SDK deletion-audit follow-up work.

Required planning work

1. Revalidate the diagnosis against current `master`.
   - Determine whether the relevant cutover code is present.
   - If `master` does not reproduce the regression because the cutover has not landed, compare `master` with `sdk-filesystem-host-cutover` or the relevant commit and plan the fix so it can be stacked cleanly on the cutover.
   - Clearly distinguish current facts from historical source-session facts.

2. Establish the intended contract.
   - Specify the hidden command’s typed success data shape.
   - Specify the exact hosted stdout shape under `--format json`.
   - Specify the land-side decoding and failure classification.
   - Decide how malformed SQLite JSON should be reported without throwing an opaque host error.

3. Design the regression test seam.
   - Include a fast red-capable test that fails on the exact quoted-string/envelope mismatch.
   - Ensure at least one test crosses the filesystem route/SDK host/Clinkr emission boundary rather than directly calling only the command handler.
   - Update lower-level fakes and shims so they model the new envelope honestly.
   - Preserve separate topology corruption tests.

4. Identify the minimum production files to change and describe each change at symbol level.

5. Define validation commands.
   At minimum, plan for:
   - the narrow regression test
   - relevant Flow scenario/unit tests
   - `just`
   - `just ts-test-integration`
   - `just ts-test-sanity` if the selected hosted test lane requires it
   - `just ts-test-typescript-style-guard` when changing guarded TypeScript architecture or tests
   - `just ts-check`
   Follow current repository instructions if command expectations have changed.

6. Define post-fix verification.
   - Directly run the hidden command against a non-destructive fixture or available metadata database and verify the envelope/data shape.
   - Do not retry `ns flow land` without explicit user authorization.

Expected deliverable

Return a concise but implementation-ready plan containing:

- current `master` baseline and relevant drift from the historical source branch
- root-cause statement
- selected producer/consumer contract
- ordered production changes with paths and symbols
- ordered test changes with the exact hosted boundary exercised
- failure-mode preservation checklist
- validation sequence
- risks, unknowns, and decisions requiring confirmation

Material external context

A real database used in the source-session reproduction existed at:

`/Users/schrockn/code/nseng-ai/ns/.git/.graphite_metadata.db`

This is external context, not part of the destination implementation checkout. Do not depend on it being present. Prefer a hermetic fixture for planning and tests; use any external database only for optional read-only verification.

Source evidence, if deeper historical detail is necessary

- Source session ID: `019fcefb-c1a4-7217-8d53-9fee71271635`
- Source session log: `/Users/schrockn/.pi/agent/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-05--/2026-08-04T22-53-53-444Z_019fcefb-c1a4-7217-8d53-9fee71271635.jsonl`

The log is external context and should not be inspected unless the summarized evidence above proves insufficient.