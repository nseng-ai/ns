# Incubator Curation and Repo Transfer

## Thesis

This repo moves to the target organization by transferring ownership of the existing repository — history intact — and then curating it in place under an explicit two-zone model, instead of reconstructing it from scratch in a new repo or wholesale-copying it without a warrant story. The clean zone is the existing tier structure (`ts/packages/{infra,sdk,capability-kit}` plus enforcement tooling such as `packagechk`); everything rough or prototype-ready — all 14 capabilities, both hosts, and the rough tools/internal packages — is demoted into a flat `ts/packages/incubator/` directory. Packages graduate out of the incubator one at a time through a README-driven gate: a cold-audience README draft is developed first as the package's provisional contract, the implementation is audited and reconciled against the settled contract, approved accidental complexity is removed, and the package moves into its tier directory. The folder structure itself communicates warrant status to repo readers: the incubator README states the isolation model (installing extensions is optional; extensions are isolated from each other; nothing outside the incubator depends on anything inside it), converting perceived slop into a declared, enforceable curation process.

This is an umbrella Objective: each package curation pass is created as a Readme-Driven-Development Subobjective with its own draft, decisions, reconciliation work, and closure evidence; heavyweight cross-package slices such as pre-transfer hardening, the hosts/capability dependency untangle, and the flow graduation may also become Subobjectives. The umbrella owns ordering and synthesis rather than package-level mismatch backlogs. It is also orienting: every agent working in this repo must respect the zone invariant while this Objective is open.

## Scope

- Pre-transfer, in place: a bottoms-up README-driven development pass over the foundation packages in dependency order (`infra/clinkr` → `infra/foundation` → `infra/brmem` → `sdk` → `capability-kit`) — these never move. Each package pass begins by creating a Readme-Driven-Development Subobjective whose provisional canonical contract is `references/README-draft.md`. The Subobjective uses an interrogative, human-steered README process; audits exports, behavior, errors, configuration, tests, examples, and caller expectations against the emerging contract; and records every mismatch in its own roadmap with an explicit disposition such as implement, rename, split, deprecate, delete, or deliberately amend the draft. It also probes for accidental implementation complexity relative to the contract. Investigation and proposals may proceed during drafting, and a proposed refactoring may be sequenced before the draft is fully settled when that would support discovery or later reconciliation, but every refactoring is discussed with the user before implementation. Public-interface and observable-behavior decisions settle through the draft rather than being decided silently by implementation work. The settled draft is promoted to the package README only after reconciliation and verification.
- The one mechanical demotion commit: create `ts/packages/incubator/`, `git mv` the capabilities, hosts, and rough tools/internal packages into it flat, fix the bounded set of path literals (`.pi/extensions/*`, justfiles, docs — roughly 100 files reference `ts/packages/...` paths; cross-package imports are workspace-name-based and unaffected; the pnpm workspace glob `packages/*/*` already matches the new layout), and land `incubator/README.md` with the isolation contract.
- Mechanical enforcement of the zone invariant (no package outside `incubator/` depends on a package inside it) via the existing tier machinery / `packagechk`.
- Root README reframing for org readers: the supported surface, the curation process, and an adoption ladder.
- Pre-transfer hardening: full-history secrets/privacy sweep (history transfers too; scrubbing after transfer is too late), operational decoupling (Vercel project/deployables coupling from the cloud-execution work, CI, `gh` auth, Graphite org config), and org-policy negotiation (branch protection and review requirements vs. the current high-velocity solo Graphite workflow).
- The GitHub repository transfer itself, with a personal fork kept as an escape hatch.
- The post-transfer graduation ladder in dependency order, including the hosts wave (hosts/pi, hosts/ns plus their capability dependencies pr-feedback, ns-init, harness-artifacts, branch-context → plans), the daily-driver capabilities (slots, handoffs, objectives, reviews, flow), the herdr graduation for the internal stakeholders who want the Herdr integration, and the pi-extension-experience batch (pi-tools, ns-pi-subagents, areg) for the pi-using design partners, together with an install/quickstart story that does not assume the consumer sits inside this checkout.
- Names survive as-is: `ns`, the `@nseng-ai/*` scopes, and the repo name carry over to the target org unchanged (decided at creation; no renaming rows).

## Non-Goals

