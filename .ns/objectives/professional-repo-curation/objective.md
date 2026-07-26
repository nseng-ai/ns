---
edges:
  - objective: rename-capability-to-extension
    annotation: Primary Subobjective that settled and implemented extension vocabulary, package/tier naming, and the extension-package move into the incubation zone; its remaining prose sweep must close before final presentation.
  - objective: foundation-readme-driven-pass
    annotation: Parallel Subobjective umbrella owning the per-package README-driven pass over Clinkr, Foundation, Brmem, SDK, and Extension Kit.
  - objective: package-disposition-and-host-ontology
    annotation: Subobjective replacing the interim flat-incubator direction with the approved public/incubating/internal disposition model, host-owned package ontologies, and atomic repository reorganization.
---

# Professional Repo: Curation, First Ships, and Transfer

*Slug migration 2026-07-25: this record was `incubator-curation-and-transfer`; the directory was renamed at the user's explicit request. History and immutable updates remain under this slug.*

## Thesis

Prepare this repository for transfer to the target organization with three durable outcomes: professional progressive-disclosure presentation, checkout-free installation and use of ns, and an unmistakable boundary between packages currently warranted and packages still incubating.

Two major foundations have landed. ADR 0044 renamed the extension tiers and moved all 11 ns extensions directly into the path-derived `ts/packages/incubator/` zone while keeping Extension Kit in the clean zone. Separately, coordinated npm release `0.1.3` proved a colleague can install bare `@nseng-ai/ns`, acquire `@nseng-ai/objectives`, provision its Objective skills, and run `ns objective list` from a foreign repository without this checkout. Approved ADR 0045 has since superseded ADR 0044's flat incubation zone: the Subobjective `package-disposition-and-host-ontology` owns the three-disposition package ontology (`public`/`incubating`/`internal`), host-owned nesting, package-identity rules, and disposition dependency closure, landing as one atomic reorganization. Remaining work must finish the semantic rename, calibrate package contracts, land that reorganization through the child, ship the public presentation and PR Feedback quickstart, harden transfer boundaries, and perform the repository transfer.

This remains an umbrella of umbrellas. Child Objectives own bounded slices; this record owns ordering, synthesis, and the final transfer. The foundation README pass may proceed in parallel. While the Objective is open, agents must preserve the release-disposition boundary and avoid polishing incubating residents outside an explicit graduation or ship slice.

## Scope

- Complete and close `rename-capability-to-extension`: the CONTEXT and machine-readable cutovers have landed; the child now owns the remaining semantic prose sweep and final handoff.
- Advance `foundation-readme-driven-pass`: create package-level Readme-Driven-Development children for Clinkr, Foundation, Brmem, SDK, and Extension Kit, then synthesize a calibrated honest-and-explainable graduation gate.
- Complete the package reorganization through Subobjective `package-disposition-and-host-ontology`. Approved ADR 0045 and its destination map replace the interim flat incubator with `public`/`incubating`/`internal` disposition roots, owner nesting (including `hosts/pi/`), global leaf/package-identity matching, and scope by disposition; the child owns the atomic cutover, the authoritative `ts/packages/README.md` contract, and the guards.
- Enforce disposition dependency closure via the child's cutover guards: public depends only on public; incubating on public or incubating; internal on anything. The known gate is public `@nseng-ai/ns`'s runtime dependencies on incubating Branch Context and Harness Artifacts, which the child must remove or fold before landing.
- Treat the checkout-free Objectives ship as landed evidence, not future work. Decide whether the current Objective extension's dependencies on incubating Branch Context and Flow satisfy the intended “single-player” product boundary or require a narrower follow-up before presentation.
- Ship progressive-disclosure presentation: root `README.md`, linked `why-ns.md`, supported surface, curation process, and adoption ladder. Reconcile the working positioning reference to extension terminology.
- Ship a checkout-free PR Feedback quickstart as the second product slice and leading root-README quickstart candidate. Its current package README still describes checkout-bound, unpublished use, so the install path remains unverified.
- Complete pre-transfer secrets/privacy review, operational decoupling, and target-organization policy negotiation, then transfer the repository with history and retain a personal fork.
- Preserve product and scope names: `ns`, `@nseng-ai/*`, and the repository name remain unchanged.

