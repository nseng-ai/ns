# Roadmap

## Work

- [ ] Foundation README-driven development pass, in place, bottoms-up in dependency order: `infra/clinkr` → `infra/foundation` → `infra/brmem` → `sdk` → `capability-kit`. Per package: write the cold-audience README first as the contract, audit the real surface against it, turn every mismatch into an explicit work item (rename/split/deprecate/delete), and change the code to honor the README — amending the README instead only as a deliberate decision. These packages never move; this row calibrates the graduation gate before anything else uses it. Start with `clinkr` (smallest, zero internal deps) as the dry-run.
- [ ] The demotion commit: create `ts/packages/incubator/` (flat), `git mv` all 14 capabilities, both hosts, and the rough tools/internal packages (areg, vibechk, pi-editor-mods, pi-tools, ns-pi-subagents) into it; fix the path-literal blast radius (`.pi/extensions/*`, `.pi/settings.json`, justfiles, docs); land `incubator/README.md` stating the isolation contract. Evidence: `just` green after the move.
- [ ] Wire the zone invariant into the tier machinery / `packagechk`: no package outside `incubator/` may depend on a package inside it; CI-enforced.
- [ ] Root README reframing for org readers: supported surface (the clean tiers), the curation process and graduation gate, and an adoption ladder ordered by likely consumer interest.
- [ ] Pre-transfer hardening — secrets and privacy: full-history scan and scrub (deployment IDs, tokens-adjacent config, personal paths). Hard-ordered before the transfer row; history transfers with the repo.
- [ ] Pre-transfer hardening — operational decoupling and org policy: re-point or isolate the Vercel project/deployables coupling (sequence against cloud-execution's in-flight state), CI, `gh` auth, Graphite org config; negotiate branch-protection/review policy that preserves the stacked-PR velocity. Keep a personal fork as escape hatch.
- [ ] Repository transfer to the target organization. Evidence: CI green in the new org; remotes redirected; fork retained.
- [ ] Hosts graduation wave: hosts/pi, hosts/ns plus their capability dependencies — pr-feedback, ns-init, harness-artifacts, branch-context (→ plans). Owns resolving the host→capability coupling verdict (cut vs. graduate-together). Likely Subobjective; spawn a child record when scoped.
- [ ] Daily-driver graduations, dependency order: slots; handoffs; objectives; reviews (sequence against reviews-via-pi-gateway — land or deliberately graduate mid-stream). Routine rows unless a seam verdict says otherwise.
- [ ] Flow graduation: 28.7k src lines, the largest package; sequence against the in-flight flow-* objectives (flow-slots-opt-in, flow-fold-stack-skills-into-workflows, flow-pi-tier-stack-view-promotion, flow-value-led-readme-restructure). Likely Subobjective; spawn a child record when scoped.
- [ ] Herdr graduation for the internal stakeholders: land or sequence against retire-cmux-herdr-handoff-namespace first so stakeholders never see the mid-reshape surface. Includes the stakeholder-facing install story for the Herdr integration.
- [ ] Pi extension experience batch: pi-tools, ns-pi-subagents, areg graduations plus a pi-partner quickstart/install path that does not assume the consumer sits inside this checkout.

## Parked

- cmux — being retired by retire-cmux-herdr-handoff-namespace; expected disposition is deletion, not graduation.
- vercel — cloud-execution steel thread in flight and Vercel-account coupling unresolved; revisit after ops decoupling and steel-thread closure.
- retros, vibechk, pi-editor-mods — graduate only if a sponsor writes the README; otherwise dispositioned at closure as permanent residents or deleted.
