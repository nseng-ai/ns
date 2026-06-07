# Roadmap

## Work

- [x] Establish the CCC package and vocabulary without changing user-facing command behavior.
  - Created the private TypeScript workspace package `ts/packages/ccc/` with package name `@asdl/ccc`.
  - Added package manifest, TypeScript config, a small package identity export, and focused identity test without moving command behavior.
  - Added durable context language for CCC in `ts/packages/ccc/CONTEXT.md`, `ts/packages/pi-extensions/CONTEXT.md`, and `CONTEXT-MAP.md`.
  - Policy: direct execution after preview.
  - Evidence: parent validation passed with `bun run --cwd ts check`, `bun run --cwd ts test`, targeted `dprint check`, and `git diff --check`; public slash-command registrations were not changed in this slice.

- [x] Move cmux workspace and sidebar orchestration into CCC.
  - Moved the cmux command suite registry and workspace/sidebar orchestration into `ts/packages/ccc/src/cmux.ts` and `ts/packages/ccc/src/cmux/`.
  - Left generic/lower helper seams outside CCC and kept tiny `@asdl/pi-extensions` compatibility shims where existing non-cmux code still imports cmux helpers.
  - Preserved public `/cmux:workspace:*` and `/cmux:sidebar:*` command names; `.pi/extensions/cmux.ts` now imports CCC registration directly.
  - Policy: direct execution after preview.
  - Evidence: parent validation passed with `bun run --cwd ts check`, `bun test --cwd ts/packages/ccc`, focused cmux/handoff-tab tests, `bun run --cwd ts test`, targeted `dprint check`, and `git diff --check`.

- [x] Neutralize shared session artifacts and runtime helpers that CCC consumes but should not own.
  - Moved the planned-branch output/session-artifact contract into `@asdl/planned-branch` as a lower neutral/domain contract shared by planned-branch producers and CCC consumers.
  - Extracted `@asdl/pi-extension-runtime` as the lower neutral helper package for command runtime formatting, machine-envelope parsing, shell quoting, tail formatting, terminal presentation, Objective picker/list helpers, skill expansion, branch-slug helpers, and cmux/Pi runtime types.
  - CCC now imports shared runtime helpers from `@asdl/pi-extension-runtime`, not from `@asdl/pi-extensions` internals; `@asdl/pi-extensions` keeps compatibility re-export paths during migration.
  - Kept lower packages from importing CCC except intentional temporary `@asdl/pi-extensions` cmux compatibility shims; `@asdl/pi-extensions/src/planned-branch-output.ts` is now a compatibility re-export.
  - Moved cmux behavior tests under `ts/packages/ccc/test/` so CCC package tests cover the command suite it owns, and left a small pi-extensions shim smoke test for legacy import paths.
  - Policy: direct execution after preview; steer first if a lower package would need a CCC import.
  - Evidence: review follow-up validation should pass `bun run --cwd ts check`, `bun test --cwd ts/packages/ccc`, focused planned-branch/pi-extension tests, `bun run --cwd ts test`, and `git diff --check`.

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

These are future product or cleanup possibilities, not Objective non-goals restated as roadmap work:

- [ ] Public `/ccc:*` slash-command namespace or aliases.
- [ ] Publishing CCC as a stable external package.
- [ ] Package-wide generic guard/helper consolidation outside the helpers needed for CCC migration.
- [ ] Replacing existing public slash-command families with a new command taxonomy.
