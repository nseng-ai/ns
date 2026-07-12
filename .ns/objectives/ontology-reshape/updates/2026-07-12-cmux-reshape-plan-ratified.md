# Cmux reshape execution plan ratified

## Summary

The "Execute the cmux reshape spec" task row completed its planning stages
2026-07-12; only the dedicated execution session remains.

A 7-agent read-only verification sweep (one agent per spec item) fact-checked
`docs/wayfinding/ontology-reshape/cmux-reshape-spec.md` against HEAD, matching the
layering precedent's method. Four materially stale claims were corrected in place
(spec commit on branch `rename-ccc-to-cmux-capability`):

- The re-homing target for the `ccc` bin's command is **kernel source-dev
  discovery** (`kernel/src/extensions/registry.ts`,
  `loadSourceDevPreinstalledCandidates`), which auto-registers any workspace
  package exposing a descriptor-bearing `./ns-extension` export.
  `declared-descriptors.ts` is a generic ns.toml-spec loader — the spec's original
  registration claim was wrong, and no registration edit is needed anywhere.
- `src/cmux/objective-sidebar.ts` invokes the `ccc` bin at runtime — a
  load-bearing caller the spec had missed; the bin deletion must rewire it.
- The areg `ccc-stack-map` row reads `ns:ccc:stack-map` (the spec claimed
  `ns:cmux:stack-map`), and the live surface set is thirteen (ten product
  surfaces plus three areg generic backing-skill aliases), not ten.
- The root `CONTEXT.md` "highest-fan-out consumer (13)" figure does not exist;
  the entry carries no count.

Plus blast-radius additions throughout: `test/trunk-pull.test.ts`, both skill
symlink layers, `.pi/extensions/ccc.ts`, `ts/package.json`'s workspace catalog
dep, style-guard and brmem-cli test fixtures, and
`docs/conventions/skill-conventions.md`'s `ccc-*` namespace example.

Enriched plan `cmux-reshape-execution-stack` (Local plan store, source branch
`rename-ccc-to-cmux-capability`) was then ratified by the user 2026-07-12
including both shape decisions:

- **Six slices**, spec items 4+5 merged into one surface-rename slice (the areg
  registry rows and their test couple skill names and surfaces in the same
  literals), ripple renames kept separate (breaking config changes deserve their
  own PR callout): `cmux-reshape/trim-flow-facade` → `rename-package` →
  `rehome-bin-as-extension` → `rename-surfaces-and-skills` → `ripple-renames` →
  `glossary-and-docs`.
- **Stack base**: `rename-ccc-to-cmux-capability` (carries the decision
  artifacts and the sweep-corrected spec).

## Objective Impact

- The "Execute the cmux reshape spec" roadmap row moves to in-progress: sweep and
  ratified-plan stages of the saved-plan pipeline are done, execution is not.
- The plan is attached as branch context (`branch-context` namespace, key
  `cmux-reshape-execution-stack.md`) on the first slice branch
  `cmux-reshape/trim-flow-facade`, created via Graphite off the stack base. The
  dedicated execution session picks it up there per the reshaping handoff
  vehicle; local-only until user review.
- The verification sweep re-validates the vehicle's method: every stale claim was
  caught pre-execution, none required mid-flight rework.

## Follow-Ups

- Run the dedicated execution session from `cmux-reshape/trim-flow-facade` via
  the attached plan; update this row on completion.
