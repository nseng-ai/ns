# Rebaselined onto the cmux reshape and two counterpart closures

## Summary

Verified rebaseline against trunk HEAD. Three landed events made the record
stale:

1. **CCC→cmux reshape executed (ADR 0034,
   `docs/adr/0034-rename-ccc-to-cmux-capability.md`).** `@nseng-ai/ccc` no
   longer exists; the package is `@nseng-ai/cmux` at
   `ts/packages/capabilities/cmux/`, with the dispatch cores intact under
   `src/core/` (`dispatch-from-trunk.ts`, `dispatch-prompt.ts`,
   `slot-dispatch-plan.ts` — verified via `git ls-files`). Pi surfaces renamed
   from `/ccc:workspace:dispatch-*` to `/ns:cmux:workspace:dispatch-plan`,
   `dispatch-prompt`, `dispatch-from-trunk`, plus `/ns:cmux:surface:dispatch-plan`
   (verified in `src/core/command-surfaces.ts`). CCC is retired
   anti-vocabulary. The reshape also deleted the standalone `ccc` bin and
   re-homed its one command as `ns cmux exec workspace-summary` via a typed
   `./ns-extension` descriptor (`src/ns/extension.ts`, `defineExtension` from
   `@nseng-ai/kernel/sdk`) — which resolves this record's "ccc bin
   repair-or-retire" open question externally; removed it.
2. **`extension-descriptor-contract` closed 2026-07-11 as completed**: the
   typed `exports["./ns-extension"]` descriptor is the sole declaration
   source and legacy shims/manifests are gone. Removed the "substrate still
   settling" risk; the substrate assumption is now stated as settled fact.
   The previously floated candidate Objective Edge to that record is moot
   (counterpart closed); not recorded.
3. **`cross-harness-parity` closed 2026-07-11 as intentionally concluded, not
   completed**: contrary to this record's prediction, the CLI-first doctrine
   did **not** graduate into a convention doc (no such doc exists under
   `docs/conventions/`; `rg 'CLI-first' docs/conventions/` is empty), and the
   parity doctrine's successor home is the future end-to-end docs effort.
   Reworded the non-goal and the parity risk accordingly: the mitigation is
   now this objective's own parity-metadata/skill completion criteria plus
   the surviving distributed gate (`definePiSurfaceParity` + fake-host parity
   tests, live in flow/objectives/hosts-pi). Noted that the current cmux Pi
   dispatch surfaces carry no parity metadata.

Independently re-verified and left intact: no `ns dispatch` command exists
anywhere in `ts/packages` — the Objective remains unstarted; the cmux ns
extension exposes only the hidden `workspace-summary` exec command;
`registerCliCommandExtension` remains the live Pi mirror mechanism (flow);
all referenced docs exist (`docs/wayfinding/ns-cloud-capabilities/`
eve-capability-map.md / ideas.md / map.md; the three `docs/conventions/*`
paths; `docs/wayfinding/ontology-reshape/cmux-reshape-spec.md`). The AI-SDK
harness / Eve claims remain explicitly dated source assumptions.

## Objective Impact

Thesis, scope, non-goals, risks, open questions, and roadmap rows now name
the surviving cmux substrate instead of retired CCC vocabulary, and no longer
depend on two closed Objectives' predicted futures. Completion criteria are
unchanged in substance. Objective stays open and unstarted; no completion
criterion is met.

## Follow-Ups

- The dispatch design slice should decide whether `--target cmux` wraps the
  cores directly or goes through the `capability-kit/cmux` neutral substrate
  retained by the reshape.
- Watch the end-to-end docs effort (successor home for the parity doctrine)
  for any doctrine this objective must comply with when it materializes.

Provenance: objective-refresh basis target=c1cb8d5d3 from=trunk-HEAD
