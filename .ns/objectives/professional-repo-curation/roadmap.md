# Roadmap

## Work

- [~] Close Subobjective `rename-capability-to-extension`. The vocabulary verdict, CONTEXT layer, `@nseng-ai/extension-kit` cutover, `extension`/`extension-kit` tiers, and direct move of 11 extensions into `ts/packages/incubator/` landed. Remaining: live prose/skills sweep, parent positioning terminology, final handoff, and child closure.
- [~] Advance Subobjective `foundation-readme-driven-pass`. No package child or README draft exists yet; start with Clinkr, then Foundation, Brmem/SDK, and Extension Kit, synthesizing gate lessons here.
- [x] Synthesize closed Subobjective `skill-disposition-and-owner-ontology`. ADR 0046 and authoritative `skills/README.md` now govern all 58 current first-party skills: 1 public, 24 incubating, and 33 internal, with exact owner-nested canonical paths plus the `brmem`/`slots` exceptions, flat global identities and Harness Overlays, unchanged vendored directories, and no old mixed-layout fallback. ADR 0057 later retired the redundant standalone `objective-runner-step` skill without changing the ontology or historical Subobjective evidence. `pr-make-accountable` is the first public support warrant and requires only Git plus authenticated `gh`; support disposition, family, identity, invocation mode, and metadata remain independent. Current ownership is simpler than the completed slice's historical implementation: `npx skills` owns acquisition, installed-state lifecycle, and `skills-lock.json`; repository files directly own canonical topology, overlays, and invocation metadata; ns has no skill-management commands, package, provisioning manifest, or reconciliation interfaces, while runtime Skill-Backed Commands remain.
- [~] Synthesize the landed package reorganization from Subobjective `package-disposition-and-host-ontology`. ADR 0045 and the current tree use `public`/`incubating`/`internal` package disposition roots, owner-nested ontology, leaf/package-identity rules, scope by disposition, and package disposition dependency closure. The tree now contains 31 workspace packages after deletion of the Skill Exposure package. Public `@nseng-ai/ns` no longer depends on Branch Context or Harness Artifacts; the latter was folded before its obsolete management implementation was removed. Remaining: complete the child's deferred Pi extraction and guards and synthesize the final result here; do not infer package verdicts from the completed skill ontology.
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
