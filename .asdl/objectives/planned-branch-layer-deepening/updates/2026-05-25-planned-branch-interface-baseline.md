# Planned Branch Interface Baseline Recorded

## Summary

- The current stack establishes this Objective record and captures the first planned-branch interface slice: the Pi command surface is now `/write-plan`, `/create-planned-branch`, and `/impl-planned-branch`, while the legacy `brmem-create-plan-branch-from-file` skill and prompt files are removed.
- Local plan store vocabulary is now primary in the write/select path (`planStoreRoot`, saved plan file, `resolvePlanStoreDirectory`), with archive-named exports retained only as deprecated compatibility seams.
- `/create-planned-branch` preview and success output now lead with saved-plan, planned-branch, and attached-plan concepts, while preserving Branch Memory namespace/key/ref evidence for attachment diagnostics.
- `/impl-planned-branch` still delegates to `brmem-plan-impl`; deterministic attached-plan reading remains prose-owned and untested in the planning layer.
- Evidence: Graphite parent `plan-consolidation` shows this top slice only adds the Objective record; the full local stack diff against `master` contains the planned-branch interface baseline. PR evidence was not required.

## Objective Impact

- Initial vocabulary establishment, local plan store separation, create-flow presentation, and split-out overlap disposition are now marked in progress rather than untouched.
- The Objective now has an explicit durable home separate from `pi-extension-deepening`, but that other Objective still needs a cross-reference or disposition update.
- The main next architectural risk is read/write asymmetry: write/create behavior has code and tests, while implement/read behavior still relies on skill prose.

## Follow-Ups

- Deepen or rename internal modules around planning-layer terms and isolate Branch Memory attachment behind a clearer Adapter seam.
- Implement the tested attached-plan reader before doing broader skill naming cleanup.
- Move durable planned-branch workflow docs out of `packages/brmem/README.md` and leave only a concise pointer there.
- Add an explicit cross-reference or disposition update in `pi-extension-deepening`.
- Run and record focused TypeScript and Markdown validation for the accepted implementation slice.
