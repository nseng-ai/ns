# Roadmap

## Work

- [x] Complete the Objective CLI contract inventory.
  - Evidence: `contract-inventory.md` records current command surfaces, skill/Pi/CCC consumers, storage semantics, JSON/Markdown/human output contracts, tests, distribution assumptions, plugin-retirement evidence, and incidental Python details.
- [x] Decide the standalone/plugin/distribution cutover plan from inventory evidence.
  - Decision: target the standalone TypeScript `objective` CLI as the active surface, use a repo-local run-from-source shim by default, and retire `asdl objective` after a final consumer/test review instead of preserving plugin compatibility by default.
  - Evidence: `contract-inventory.md` found skill/Pi/CCC consumers invoking standalone `objective`, not `asdl objective`; the remaining plugin path is a smoke-test compatibility surface to deliberately retire or replace during cutover. `pr-address` provides the closest accepted precedent: standalone TS CLI only, Python plugin retired, in-repo Python deleted after parity/caller migration, and rollback/reference evidence preserved.
- [x] Build the minimal TypeScript package and first deterministic operation slice.
  - Start with `ts/packages/objective`, a standalone `objective` CLI shell, package-local storage/fake seams, and `objective exec read-objective` JSON/Markdown parity.
  - Policy: execution may proceed after preview as a single focused branch/PR. Keep the slice read-only and contract-heavy; do not add list/archive/runner usage in the same branch unless the preview is revised.
  - Evidence: `ts/packages/objective` now provides a standalone CLI shell with hidden `exec` group and `objective exec read-objective` JSON/Markdown output, backed by package-local storage/fake seams and focused Vitest scenario/unit coverage. Parent validation passed `pnpm --dir ts --filter @asdl/objective run check`, `pnpm --dir ts --filter @asdl/objective run test`, and `pnpm --dir ts run check`.
- [x] Port `objective list --minimal --format json` and minimal list-mode rendering.
  - Preserve active-root discovery, open/closed filtering, archive-root omission, latest update facts, JSON envelope fields parsed by Pi/CCC, names-only output, and dirty-marker boundaries.
  - Policy: execution may proceed after preview when the slice is limited to minimal/list contracts needed by Pi/CCC selection. Ask before freezing broad help/parser behavior or changing consumer JSON shapes.
  - Evidence: TypeScript `objective list` now supports selection-critical minimal JSON/Markdown rendering, `--names`, active/open/closed/all filtering, active-root direct-child discovery, archive-root omission, incomplete active directory inclusion, filename-derived latest update facts, and dirty markers stripped from JSON but rendered for human/Markdown output. Parent validation passed `pnpm --dir ts --filter @asdl/objective run check`, `pnpm --dir ts --filter @asdl/objective run test`, and `pnpm --dir ts run check`.
- [x] Port full `objective list` branch attribution and human/Markdown rendering.
  - Preserve default branch attribution, truncation notes, dirty marker display, local branch ordering, unavailable repo/trunk failure surfaces, and `--status` behavior.
  - Policy: execution may proceed after preview if branch attribution stays package-local. Ask before extracting shared git attribution helpers into `@asdl/core`.
  - Evidence: TypeScript default `objective list` now includes package-local branch attribution, full JSON `updated_branches_included` / `updated_branches_truncated` fields, per-record `updated_branches`, human/Markdown updated-branch rendering, dirty marker display without JSON pollution, and fake-backed git failure coverage. Parent validation passed `pnpm --dir ts --filter @asdl/objective run check`, `pnpm --dir ts --filter @asdl/objective run test`, `pnpm --dir ts run check`, and `git diff --check`.
- [x] Port `objective exec list-candidates`.
  - Preserve active open candidate filtering, tab-separated human output, JSON `records: [{slug, status}]`, and archive/closed exclusion.
  - Policy: this can be bundled with a nearby list slice only if the confirmed preview keeps one reviewable thesis: deterministic candidate inventory for skill/Pi callers.
  - Evidence: TypeScript `objective exec list-candidates` now reuses active checkout inventory to emit open active-root candidates only, renders tab-separated human rows, preserves JSON `records: [{slug, status}]`, excludes closed/archive records, and remains under the hidden `exec` group. Parent validation passed `pnpm --dir ts --filter @asdl/objective run check`, `pnpm --dir ts --filter @asdl/objective run test`, and `pnpm --dir ts run check`.
