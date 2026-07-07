# Semantic Update: residual skillx sweep completed

## Summary

Roadmap row 4 (residual `skillx` reference sweep) is done within the inventory item B dispositions:

- `skills/python-fake-driven-test-layout/SKILL.md` now uses neutral `test_catalog.py` / `catalog.py` examples instead of the deleted `skillx` module name.
- `ts/packages/internal/pi-tools/test/backing-skill-commands/backing-skill-commands.test.ts` keeps behavior-neutral negative registry assertions, but uses a clearly fictional `unregistered-skill-name` rather than the retired `skillx` name.
- `ts/packages/tools/areg/test/scenario/cli-shape.test.ts` keeps its top-level help negative assertion with a fictional `unregistered-subcommand` string rather than the retired `skillx` command family.
- `docs/retros/cli-surface-conformance-audit.md` was preserved unchanged. Its existing top banner already marks the file as a historical evidence map with point-in-time anchors; adding another note for the now-deleted `areg exec skillx` rows would be redundant rather than clarifying.

Search evidence: `rg -n "skillx" skills ts/packages docs --glob '!docs/retros/cli-surface-conformance-audit.md' --glob '!**/node_modules/**'` returns no matches. Remaining non-objective matches are deliberately preserved historical records in `docs/retros/cli-surface-conformance-audit.md`.

Validation:

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/internal/pi-tools/test/backing-skill-commands/backing-skill-commands.test.ts packages/tools/areg/test/scenario/cli-shape.test.ts` — 2 files / 21 tests passed.
- `pnpm --dir ts run check` — passed (`tsgo -p tsconfig.json`).
- `dprint check skills/python-fake-driven-test-layout/SKILL.md .ns/objectives/harness-artifact-vocabulary-reconciliation/roadmap.md` — passed.

## Objective Impact

- Roadmap row 4 is complete: active docs/tests no longer carry the dead `skillx` name; only deliberately preserved historical audit provenance remains.
- No provisioning behavior changed and no machine-facing identifiers changed.

## Follow-Ups

- Next roadmap row in order: bounded `CONTEXT.md` / `CONTEXT-MAP.md` vocabulary alignment for harness-artifact terms and Avoid entries.
