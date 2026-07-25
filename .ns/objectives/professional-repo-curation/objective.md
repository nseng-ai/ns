---
edges:
  - objective: rename-capability-to-extension
    annotation: First Subobjective of this umbrella; its vocabulary verdict must settle before this umbrella's demotion commit so directories and names move once.
  - objective: foundation-readme-driven-pass
    annotation: Subobjective umbrella owning the per-package README-driven pass over the foundation packages; runs in parallel with the rename until the pass reaches extension-adjacent packages.
---

# Professional Repo: Curation, First Ships, and Transfer

*Slug migration 2026-07-25: this record was `incubator-curation-and-transfer`; the directory was renamed at the user's explicit request when the objective was restructured into an umbrella-of-umbrellas. History and updates carry over intact.*

## Thesis

By the end of this Objective the repo delivers three outcomes, then transfers to the target organization: **(a)** the repo is presented professionally with progressive disclosure — a cold visitor is never overwhelmed; **(b)** ns is seamlessly installable and usable outside this checkout — the single-player objective system is the first team-facing ship, with a pr-feedback quickstart as the second; **(c)** the code is organized so it is unmistakable what we stand behind versus what is incubating — because people will judge us on our architecture, documentation, and code quality.

The mechanism is unchanged from this record's original thesis: transfer the existing repository — history intact — and curate it in place under an explicit two-zone model. The clean zone is the existing tier structure (`ts/packages/{infra,sdk,capability-kit}` plus enforcement tooling such as `packagechk`); everything rough or prototype-ready — all 14 capabilities, both hosts, and the rough tools/internal packages — is demoted into a flat `ts/packages/incubator/`. Packages graduate one at a time through a README-driven gate: a cold-audience README draft is developed as the package's provisional contract, the implementation is audited and reconciled against the settled contract, approved accidental complexity is removed, and the package moves into its tier directory. The folder structure itself communicates warrant status; the incubator README converts perceived slop into a declared, enforceable curation process.

This is an umbrella of umbrellas: Subobjectives own the major slices and may themselves be umbrellas (the foundation README-driven pass spawns per-package Readme-Driven-Development children). To keep focus, the umbrella runs **one primary Subobjective at a time**, with the foundation pass as the sanctioned parallel track — it proceeds independently through the infra packages until it reaches extension-adjacent packages, where it sequences behind the rename verdict. The umbrella owns ordering and synthesis, never package-level mismatch backlogs. It is also orienting: every agent working in this repo must respect the zone invariant while this Objective is open.

## Scope

- **Vocabulary rename (Subobjective: `rename-capability-to-extension`, in flight — first).** Rename the domain term "capability" to "extension" across vocabulary, docs, CONTEXT files, and eventually tier/package naming, with an explicit disambiguation contract preventing confusion between *pi extensions* (`.pi/extensions/*`) and *ns extensions*. Owns reconciling the settled README taxonomy in `references/root-readme-positioning.md`, whose "core capabilities" vs "extensions" axes collide with the new vocabulary. Sequenced before the demotion commit so paths and names move once.
- **Foundation README-driven pass (Subobjective: `foundation-readme-driven-pass`, in flight — parallel track).** An umbrella child that spawns per-package Readme-Driven-Development Subobjectives bottoms-up in dependency order (`infra/clinkr` → `infra/foundation` → `infra/brmem` → `sdk` → `capability-kit`); these packages never move. The full gate/process definition lives in the child record; this pass calibrates the graduation gate before anything else uses it.
- The one mechanical demotion commit (parent-executed or spawned when its turn comes, after the rename verdict): create `ts/packages/incubator/`, `git mv` the capabilities, hosts, and rough tools/internal packages into it flat, fix the bounded path-literal blast radius (`.pi/extensions/*`, justfiles, docs — roughly 100 files; cross-package imports are workspace-name-based and unaffected; the pnpm workspace glob `packages/*/*` already matches), and land `incubator/README.md` with the isolation contract.
- Mechanical enforcement of the zone invariant (no package outside `incubator/` depends on a package inside it) via the existing tier machinery / `packagechk`.
- First team-facing ship: a **single-player objective system** — colleagues can install and use Objectives (create/list/next/update/close) from outside this checkout. Owns the dependency verdict: `@nseng-ai/objectives` depends on `branch-context` and `flow` (both incubator-destined) — cut the edges vs. graduate a minimal slice together. Likely Subobjective when scoped.
- Repo presentation with progressive disclosure: root README reframing for org readers — supported surface, curation process, adoption ladder — plus the linked `why-ns.md` manifesto. Positioning, taxonomy, and outline settled in `references/root-readme-positioning.md` (taxonomy vocabulary to be reconciled by the rename Subobjective). Second ship: a seamless pr-feedback install/quickstart (pure CLI, no pi dependency); a cold-checkout install path is unverified and gates the README row.
- Pre-transfer hardening: full-history secrets/privacy sweep (history transfers too; scrubbing after transfer is too late), operational decoupling (Vercel project/deployables coupling, CI, `gh` auth, Graphite org config), and org-policy negotiation (branch protection and review requirements vs. the current high-velocity solo Graphite workflow).
- The GitHub repository transfer itself — the umbrella's final act — with a personal fork kept as an escape hatch.
- Names survive as-is: `ns`, the `@nseng-ai/*` scopes, and the repo name carry over unchanged (decided at creation; the capability→extension rename is domain vocabulary, not a repo/product rename).