- [x] Port `objective archive` / `--unarchive`.
  - Preserve slug validation, LBYL missing-source and destination-collision refusal, directory rename behavior, JSON result fields, and human moved-path output.
  - Policy: execution may proceed after preview when limited to filesystem-backed active/archive movement. Ask before changing archive semantics, merging records, or adding metadata.
  - Evidence: TypeScript `objective archive <slug>` and `objective archive <slug> --unarchive` now move Objective directories through package-local real/fake storage seams with LBYL missing-source, non-directory source, destination-collision, missing-slug, and invalid-slug refusal. JSON output preserves durable result fields, human output renders moved source/destination paths, and tests cover archive-root exclusion from active list after a fake move. Parent validation passed `pnpm --dir ts --filter @asdl/objective run check`, `pnpm --dir ts --filter @asdl/objective run test`, `pnpm --dir ts run check`, and `git diff --check`.
- [ ] Port `objective exec runner-subagent-usage`.
  - Preserve JSONL telemetry parsing for Pi runner subagent session files, per-session statuses, aggregate token/cost/peak-context fields, Markdown table output, and negative/missing argument behavior.
  - Policy: execution may proceed after preview as a focused parser/rendering slice. Ask before changing stack digest semantics or inferring correctness from telemetry.
  - Evidence: fixture-backed parser tests, Markdown/JSON CLI tests, and a successful sample command usable by `objective-stack-impl` final digests.
- [ ] Decide and implement `asdl objective` plugin retirement or preservation.
  - Default decision is retirement after final consumer/test review because current inventory found standalone callers and only a plugin smoke-test contract.
  - Policy: steer-first. Do not execute plugin removal until the preview includes current grep evidence, the replacement/deletion plan for `tests/scenario/test_plugins.py`, and the expected user-visible compatibility note.
  - Evidence: updated plugin smoke tests or deliberate deletion/replacement, current grep showing no active `asdl objective` callers, and a Semantic Update recording the decision.
- [ ] Migrate callers and install recipes to the TypeScript-backed standalone CLI.
  - Update skill/Pi/CCC command assumptions only where needed; preserve `objective` command snippets. Update root install recipes and TS/package manifests for the run-from-source shim.
  - Policy: execution may proceed after preview when changes are limited to repo-local callers/installers. Ask before changing public command names or requiring checkout-free bundles.
  - Evidence: `objective` resolves to the TypeScript-backed command in the intended local install model, stale Python script references are removed, and TS checks/tests covering callers pass.
- [ ] Record rollback/reference evidence and delete the Python Objective package path.
  - Gate deletion on TypeScript parity, caller/docs/install migration, plugin-retirement evidence, and a recorded rollback/reference artifact.
  - Policy: steer-first. Do not delete Python until the preview lists the exact rollback/reference evidence and all parity gates that are satisfied.
  - Evidence: removed `packages/asdl-objectives` workspace/dev/test references, no stale imports or console scripts, plugin path resolved, validation passing, and Semantic Update recording the cutover.
- [ ] Feed reusable lessons, debt, and final status back into the umbrella Objective.
  - Update the umbrella TypeScript Objective only for migration playbook lessons, reusable package/debt patterns, or final status; keep Objective-specific implementation evidence here.
  - Policy: execution may proceed after preview for documentation-only updates. Ask before changing domain terminology or creating package `CONTEXT.md`.
  - Evidence: umbrella update/playbook entry where meaningful, final Objective update, and closure readiness assessment.

## Parked

- Objective product redesign beyond preserving current semantics.
- Browser-compatible Objective execution for local git/filesystem-backed workflows.
- Shared foundation extraction before repeated Objective-port seams prove it.
- Creating package context documentation unless explicitly selected as part of this port or a focused context session.
