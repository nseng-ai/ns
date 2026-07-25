---
edges:
  - objective: professional-repo-curation
    annotation: Parent umbrella; this Subobjective settled and implemented the capability-to-extension cutover that the umbrella uses for its incubation-zone reorganization.
---

# Rename Capability to Extension

## Thesis

Replace **capability** with **ns extension** as the canonical ns domain term while distinguishing ns extensions from Pi extensions. The vocabulary verdict, CONTEXT layer, package identity, tier schema, code symbols, and direct move of all extension packages into the path-derived incubation zone have landed. The remaining work is a semantic prose sweep across live READMEs, conventions, skills, and parent presentation material, followed by a verified handoff of the landed code plan to the parent umbrella.

## Scope

- Preserve the settled vocabulary: **ns extension** covers both the technical package and feature area; use bare **extension** only when unambiguous, otherwise qualify **ns extension** versus **Pi extension**.
- Preserve **extension package API** for a particular extension's curated public in-process `/api` surface, distinct from the `@nseng-ai/sdk` author API and Pi's runtime `ExtensionAPI`.
- Finish the semantic prose sweep in live READMEs, conventions, skills, and active Objective material. Historical ADRs, immutable Semantic Updates, dated research/wayfinding, quotations, external names, and generic ability/support meanings remain unchanged.
- Reconcile `professional-repo-curation/references/root-readme-positioning.md` to the settled taxonomy: Objectives, Handoffs, Flow, and PR Feedback are **the core**; Slots, Reviews, Plans, and Branch Context are **extensions**.
- Record the landed machine-readable cutover as the parent handoff: `@nseng-ai/extension-kit`, `extension`/`extension-kit` tiers, path-derived `ts/packages/incubator/<name>` membership, and the 11-extension move with no intermediate `extensions/` directory.

## Non-Goals

- Renaming `ns`, the `@nseng-ai/*` scope, or the repository.
- Rewriting immutable Semantic Updates, historical ADRs, closed Objective records, dated migration records, or generic uses of “capability” that mean ability/support.
- Reopening the settled README positioning beyond terminology reconciliation.
- Adding compatibility aliases for the retired package identity, tier values, paths, or code symbols.
- Implementing the parent umbrella's remaining host/tool demotions, clean-to-incubator dependency invariant, README launch work, or transfer work.

## Completion Criteria

- Root and nested CONTEXT records carry the extension vocabulary and disambiguation contract.
- The machine-readable cutover is complete: the kit is `@nseng-ai/extension-kit`, canonical tiers are `extension` and `extension-kit`, the 11 ns extensions live directly under `ts/packages/incubator/`, old tracked capability paths and package identity are absent, and architecture enforcement reflects ADR 0044.
- The root README positioning reference uses **the core** and **extensions** without live ns-domain residue that contradicts the verdict.
- No live domain-vocabulary use of “capability” remains in scoped READMEs, docs, or skills; deliberately historical, external, and generic meanings are classified and retained.
- A Semantic Update gives the parent the final code-cutover and remaining-reorganization facts.

## Assumptions and Risks

Assumptions:

- The accepted qualification rule—bare **extension** only where unambiguous, otherwise **ns extension** or **Pi extension**—is sufficient in real prose.
- ADR 0044's path-derived incubation model is the settled machine-readable implementation; no intermediate `extensions/` directory is required while every extension remains incubating.

Risks:

- **Semantic overreach.** A zero-match replacement would corrupt generic capability language, historical records, fixtures, and external names. Classify mixed uses by meaning.
- **Documentation drift.** The code cutover moved 11 packages and renamed the kit, while multiple live docs and skills still use old domain wording or paths. Finish from the verified live set, not the historical inventory alone.
- **Parent tracking drift.** The parent still describes the demotion and first Objectives ship as future work even though the extension cutover and checkout-free Objectives `0.1.3` release landed. The parent refresh must consume those facts independently.
- **Taxonomy ambiguity.** README prose still mixes “core capabilities,” “extensions,” and generic capability language. Reconcile terminology without changing the settled product positioning.

## Open Questions

- None. The final scoped pass classified the remaining mixed occurrences as generic ability/support language, code symbols/literals, or qualified model-capability prose.

## Closure

Completed by the final semantic prose cutover. Live product, architecture, Pi, and first-party skill guidance now uses **ns extension**, **Pi extension**, and **extension package API** according to the root `CONTEXT.md` contract; the parent README-positioning reference teaches **the core** and the settled presentation taxonomy without treating capability as an ns category.

The machine-readable cutover had already landed in commit `4afa42169` with ADR 0044: the clean-zone package is `@nseng-ai/extension-kit`, canonical tiers are `extension` and `extension-kit`, and all 11 first-party ns extension packages live directly under `ts/packages/incubator/`. The final Semantic Update records this parent handoff and the deliberately retained generic capability language and code symbols.

Evidence: the bounded scoped terminology search classified every remaining match; `dprint check` passed for all scoped files; `just` passed, including the TypeScript style guard, dependency check, formatting, lint, typecheck, default test suite, and repository-wide Objective edge sweep; and `ns objective check rename-capability-to-extension` passed after closure tracking. No material rename work remains. Historical records and generic ability/support wording remain intentionally unchanged.
