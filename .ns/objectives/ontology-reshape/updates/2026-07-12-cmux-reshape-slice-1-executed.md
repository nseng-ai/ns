# Cmux reshape execution slice 1 landed: flow facade trimmed

## Summary

The dedicated execution session for the "Execute the cmux reshape spec" task row
began and completed slice 1 of 6, `cmux-reshape/trim-flow-facade` (spec item 1:
trim the flow-facade residue inside `capabilities/ccc`).

Evidence: single commit `206832e28` on branch `cmux-reshape/trim-flow-facade`
(Graphite parent `rename-ccc-to-cmux-capability`, the stack base), 13 files /
2,059 deletions — the `./land`, `./trunk-pull`, `./autoslot` export subpaths and
their modules (`src/ns/land.ts`, `src/ns/trunk-pull.ts`, `src/ns/autoslot.ts`,
`src/ns/autoslot-presentation.ts`), all five facade tests (including the
sweep-recovered `trunk-pull.test.ts`), the `@nseng-ai/flow` dependency line, and
the `CONTEXT.md`/`AGENTS.md` prose that referenced the deleted modules. A
package-wide reference grep confirms the item's verify condition: no
`@nseng-ai/flow`, `trunk-pull`, or `autoslot` references remain under
`ts/packages/capabilities/ccc/`. Local-only, pending review.

## Objective Impact

- The "Execute the cmux reshape spec" row stays in-progress with execution now
  underway: slice 1/6 committed; slices 2–6 remain (`rename-package` →
  `rehome-bin-as-extension` → `rename-surfaces-and-skills` → `ripple-renames` →
  `glossary-and-docs` per the ratified `cmux-reshape-execution-stack` plan).
- First live confirmation of a sweep correction paying off in execution: the
  sweep-recovered `trunk-pull.test.ts` was deleted with the slice rather than
  discovered mid-flight.

## Follow-Ups

- Continue the execution session with slice 2 (`rename-package`, spec item 2)
  from the attached branch-context plan; update this row as slices land.
