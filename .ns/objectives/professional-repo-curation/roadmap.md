# Roadmap

## Work

- [~] Close Subobjective `rename-capability-to-extension`. The vocabulary verdict, CONTEXT layer, `@nseng-ai/extension-kit` cutover, `extension`/`extension-kit` tiers, and direct move of 11 extensions into `ts/packages/incubator/` landed. Remaining: live prose/skills sweep, parent positioning terminology, final handoff, and child closure.
- [~] Advance Subobjective `foundation-readme-driven-pass`. No package child or README draft exists yet; start with Clinkr, then Foundation, Brmem/SDK, and Extension Kit, synthesizing gate lessons here.
- [~] Complete the package reorganization through Subobjective `package-disposition-and-host-ontology`. Approved ADR 0045 and its destination map supersede the two-zone/flat-incubator direction with `public`/`incubating`/`internal` disposition roots, owner-nested ontology, leaf/package-identity rules, scope by disposition, and disposition dependency closure — subsuming the former zone-invariant row, including the public `@nseng-ai/ns` dependencies on Branch Context and Harness Artifacts that the child must remove or fold. Remaining: the child designs and executes the atomic cutover with its guards and the authoritative `ts/packages/README.md`; synthesize the landed result here.
- [~] Reconcile the first team-facing Objectives ship. Coordinated npm `0.1.3` already proved bare-core install, checkout-free Objectives acquisition, ten-skill provisioning, and `ns objective list` in a foreign repository. Decide whether Objectives' current Branch Context/Flow dependencies satisfy the intended single-player boundary; reverify the presented release if needed.
- [ ] Finish repo presentation: replace the one-line root README with the settled progressive-disclosure structure and add `why-ns.md`. First reconcile `references/root-readme-positioning.md` to extension terminology and current landed product evidence.
- [ ] Ship the checkout-free PR Feedback install/quickstart as the second product slice and leading root-README quickstart. Its current README still describes source-checkout, unpublished use; verify registry/install/command behavior before using it publicly.
- [ ] Pre-transfer privacy and secrets hardening: scan full history and remediate sensitive data before transfer.
- [ ] Pre-transfer operational decoupling and organization-policy negotiation: CI, deployment ownership, authentication, remotes, Graphite configuration, branch protection, and review requirements. Preserve a personal fork as the escape hatch.
- [ ] Transfer the repository to the target organization. Evidence: remotes redirected, CI green there, and fork retained.

## Parked

Demand-driven graduation work, activated only by a sponsor or transfer requirement:

- Host package promotion (a deliberate disposition change) after the approved cutover lands; placement itself is settled by the destination map.
- Remaining daily-driver extensions, including Slots, Handoffs, Reviews, Plans, and Branch Context.
- Flow graduation after its active reshaping settles.
- Herdr graduation after current orchestration reshaping settles.
- Pi integration/tooling graduation and checkout-free partner install story.
- Retros and Vibechk: retain as incubating residents or delete unless a sponsor establishes a contract. Pi Editor Mods is classified internal by the approved destination map; promotion requires a separate release-intent decision.
