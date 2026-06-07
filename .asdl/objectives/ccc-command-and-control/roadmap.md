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
  - Preserved public `/cmux:workspace:*` and `/cmux:sidebar:*` command names; `.pi/extensions/cmux.ts` now imports CCC registration directly. (These were later renamed to `/ccc:*` and the adapter became `.pi/extensions/ccc.ts` — see the rename row below.)
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

- [x] Rename the CCC public command prefix from `cmux:` to `ccc:` and remove the cmux command-suite shims.
  - Renamed the CCC Pi command surface `/cmux:workspace:*` → `/ccc:workspace:*` and `/cmux:sidebar:*` → `/ccc:sidebar:*`; `ccc` now names the orchestration layer's command surface while `cmux` is reserved for the external workspace tool.
  - Renamed the `cmux-sidebar` skill (and symlinks) to `ccc-sidebar`, `.pi/extensions/cmux.ts` to `.pi/extensions/ccc.ts` (exporting `registerCccExtension`), `ts/packages/ccc/src/cmux.ts` to `src/ccc.ts`, the `ASDL_CMUX_SIDEBAR_MODEL` env var to `ASDL_CCC_SIDEBAR_MODEL`, and the `pi:cmux-sidebar` status key to `pi:ccc-sidebar`.
  - Removed the `@asdl/pi-extensions` cmux command-suite compatibility shims and their covering test (`cmux-shims.test.ts`), plus the `./cmux/slot-open-branch` export from `@asdl/ccc`. The handoff-tab `focused-terminal-tab.ts` shim and the lower `pi-launch.ts`/`primitives.ts`/`types.ts` modules under `ts/packages/pi-extensions/src/cmux/` remain.
  - Supersedes the earlier "keep `/cmux:*` names for now" default and de-parks the `/ccc:*` namespace item; this was a deliberate namespace decision, not a prerequisite to the extraction.
  - Policy: deliberate user-confirmed rename; preserved tested behavior under the new prefix.
  - Evidence: see the 2026-06-07 rename update for the landed command-prefix rename, validation, and stale-`cmux:` registration check.

- [~] Move cross-domain launch orchestration into CCC while preserving lower domain ownership.
  - Move the `/planned-branch:up-and-impl` flow out of the planned-branch adapter into CCC-owned orchestration, leaving planned-branch write/create/impl primitives below.
  - Moved handoff-tab launch orchestration into CCC, leaving handoff identity/storage/listing semantics below.
  - Move Objective stack implementation orchestration into CCC or make the Objective adapter delegate to CCC, leaving Objective record/list/update semantics below.
  - Policy: direct execution after preview; ask first if command names or ownership boundaries need to change.
  - Evidence: handoff-tab launch now lives in `@asdl/ccc`, focused cmux terminal-tab helpers moved to CCC with a pi-extension shim, public handoff-tab command/tool names stayed stable, and validation passed with `bun test --cwd ts/packages/ccc`, `bun test --cwd ts/packages/pi-extensions`, `bun run --cwd ts check`, and `bun run --cwd ts test`.
  - Evidence still needed: planned-branch up-and-impl and Objective adapter orchestration move without lower packages importing CCC.

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

- [ ] Publishing CCC as a stable external package.
- [ ] Package-wide generic guard/helper consolidation outside the helpers needed for CCC migration.
- [ ] Replacing existing public slash-command families with a new command taxonomy.
