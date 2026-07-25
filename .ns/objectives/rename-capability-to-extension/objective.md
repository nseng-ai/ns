---
edges:
  - objective: professional-repo-curation
    annotation: Parent umbrella; this Subobjective settled and implemented the capability-to-extension cutover that the umbrella uses for its incubation-zone reorganization.
---

# Rename Capability to Extension

## Thesis

Replace **capability** with **ns extension** as canonical ns domain term while distinguishing ns extensions from Pi extensions. Vocabulary verdict, CONTEXT layer, package identity, tier schema, code symbols, and direct move of all extension packages into path-derived incubation zone landed. Remaining work: semantic prose sweep across live READMEs, conventions, skills, and parent presentation material, then verified handoff of landed code plan to parent umbrella.

## Scope

- Preserve settled vocabulary: **ns extension** covers both technical package and feature area; use bare **extension** only when unambiguous, otherwise qualify **ns extension** versus **Pi extension**.
- Preserve **extension package API** for particular extension's curated public in-process `/api` surface, distinct from `@nseng-ai/sdk` author API and Pi's runtime `ExtensionAPI`.
- Finish semantic prose sweep in live READMEs, conventions, skills, and active Objective material. Historical ADRs, immutable Semantic Updates, dated research/wayfinding, quotations, external names, and generic ability/support meanings remain unchanged.
- Reconcile `professional-repo-curation/references/root-readme-positioning.md` to settled taxonomy: Objectives, Handoffs, Flow, and PR Feedback are **the core**; Slots, Reviews, Plans, and Branch Context are **extensions**.
- Record landed machine-readable cutover as parent handoff: `@nseng-ai/extension-kit`, `extension`/`extension-kit` tiers, path-derived `ts/packages/incubator/<name>` membership, and 11-extension move with no intermediate `extensions/` directory.

## Non-Goals

- Renaming `ns`, `@nseng-ai/*` scope, or repository.
- Rewriting immutable Semantic Updates, historical ADRs, closed Objective records, dated migration records, or generic uses of “capability” meaning ability/support.
- Reopening settled README positioning beyond terminology reconciliation.
- Adding compatibility aliases for retired package identity, tier values, paths, or code symbols.
- Implementing parent umbrella's remaining host/tool demotions, clean-to-incubator dependency invariant, README launch work, or transfer work.

## Completion Criteria

- Root and nested CONTEXT records carry extension vocabulary and disambiguation contract.
- Machine-readable cutover complete: kit is `@nseng-ai/extension-kit`, canonical tiers are `extension` and `extension-kit`, 11 ns extensions live directly under `ts/packages/incubator/`, old tracked capability paths and package identity absent, and architecture enforcement reflects ADR 0044.
- Root README positioning reference uses **the core** and **extensions** without live ns-domain residue contradicting verdict.
- No live domain-vocabulary use of “capability” remains in scoped READMEs, docs, or skills. Deliberately historical, external, and generic meanings classified and retained.
- Semantic Update gives parent final code-cutover and remaining-reorganization facts.

## Assumptions and Risks

Assumptions:

- Accepted qualification rule—bare **extension** only where unambiguous, otherwise **ns extension** or **Pi extension**—is sufficient in real prose.
- ADR 0044's path-derived incubation model is settled machine-readable implementation. No intermediate `extensions/` directory required while every extension remains incubating.

Risks:

- **Semantic overreach.** Zero-match replacement would corrupt generic capability language, historical records, fixtures, and external names. Classify mixed uses by meaning.
- **Documentation drift.** Code cutover moved 11 packages and renamed kit, while multiple live docs and skills still use old domain wording or paths. Finish from verified live set, not historical inventory alone.
- **Parent tracking drift.** Parent still describes demotion and first Objectives ship as future work though extension cutover and checkout-free Objectives `0.1.3` release landed. Parent refresh must consume facts independently.
- **Taxonomy ambiguity.** README prose still mixes “core capabilities,” “extensions,” and generic capability language. Reconcile terminology without changing settled product positioning.

## Open Questions

- Which remaining mixed live occurrences are genuine ns-domain residue versus generic ability/support language? Resolve by semantic classification, not repository-wide substring elimination.
