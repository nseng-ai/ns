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
- [x] Port `objective exec runner-subagent-usage`.
  - Preserve JSONL telemetry parsing for Pi runner subagent session files, per-session statuses, aggregate token/cost/peak-context fields, Markdown table output, and negative/missing argument behavior.
  - Decision: keep Python-compatible JSON envelope behavior during the port; defer flipping Objective commands to normal `@asdl/clinkr` JSON output to the later retirement/cutover gate after consumer evidence is current.
  - Policy: execution may proceed after preview as a focused parser/rendering slice. Ask before changing stack digest semantics or inferring correctness from telemetry.
  - Evidence: TypeScript now implements `objective exec runner-subagent-usage` with JSONL parser/aggregate logic, Markdown table rendering, hidden exec CLI wiring, unit parser tests, and JSON/Markdown/help scenario coverage. Parent validation passed `pnpm --dir ts --filter @asdl/objective run check`, `pnpm --dir ts --filter @asdl/objective run test`, `pnpm --dir ts run check`, `pnpm --dir ts run test`, and `git diff --check`.
- [x] Retire the `asdl objective` plugin path and coordinate JSON-envelope consumers.
  - Decision: retired the plugin path rather than preserving it. Fresh grep outside Objective records found no active skill/Pi/CCC `asdl objective` callers; remaining live references were docs-site install prose, the Python plugin implementation, and `tests/scenario/test_plugins.py::test_objective_plugin_integration`.
  - JSON compatibility decision: deliberately retained the TypeScript Objective-local `legacyMachine` projections for `list`, `exec list-candidates`, `exec read-objective`, and `exec runner-subagent-usage` so first-party Pi/CCC consumers continue receiving the Clinkr machine envelope with facts-only `data` fields.
  - Evidence: Objective plugin smoke test and Python plugin imports were removed from `tests/scenario/test_plugins.py`; consumer JSON tests remained green under full TS validation; stale active `asdl objective` references were removed from install/docs and Python package sources were deleted.
- [x] Migrate callers, docs, and install recipes to the TypeScript-backed standalone CLI.
  - Preserve the public command name `objective`, but make the intended local install model match the TypeScript source-shim precedent used by `brmem`, `handoff`, `areg`, and `pr-address`.
  - Evidence: `just install-objective` installs a TypeScript source shim for `ts/packages/objective/src/cli.ts`, removes the stale project `.venv/bin/objective`, `command -v objective` resolves to the shim, and `objective --runtime` reports `runtime: typescript`.
  - Root install/build/docs references now treat Objective as a TypeScript-shimmed standalone CLI rather than an editable Python package or `asdl objective` plugin.
- [x] Record rollback/reference evidence and delete the Python Objective package path.
  - Evidence: pre-deletion reference point is commit `1b1bb1fa44ad`; deleted path is `packages/asdl-objectives/`; removed root workspace/source/dev/plugin/test/build/Ruff/ty/pytest references from `pyproject.toml`, `justfile`, `tests/scenario/test_plugins.py`, and `uv.lock`.
  - Restoration route: `git checkout 1b1bb1fa44ad -- packages/asdl-objectives pyproject.toml justfile tests/scenario/test_plugins.py uv.lock` restores the Python package and removed manifest/test/build references if rollback is needed.
  - Stale-reference check finds no active `asdl-objectives`, `asdl_objectives`, `asdl objective`, or `packages/asdl-objectives` references outside `CONTEXT-MAP.md` domain-language drift, which should be handled deliberately in a context/documentation session rather than silently edited here.
- [x] Feed reusable lessons, debt, and final status back into the umbrella Objective, then close this Objective when the closure gate is clear.
  - Evidence: umbrella migration ledger now records `objective` as TS-default, `porting-playbook.md` records Objective cutover lessons, `migration-debt.md` tracks the retained Objective-local `legacyMachine` projection, and umbrella Semantic Update `updates/2026-06-17T045528Z-objective-cutover-playbook-lessons.md` records the reusable lesson.
  - Closure: all active non-parked work is complete, final Semantic Update `updates/2026-06-17T045528Z-final-cutover-and-python-deletion.md` records parity/plugin/caller/install/deletion/validation evidence, `objective.md` contains `## Closure`, and `closed.md` is present.

## Parked

- Objective product redesign beyond preserving current semantics.
- Browser-compatible Objective execution for local git/filesystem-backed workflows.
- Shared foundation extraction before repeated Objective-port seams prove it.
- Creating package context documentation unless explicitly selected as part of this port or a focused context session.
