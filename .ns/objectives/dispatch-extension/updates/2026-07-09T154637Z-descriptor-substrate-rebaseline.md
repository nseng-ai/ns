# Registration substrate rebaselined to the typed `./ns-extension` descriptor

## Summary

Verified rebaseline against trunk HEAD. The record's registration substrate
claim was stale: scope and one assumption pointed the new `ns dispatch`
capability at "a kernel descriptor under `.ns/extensions/`", but the
`.ns/extensions/*` shim directories no longer exist in this checkout, and the
active `extension-descriptor-contract` Objective — whose `orientation.md` binds
all agents — states extensions now declare themselves through one typed
`exports["./ns-extension"]` descriptor module and explicitly lists "adding new
`.ns/extensions` entries" on its **Avoid** list. Corrected scope and the
substrate assumption to name the `exports["./ns-extension"]` descriptor
convention (verified live in `ts/packages/capabilities/flow` and
`ts/packages/capabilities/objectives` package.json), and added a substrate
dependency risk.

Independently verified and left intact: the `@nseng-ai/ccc` cmux cores exist as
named (`dispatch-from-trunk.ts`, `dispatch-prompt.ts`, `slot-dispatch-plan.ts`
under `ts/packages/capabilities/ccc/src/cmux/`); the flow capability proves the
repo-local `ns`-command pattern and uses `registerCliCommandExtension`; all
referenced docs exist (`docs/wayfinding/ns-cloud-capabilities/` with
`eve-capability-map.md`, `ideas.md` (the "jot pad"), `map.md`; the three
`docs/conventions/*` paths); `cross-harness-parity` remains open, so the
non-goal referencing its future close stays forward-looking. No `ns dispatch`
command exists yet — the Objective remains unstarted. The AI-SDK harness /
Eve claims remain explicitly dated source assumptions and were left as
assumptions, not promoted to fact.

## Objective Impact

Scope, `## Assumptions and Risks` corrected so future implementation builds on
the surviving descriptor substrate instead of a deleted, orientation-forbidden
one. No change to thesis, completion criteria, or roadmap shape. Objective stays
open and unstarted.

## Follow-Ups

- Consider recording an Objective Edge between `dispatch-extension` and
  `extension-descriptor-contract` (a soft dependency); not added here because a
  refresh must not mutate the counterpart record's frontmatter outside a
  closure.
- Resolve the `ccc` bin repair-or-retire open question during the local-target
  slice.

Provenance: objective-refresh basis target=a814ebe365b9164fdcd31c3cf09c681be670c4f0 from=trunk-HEAD
