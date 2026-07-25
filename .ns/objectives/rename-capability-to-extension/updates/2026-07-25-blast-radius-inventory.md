# Capability-to-Extension Blast Radius Inventoried

## Summary

The live rename surface is now classified in `references/blast-radius-inventory.md` as vocabulary sweep, code plan, or deliberately kept.

The vocabulary layer spans the root and nested CONTEXT files, context routing, live READMEs and conventions, a small set of ns-domain skill guidance, and the parent README positioning reference. It must distinguish a particular extension’s curated `/api` consumer surface from the ns author SDK and Pi runtime extension APIs before prose is changed mechanically.

The code-level assumption is revised: the blast radius is discoverable and bounded, but the old term is load-bearing beyond directory names. `@nseng-ai/capability-kit` is public-package and publish-order metadata; `capability` and `capability-kit` are enforced tier schema; 11 package manifests carry the capability tier; architecture rules, imports, path literals, exported Flow metadata, tests, report tooling, local Pi adapters, and the lockfile encode the old names. No user-facing `--capabilit*` CLI flag cluster was found.

## Objective Impact

The inventory roadmap row is complete. The evidence strengthens the hard-ordering with the parent demotion commit: moving `capabilities/` to an intermediate `extensions/` directory before incubator demotion would create avoidable double-move churn. The parent should choose the final direct-to-incubator paths first, then execute the package identity, tier schema, architecture-rule, import, release-metadata, test, and lockfile cutover atomically in the demotion commit or one immediately adjacent slice.

The assumption that this is mostly vocabulary/docs work remains true for this Objective’s owned execution, but its code-blast-radius clause is disproven: the term is machine-readable in published package identity, release metadata, tier values, and exported symbols, not only in the expected kit path and incidental identifiers. This does not expand this Objective into executing the code move; it makes the handoff plan more explicit.

Historical ADRs, existing Semantic Updates, closed Objective records, dated wayfinding/research snapshots, quotations, external names, and ordinary English meanings of capability remain deliberate exceptions. Completion should therefore use semantic review rather than require a repository-wide zero-match grep.

## Follow-Ups

- Settle the replacement vocabulary for **Capability API** without conflating a particular ns extension’s curated `/api` surface, the `@nseng-ai/sdk` author API, and Pi’s runtime `ExtensionAPI`.
- Land the canonical CONTEXT and live prose sweep, preserving old machine literals until the coordinated code cutover where needed for accuracy.
- Reconcile the parent root README positioning reference to **the core** and **extensions**.
- Use the inventory’s package/tier/path clusters to write the final code-level rename and demotion sequencing plan for `professional-repo-curation`.
