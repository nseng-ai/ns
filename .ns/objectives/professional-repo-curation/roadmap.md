# Roadmap

## Work

- [~] Close Subobjective `rename-capability-to-extension`. Vocabulary verdict, CONTEXT layer, `@nseng-ai/extension-kit` cutover, `extension`/`extension-kit` tiers, and direct move of 11 extensions into `ts/packages/incubator/` landed. Remaining: live prose/skills sweep, parent positioning terminology, final handoff, and child closure.
- [~] Advance Subobjective `foundation-readme-driven-pass`. No package child or README draft exists yet. Start with Clinkr, then Foundation, Brmem/SDK, and Extension Kit. Synthesize gate lessons here.
- [~] Complete two-zone reorganization. ADR 0044 created flat incubation zone and moved all 11 ns extensions there. Remaining: decide and execute placement for both hosts and rough tool/internal packages, add `ts/packages/incubator/README.md`, and remove stale transition guidance.
- [ ] Enforce zone dependency invariant: no package outside `incubator/` may depend on package inside it. Do not confuse with ADR 0044's tier-directory projection exemption. Verify and resolve current clean-to-incubator edges, including `hosts/ns` dependencies on Branch Context, Harness Artifacts, and ns-init.
- [~] Reconcile first team-facing Objectives ship. Coordinated npm `0.1.3` already proved bare-core install, checkout-free Objectives acquisition, ten-skill provisioning, and `ns objective list` in foreign repository. Decide whether Objectives' current Branch Context/Flow dependencies satisfy intended single-player boundary; reverify presented release if needed.
- [ ] Finish repo presentation: replace one-line root README with settled progressive-disclosure structure and add `why-ns.md`. First reconcile `references/root-readme-positioning.md` to extension terminology and current landed product evidence.
- [ ] Ship checkout-free PR Feedback install/quickstart as second product slice and leading root-README quickstart. Current README still describes source-checkout, unpublished use. Verify registry/install/command behavior before using publicly.
- [ ] Pre-transfer privacy and secrets hardening: scan full history and remediate sensitive data before transfer.
- [ ] Pre-transfer operational decoupling and organization-policy negotiation: CI, deployment ownership, authentication, remotes, Graphite configuration, branch protection, and review requirements. Preserve personal fork as escape hatch.
- [ ] Transfer repository to target organization. Evidence: remotes redirected, CI green there, and fork retained.

## Parked

Demand-driven graduation work, activated only by sponsor or transfer requirement:

- Hosts graduation or placement follow-up after incubator dependencies resolved.
- Remaining daily-driver extensions, including Slots, Handoffs, Reviews, Plans, and Branch Context.
- Flow graduation after active reshaping settles.
- Herdr graduation after current orchestration reshaping settles.
- Pi integration/tooling graduation and checkout-free partner install story.
- Retros, Vibechk, and Pi Editor Mods: retain in incubation or delete unless sponsor establishes contract.
