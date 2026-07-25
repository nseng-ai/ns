# Roadmap

## Work

- [~] Subobjective `rename-capability-to-extension` (primary, first): settle the capability→extension vocabulary verdict and pi-extension/ns-extension disambiguation contract, reconcile the README taxonomy in `references/root-readme-positioning.md`, and land the docs/CONTEXT rename; code/tier renames sequence with the demotion commit. This row closes when the child closes.
- [~] Subobjective `foundation-readme-driven-pass` (sanctioned parallel track): umbrella child spawning per-package Readme-Driven-Development Subobjectives bottoms-up (`infra/clinkr` → `infra/foundation` → `infra/brmem` → `sdk` → `capability-kit`), clinkr first as the gate dry-run. Proceeds in parallel with the rename until it reaches extension-adjacent packages (`sdk`, `capability-kit`), which sequence behind the rename verdict. This row closes when the child closes.
- [ ] The demotion commit / two-zone reorg (after the rename verdict; spawn a Subobjective or execute directly — open question): create `ts/packages/incubator/` (flat), `git mv` all 14 capabilities, both hosts, and the rough tools/internal packages (areg, vibechk, pi-editor-mods, pi-tools, ns-pi-subagents) into it; fix the path-literal blast radius (`.pi/extensions/*`, `.pi/settings.json`, justfiles, docs); land `incubator/README.md` stating the isolation contract, using post-rename vocabulary. Evidence: `just` green after the move.
- [ ] Wire the zone invariant into the tier machinery / `packagechk`: no package outside `incubator/` may depend on a package inside it; CI-enforced.
- [ ] First team-facing ship: single-player objective system — graduate `objectives` far enough that colleagues can install and use it outside this checkout. Owns the dependency verdict: `@nseng-ai/objectives` currently depends on `branch-context` and `flow` (both incubator-destined) — cut the edges or graduate a minimal slice together. Likely Subobjective when scoped; spawn only when it becomes the primary Subobjective.
- [ ] Repo presentation: root README reframing for org readers — supported surface, curation process, adoption ladder — plus the linked `why-ns.md` manifesto. Positioning, taxonomy, and outline settled in `references/root-readme-positioning.md`; taxonomy vocabulary reconciled by the rename Subobjective. Blocked on the quickstart decision: verify a cold-checkout install path exists.
- [ ] Second ship: seamless pr-feedback install/quickstart (pure CLI, no pi dependency) from a cold checkout-free install; leading root-README quickstart candidate. May fold into the repo-presentation row's quickstart work.
- [ ] Pre-transfer hardening — secrets and privacy: full-history scan and scrub (deployment IDs, tokens-adjacent config, personal paths). Hard-ordered before the transfer row; history transfers with the repo.
- [ ] Pre-transfer hardening — operational decoupling and org policy: re-point or isolate the Vercel project/deployables coupling (sequence against cloud-execution's in-flight state), CI, `gh` auth, Graphite org config; negotiate branch-protection/review policy that preserves the stacked-PR velocity. Keep a personal fork as escape hatch.
- [ ] Repository transfer to the target organization — the umbrella's final act. Evidence: CI green in the new org; remotes redirected; fork retained.

## Parked

Demand-driven graduation tail (restructure decision, 2026-07-25: no longer completion criteria; spawn a Subobjective only when a sponsor or consumer appears; original sequencing notes preserved):

- Hosts graduation wave: hosts/pi, hosts/ns plus their capability dependencies — pr-feedback, ns-init, harness-artifacts, branch-context (→ plans). Owns resolving the host→capability coupling verdict (cut vs. graduate-together).
- Remaining daily-driver graduations, dependency order: slots; handoffs; reviews (sequence against reviews-via-pi-gateway — land or deliberately graduate mid-stream). `objectives` is covered by the first-ship row.
- Flow graduation: 28.7k src lines, the largest package; sequence against the in-flight flow-* objectives (flow-slots-opt-in, flow-fold-stack-skills-into-workflows, flow-pi-tier-stack-view-promotion, flow-value-led-readme-restructure).
- Herdr graduation for the internal stakeholders: land or sequence against retire-cmux-herdr-handoff-namespace first so stakeholders never see the mid-reshape surface. Includes the stakeholder-facing install story.
- Pi extension experience batch: pi-tools, ns-pi-subagents, areg graduations plus a pi-partner quickstart/install path that does not assume the consumer sits inside this checkout.

Package residents with no graduation path:

- cmux — being retired by retire-cmux-herdr-handoff-namespace; expected disposition is deletion, not graduation.
- vercel — cloud-execution steel thread in flight and Vercel-account coupling unresolved; revisit after ops decoupling and steel-thread closure.
- retros, vibechk, pi-editor-mods — graduate only if a sponsor writes the README; otherwise dispositioned at closure as permanent residents or deleted.