- No from-scratch reconstruction and no cross-repo package copies; there is exactly one copy of every package at all times, in this repo.
- No cross-repo dependencies at any point.
- Graduation is not unconstrained redesign: the gate is "honest and explainable" (README contract, reconciled interface, approved complexity reduction, green tests, no incubator imports), never "ideal". Contract-supporting refactoring is in scope only after discussion and approval; unrelated feature work and redesign happen outside graduation slices.
- No polish of incubator packages outside a graduation slice.
- No requirement that the incubator empty out: it is allowed to be a permanent home for unsponsored packages.
- `docs-site/` content work stays out of scope (its deploys are gated repo-wide).

## Completion Criteria

- The two-zone layout exists, the incubator README states the isolation contract, and the no-clean→incubator dependency invariant is mechanically enforced and green.
- The foundation packages carry cold-audience README contracts and remain in place as the clean zone at transfer time.
- The repository has been transferred to the target organization with history, CI is green there, and the pre-transfer hardening rows (secrets sweep, ops decoupling, policy negotiation) completed before the transfer.
- The hosts wave and the daily-driver set (slots, handoffs, objectives, reviews, flow, plans, branch-context, pr-feedback) have graduated through the README-driven gate.
- Herdr has graduated and the internal stakeholders can install the Herdr integration from the repo; pi design partners have a working install/quickstart path for the extension experience.
- Synthesis: this umbrella closes only after its child Subobjectives (if spawned) are closed or explicitly parked and their outcomes are synthesized here, and every remaining incubator resident (expected: cmux, retros, vercel, and any package that never found a sponsor) is explicitly dispositioned in closure prose — parked-in-place or deleted — with the incubator continuing as an ordinary standing fact of the repo, its invariant owned by the enforcement tooling and the incubator README.

## Assumptions and Risks

Assumptions:

- Graduation order is forced bottom-up by the dependency rule (clean depends only on clean); since foundations are polished in place pre-transfer, the ladder starts unblocked. Disproven if a foundation package turns out to need an incubator dependency.
- The demotion commit is bounded and mechanical: workspace-name imports are unaffected, the pnpm glob already matches, and the ~100 path-literal files are the whole blast radius. Disproven by hidden path coupling (e.g., generated configs, CI matrices) discovered during the move.
- The target org will tolerate a visible incubator when it is framed as a declared curation process with an enforced invariant, rather than ambient mess. Disproven by stakeholder reaction; the mitigation is the root/incubator README framing and a non-empty clean zone on arrival.
- The Herdr integration and the pi extension experience are the primary adoption wedges; internal stakeholders want herdr and the design partners are pi users.

Risks:

- **Irreversible history exposure.** Anything sensitive in full git history becomes the org's the moment the transfer happens. The secrets/privacy sweep must complete before transfer; this is the one hard-ordering row.
- **Org policy friction.** Branch protections and review requirements at the target org could break the current ~1,100-commits/month solo Graphite workflow. Negotiate before transfer; accepting the transfer without this settled risks a velocity collapse.
- **Perfectionism stall at the gate.** README-driven curation invites redesign. The Subobjective boundary, explicit mismatch dispositions, and user approval gate for every refactoring are the mitigation; if a package slice starts growing unrelated feature work or redesign, split it out.
- **In-flight objective collisions.** reviews-via-pi-gateway (reviews), retire-cmux-herdr-handoff-namespace (herdr's surface reshape), cloud-execution (vercel's Vercel-account coupling), and the four flow-* objectives all reshape packages on or near the ladder. Each affected graduation row must sequence against its in-flight objective — land the reshape first, or accept a mid-stream graduation deliberately. No edges are declared; sequencing lives in roadmap row notes (decided at creation).
- **Host→capability coupling.** hosts/pi imports pr-feedback and hosts/ns imports branch-context, harness-artifacts, and ns-init. Hosts start in the incubator (decided at creation), so the invariant holds day one; the coupling gets resolved properly in the hosts graduation wave rather than by rushed pre-transfer surgery.

## Open Questions

- Do `internal/ns-dev` and `internal/typescript-style-guard` stay under `internal/` as declared dev-only clean packages, or demote into the incubator with the rest?
- Which target-org policies (branch protection, required reviews, CI runners) will actually apply, and what accommodation preserves the Graphite stack workflow?
- Does the pi-partner install story require `areg` and `harness-artifacts` earlier than their natural ladder position (pi-tools → areg → harness-artifacts)?