## Non-Goals

- Emptying the incubator before transfer. Unsponsored packages may remain there when explicitly dispositioned.
- Reconstructing or copying packages into another repository; this repository and its history transfer in place.
- Unconstrained redesign during package graduation. The gate is honest-and-explainable, with refactoring discussed and approved before implementation.
- Polishing incubator packages outside an explicit graduation, first-ship, or quickstart slice.
- Treating the demand-driven graduation tail—hosts, remaining daily drivers, Flow, Herdr, and Pi integration—as completion work unless a sponsor or transfer requirement activates it.
- `docs-site/` content work while its launch gate remains in force.

## Completion Criteria

- **Presentation:** the root README and `why-ns.md` provide progressive disclosure, a supported-surface story, the curation model, and an adoption ladder; the checkout-free PR Feedback quickstart is verified.
- **Installability:** checkout-free Objectives evidence remains valid for the presented release, and any product-boundary concern about its Branch Context/Flow dependencies is resolved or explicitly accepted. The second PR Feedback ship is installable and usable outside this checkout.
- **Curation:** Extension Kit and the 11 extensions use the settled terminology; the package tree carries ADR 0045's disposition ontology with every package explicitly classified by the approved destination map; `ts/packages/README.md` states the authoritative contract; disposition dependency closure is mechanically enforced; foundation packages carry verified cold-audience README contracts.
- **Transfer:** the full-history privacy/secrets review, operational decoupling, and organization-policy negotiation are complete before the repository transfers; CI is green in the target organization and a personal fork remains available.
- **Synthesis:** child outcomes are synthesized here, each remaining incubator resident is explicitly dispositioned, and no material open row remains.

## Assumptions and Risks

Assumptions:

- The target organization will accept a visible incubating zone when its boundary and promotion process are explicit and mechanically enforced.
- The ADR 0044 extension move was the first half of the package reorganization. The remaining placement verdict for hosts and rough tools/internal packages is now settled: approved ADR 0045 and the child's destination map classify all packages, superseding the earlier two-zone framing.
- The published Objectives `0.1.3` smoke is durable historical evidence of checkout-free acquisition, but presentation against a later version may require re-verification.
- Root README positioning remains directionally settled even though its terminology and quickstart evidence need refresh.

Risks:

- **Irreversible history exposure.** Secrets or private data in history transfer with the repository; scan and remediate before transfer.
- **Incomplete isolation.** The flat ADR 0044 layout never prohibited clean-to-incubator dependencies; ADR 0045's disposition dependency closure replaces that intended invariant, and its enforcement lands only with the child's cutover. Until then, public-intent code still depends on incubating packages — notably `@nseng-ai/ns` on Branch Context and Harness Artifacts, and Objectives on Branch Context and Flow.
- **Presentation ahead of evidence.** Root `README.md` is still a one-line placeholder, `why-ns.md` is absent, and PR Feedback's package README describes checkout-bound use. Do not publish stronger claims first.
- **Rename drift.** Code and CONTEXT have moved to extension terminology while live docs and skills still contain old ns-domain wording.
- **Perfectionism at the graduation gate.** Keep package children bounded to explicit contracts and approved reconciliation.
- **Organization policy friction.** Branch protection, review requirements, CI, Graphite configuration, authentication, and deployment ownership may conflict with the current workflow; negotiate before transfer.

## Open Questions

- Does the shipped Objectives extension's dependency on incubating Branch Context and Flow satisfy the intended single-player boundary, or must those edges be cut or accepted explicitly before the root presentation?
- What checkout-free PR Feedback install path and command sequence will power the root README quickstart?
- Which target-organization branch, review, CI, authentication, and deployment policies will apply?
