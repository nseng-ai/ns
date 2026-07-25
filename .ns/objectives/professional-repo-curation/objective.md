---
edges:
  - objective: rename-capability-to-extension
    annotation: Primary Subobjective that settled and implemented extension vocabulary, package/tier naming, and the extension-package move into the incubation zone; its remaining prose sweep must close before final presentation.
  - objective: foundation-readme-driven-pass
    annotation: Parallel Subobjective umbrella owning the per-package README-driven pass over Clinkr, Foundation, Brmem, SDK, and Extension Kit.
---

# Professional Repo: Curation, First Ships, and Transfer

*Slug migration 2026-07-25: this record was `incubator-curation-and-transfer`; the directory was renamed at the user's explicit request. History and immutable updates remain under this slug.*

## Thesis

Prepare repository for transfer to target organization with three durable outcomes: professional progressive-disclosure presentation, checkout-free installation and use of ns, and unmistakable boundary between packages currently warranted and packages still incubating.

Two major foundations landed. ADR 0044 renamed extension tiers and moved all 11 ns extensions directly into path-derived `ts/packages/incubator/` zone while keeping Extension Kit in clean zone. Separately, coordinated npm release `0.1.3` proved colleague can install bare `@nseng-ai/ns`, acquire `@nseng-ai/objectives`, provision its Objective skills, and run `ns objective list` from foreign repository without this checkout. Remaining work: finish semantic rename, calibrate package contracts, complete zone layout and dependency invariant, ship public presentation and PR Feedback quickstart, harden transfer boundaries, and transfer repository.

This remains umbrella of umbrellas. Child Objectives own bounded slices; this record owns ordering, synthesis, and final transfer. Foundation README pass may proceed in parallel. While Objective is open, agents must preserve incubation boundary and avoid polishing incubator residents outside explicit graduation or ship slice.

## Scope

- Complete and close `rename-capability-to-extension`: CONTEXT and machine-readable cutovers landed; child now owns remaining semantic prose sweep and final handoff.
- Advance `foundation-readme-driven-pass`: create package-level Readme-Driven-Development children for Clinkr, Foundation, Brmem, SDK, and Extension Kit, then synthesize calibrated honest-and-explainable graduation gate.
- Complete two-zone layout. 11 extension packages already live under `ts/packages/incubator/`; decide and execute placement for both hosts and rough tool/internal packages, and add `ts/packages/incubator/README.md` with curation and isolation contract.
- Enforce zone invariant: no package outside `incubator/` may depend on package inside it. Path-derived tier-projection exemption in ADR 0044 is not this dependency rule. Current host and package dependencies show stronger invariant not yet satisfied.
- Treat checkout-free Objectives ship as landed evidence, not future work. Decide whether current Objective extension's dependencies on incubating Branch Context and Flow satisfy intended “single-player” product boundary or require narrower follow-up before presentation.
- Ship progressive-disclosure presentation: root `README.md`, linked `why-ns.md`, supported surface, curation process, and adoption ladder. Reconcile working positioning reference to extension terminology.
- Ship checkout-free PR Feedback quickstart as second product slice and leading root-README quickstart candidate. Current package README still describes checkout-bound, unpublished use; install path remains unverified.
- Complete pre-transfer secrets/privacy review, operational decoupling, and target-organization policy negotiation. Then transfer repository with history and retain personal fork.
- Preserve product and scope names: `ns`, `@nseng-ai/*`, and repository name remain unchanged.

## Non-Goals

- Emptying incubator before transfer. Unsponsored packages may remain when explicitly dispositioned.
- Reconstructing or copying packages into another repository. This repository and history transfer in place.
- Unconstrained redesign during package graduation. Gate is honest-and-explainable; refactoring discussed and approved before implementation.
- Polishing incubator packages outside explicit graduation, first-ship, or quickstart slice.
- Treating demand-driven graduation tail—hosts, remaining daily drivers, Flow, Herdr, and Pi integration—as completion work unless sponsor or transfer requirement activates it.
- `docs-site/` content work while launch gate remains in force.

## Completion Criteria

- **Presentation:** root README and `why-ns.md` provide progressive disclosure, supported-surface story, curation model, and adoption ladder; checkout-free PR Feedback quickstart verified.
- **Installability:** checkout-free Objectives evidence remains valid for presented release, and any product-boundary concern about its Branch Context/Flow dependencies resolved or explicitly accepted. Second PR Feedback ship installable and usable outside this checkout.
- **Curation:** Extension Kit and 11 extensions use settled terminology; incubator contains every package intentionally classified as unwarranted for clean zone; its README states contract; no clean-zone package depends on incubator resident; foundation packages carry verified cold-audience README contracts.
- **Transfer:** full-history privacy/secrets review, operational decoupling, and organization-policy negotiation complete before repository transfer; CI green in target organization and personal fork remains available.
- **Synthesis:** child outcomes synthesized here, each remaining incubator resident explicitly dispositioned, and no material open row remains.

## Assumptions and Risks

Assumptions:

- Target organization will accept visible incubator when boundary and graduation process are explicit and mechanically enforced.
- ADR 0044 extension move is first half of two-zone reorganization. Hosts and rough tools/internal packages still require explicit placement verdict.
- Published Objectives `0.1.3` smoke is durable historical evidence of checkout-free acquisition, but presentation against later version may require re-verification.
- Root README positioning remains directionally settled though terminology and quickstart evidence need refresh.

Risks:

- **Irreversible history exposure.** Secrets or private data in history transfer with repository. Scan and remediate before transfer.
- **Incomplete isolation.** ADR 0044 exempts incubator paths from tier-directory projection but does not prohibit clean-to-incubator dependencies. Hosts still depend on incubator packages, and Objectives still depends on Branch Context and Flow.
- **Presentation ahead of evidence.** Root `README.md` remains one-line placeholder, `why-ns.md` absent, and PR Feedback's package README describes checkout-bound use. Do not publish stronger claims first.
- **Rename drift.** Code and CONTEXT moved to extension terminology while live docs and skills still contain old ns-domain wording.
- **Perfectionism at graduation gate.** Keep package children bounded to explicit contracts and approved reconciliation.
- **Organization policy friction.** Branch protection, review requirements, CI, Graphite configuration, authentication, and deployment ownership may conflict with current workflow. Negotiate before transfer.

## Open Questions

- Which hosts, standalone tools, and internal tools belong in incubator versus declared clean dev/tool zone, and what transfer-facing warrant supports each exception?
- Does shipped Objectives extension's dependency on incubating Branch Context and Flow satisfy intended single-player boundary, or must those edges be cut or accepted explicitly before root presentation?
- What checkout-free PR Feedback install path and command sequence will power root README quickstart?
- Which target-organization branch, review, CI, authentication, and deployment policies will apply?
