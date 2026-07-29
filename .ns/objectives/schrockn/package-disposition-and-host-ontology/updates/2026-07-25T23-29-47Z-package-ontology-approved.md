# Package Ontology and Destination Map Approved

## Summary

The user explicitly approved ADR 0045 and the complete TypeScript package destination map.
The accepted design replaces the interim flat incubator with `public`, `incubating`, and
`internal` disposition roots, owner-specific nesting, global leaf/package identity rules,
and disposition dependency closure.

The approved 34-package target keeps all ns extensions and extracted `pi-ns-*` adapters
incubating for the initial organizational cutover, makes `@nseng-ai/pi-runtime`
incubating, folds `@nseng-ai/ns-init` into public `@nseng-ai/ns`, makes Pi Editor Mods an
internal package, and retains `@internal/pi-tools` as one private container package. SDK and
Extension Kit are direct leaves under `public/` without redundant category nesting.

## Objective Impact

The ADR and destination-map design and approval gate are complete. ADR 0045 and
`references/package-destination-map.md` are now authoritative. The first roadmap item
remains in progress only for the cross-Objective reconciliation: applying the approved
replacement direction to `professional-repo-curation` requires that Objective's own
tracking workflow. Approval did not authorize package moves, package identity cutovers,
npm publication, registry writes, or PR submission.

The accepted disposition closure surfaces one implementation gate: public
`@nseng-ai/ns` must remove or fold its runtime source dependencies on incubating Branch
Context and Harness Artifacts. The parent `professional-repo-curation` record and
orientation also require reconciliation from the obsolete two-zone direction before the
cutover begins.

## Follow-Ups

- Design the atomic Graphite implementation stack from the approved map.
- Specify the ns product boundary repair for incubating extension dependencies.
- Reconcile `professional-repo-curation` with ADR 0045's approved direction.
- During the cutover, preserve `@internal/pi-tools` as one package and carry its README's
  near-term subfolder reorganization follow-up without silently splitting it.