## Non-Goals

- The post-transfer graduation tail (hosts wave, remaining daily drivers, flow, herdr, pi-extension batch) is **demand-driven, not a completion criterion** (restructure decision, 2026-07-25): rows are parked and spawn Subobjectives only when a sponsor or consumer appears. The original ladder sequencing notes are preserved in `## Parked`.
- No from-scratch reconstruction and no cross-repo package copies; there is exactly one copy of every package at all times, in this repo.
- No cross-repo dependencies at any point.
- Graduation is not unconstrained redesign: the gate is "honest and explainable" (README contract, reconciled interface, approved complexity reduction, green tests, no incubator imports), never "ideal". Contract-supporting refactoring is in scope only after discussion and approval.
- No polish of incubator packages outside a graduation slice.
- No requirement that the incubator empty out: it is allowed to be a permanent home for unsponsored packages.
- `docs-site/` content work stays out of scope (its deploys are gated repo-wide).

## Completion Criteria

- **Presentation:** the root README + `why-ns.md` ship per the settled positioning, with progressive disclosure — a cold visitor sees the supported surface, the curation process, and an adoption ladder without being overwhelmed.
- **Installability:** a colleague can install and use the single-player objective system from outside this checkout, and the pr-feedback quickstart works from a cold checkout-free install.
- **Curation:** the two-zone layout exists, the incubator README states the isolation contract, the no-clean→incubator dependency invariant is mechanically enforced and green, the capability→extension rename has landed with its disambiguation contract, and the foundation packages carry cold-audience README contracts in place as the clean zone.
- **Transfer:** the repository has been transferred to the target organization with history, CI green there, and the hardening rows (secrets sweep, ops decoupling, policy negotiation) completed before the transfer.
- **Synthesis:** this umbrella closes only after its Subobjectives are closed or explicitly parked and their outcomes are synthesized here, and every remaining incubator resident is explicitly dispositioned in closure prose — parked-in-place or deleted — with the incubator continuing as an ordinary standing fact of the repo.

## Assumptions and Risks

Assumptions:

- Graduation order is forced bottom-up by the dependency rule (clean depends only on clean); since foundations are polished in place pre-transfer, the ladder starts unblocked. Disproven if a foundation package turns out to need an incubator dependency.
- The demotion commit is bounded and mechanical: workspace-name imports are unaffected, the pnpm glob already matches, and the ~100 path-literal files are the whole blast radius. Disproven by hidden path coupling discovered during the move.
- The target org will tolerate a visible incubator when it is framed as a declared curation process with an enforced invariant. Disproven by stakeholder reaction; the mitigation is the root/incubator README framing and a non-empty clean zone on arrival.
- The capability→extension rename is mostly vocabulary/docs work whose code blast radius (tier names, `capability-kit`) can be sequenced with the demotion commit. Disproven if the term is load-bearing in machine-readable surfaces (package names, config keys) beyond the expected set.
- ~~The Herdr integration and the pi extension experience are the primary adoption wedges.~~ **Revised (2026-07-25):** the first adoption wedge is the single-player objective system for team members; pr-feedback is the quickstart; herdr and the pi extension experience are demand-driven.

Risks:

- **Irreversible history exposure.** Anything sensitive in full git history becomes the org's the moment the transfer happens. The secrets/privacy sweep must complete before transfer; this is the one hard-ordering row.
- **Org policy friction.** Branch protections and review requirements at the target org could break the current ~1,100-commits/month solo Graphite workflow. Negotiate before transfer.
- **Perfectionism stall at the gate.** README-driven curation invites redesign. The Subobjective boundary, explicit mismatch dispositions, and user approval gate for every refactoring are the mitigation.
- **Rename/demotion churn.** Doing the capability→extension rename and the demotion commit in the wrong order moves paths twice and doubles the blast radius. Mitigation: the rename's vocabulary verdict is hard-ordered before the demotion commit.
- **In-flight objective collisions.** reviews-via-pi-gateway, retire-cmux-herdr-handoff-namespace, cloud-execution, and the four flow-* objectives all reshape packages on or near the parked ladder. Each affected graduation row must sequence against its in-flight objective when spawned; sequencing lives in roadmap row notes.
- **Host→capability coupling.** hosts/pi imports pr-feedback and hosts/ns imports branch-context, harness-artifacts, and ns-init. Hosts start in the incubator, so the invariant holds day one; the coupling gets resolved in a hosts graduation wave if and when it is sponsored.

## Open Questions

- Do `internal/ns-dev` and `internal/typescript-style-guard` stay under `internal/` as declared dev-only clean packages, or demote into the incubator with the rest?
- Which target-org policies (branch protection, required reviews, CI runners) will actually apply, and what accommodation preserves the Graphite stack workflow?
- Should the demotion commit / two-zone reorg be spawned as its own Subobjective or executed directly from this umbrella when its turn comes after the rename verdict?
