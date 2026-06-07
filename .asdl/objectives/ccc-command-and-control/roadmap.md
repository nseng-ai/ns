# Roadmap

## Work

- [x] Establish the CCC package and vocabulary without changing user-facing command behavior.
  - Created the private TypeScript workspace package `ts/packages/ccc/` with package name `@asdl/ccc`.
  - Added package manifest, TypeScript config, a small package identity export, and focused identity test without moving command behavior.
  - Added durable context language for CCC in `ts/packages/ccc/CONTEXT.md`, `ts/packages/pi-extensions/CONTEXT.md`, and `CONTEXT-MAP.md`.
  - Policy: direct execution after preview.
  - Evidence: parent validation passed with `bun run --cwd ts check`, `bun run --cwd ts test`, targeted `dprint check`, and `git diff --check`; public slash-command registrations were not changed in this slice.

- [ ] Move cmux workspace and sidebar orchestration into CCC.
  - Move the current cmux command suite registry and workspace-opening/sidebar modules into CCC or CCC-owned modules: `cmux.ts`, `cmux/slot-dispatch-plan.ts`, `cmux/dispatch-prompt.ts`, `cmux/slot-open-branch.ts`, `cmux/slot.ts` orchestration, `cmux/pi-launch.ts`, `cmux/sidebar.ts`, focused cmux tab/surface helpers, and worktree description helpers as appropriate.
  - Keep low-level cmux/slot client seams separate from higher orchestration modules.
  - Preserve public `/cmux:workspace:*` and `/cmux:sidebar:*` command names.
  - Policy: direct execution after preview.
  - Evidence: cmux tests pass in the new home; command registration behavior and exact command names are unchanged unless explicitly approved.

- [ ] Neutralize shared session artifacts and runtime helpers that CCC consumes but should not own.
  - Move or wrap `planned-branch-output` as a neutral session-artifact contract shared by planned-branch producers and CCC consumers.
  - Keep command runtime, machine-envelope parsing, shell quoting, tail formatting, and terminal presentation below CCC or extract them to a neutral runtime module if needed.
  - Keep lower packages from importing CCC.
  - Policy: direct execution after preview; steer first if a lower package would need a CCC import.
  - Evidence: import direction is downward into CCC, never upward from lower packages; planned-branch and CCC both use the neutral planned-branch output contract.

- [ ] Move cross-domain launch orchestration into CCC while preserving lower domain ownership.
  - Move the `/planned-branch:up-and-impl` flow out of the planned-branch adapter into CCC-owned orchestration, leaving planned-branch write/create/impl primitives below.
  - Move handoff-tab launch orchestration into CCC, leaving handoff identity/storage/listing semantics below.
  - Move Objective stack implementation orchestration into CCC or make the Objective adapter delegate to CCC, leaving Objective record/list/update semantics below.
  - Policy: direct execution after preview; ask first if command names or ownership boundaries need to change.
  - Evidence: planned-branch, handoff-tab, and Objective adapter tests pass; lower lifecycle commands still work without importing CCC.

- [ ] Move repo source-control command/control workflows into CCC.
  - Move `/code:autobranch` and its preparation/transaction modules into CCC because it encodes dirty-worktree-to-Graphite-branch-to-checkpoint policy.
  - Move `/code:land` and `/code:land-stack` orchestration into CCC because they encode repository Graphite/GitHub/slot landing policy.
  - Keep `asdl-dev` command runners, pending-worktree snapshots, checkpoint primitives, Vercel preview lookup, and lower gateways outside CCC.
  - Decide whether `/code:submit` remains a pure `asdl-dev` mirror or receives a CCC wrapper only for command-suite placement.
  - Policy: direct execution after preview; external PR submission or landing remains out of scope unless explicitly confirmed.
  - Evidence: autobranch and landing tests pass after the move; `asdl-dev` tests still pass and do not import CCC.

- [ ] Split workspace status so CCC observability is explicit but generic Pi footer plumbing stays reusable.
  - Split `worktree-status.ts` into operational facts/presentation that belong with CCC and generic Pi status/footer/session lifecycle pieces that do not.
  - Keep brmem/Graphite/dirty/PR operational status readable as CCC observability without making Branch Memory or Graphite primitives CCC-owned.
  - Policy: direct execution after preview; prefer split-before-move over wholesale move.
  - Evidence: worktree-status tests pass; module names make ownership clear.

- [ ] Finalize migration evidence and Objective tracking.
  - Run relevant TypeScript and Markdown checks.
  - Record a Semantic Update summarizing the implemented slices, validation, import-direction evidence, and any parked follow-ups.
  - Leave PR submission and Objective closure for explicit user inspection/request.
  - Policy: direct execution after preview.
  - Evidence: `just ts-check`, `just ts-test`, `just dprint-check`, and `git diff --check` pass or unrelated blockers are recorded.

## Parked

- [ ] Public `/ccc:*` slash-command namespace or aliases.
- [ ] Publishing CCC as a stable external package.
- [ ] Moving Branch Memory, handoff, Objective, planned-branch, or asdl-dev domain semantics into CCC.
- [ ] Moving runner-subagent core machinery into CCC.
- [ ] Branch Memory ledgers, CCC hidden state, stack schemas, YAML registries, or task databases for this migration.
- [ ] Automatic PR submission, stack landing, deployment, publishing, or GitHub mutation during implementation without an explicit user request.
- [ ] Package-wide generic guard/helper consolidation outside the helpers needed for CCC migration.
- [ ] Replacing existing public slash-command families with a new command taxonomy.
