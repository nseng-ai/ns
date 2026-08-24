# Roadmap

## Work

- [ ] Architecture and contract baseline — revalidate the installed gh-stack version and current provider behavior; write the ADR superseding the affected parts of ADR 0049; reshape the GS README around the target everyday loop, explicit version policy, observed-postcondition rule, failure vocabulary, and Flow-independence boundary.
  - Evidence: focused disposable-repository observations are captured in the contract or supporting references, the ADR is accepted, and documentation does not promise unsettled mutation behavior.
- [ ] GS provider module — add narrow, GS-owned command adapters, schemas, semantic facts, in-memory fakes, and real-adapter coverage for the supported subset of `view`, `init`, `add`, `sync`, `submit`, and `link` that the contract selects. Do not create a monolithic or provider-neutral stack interface.
  - Evidence: fake-driven tests cover malformed output, version drift, process failure, and disagreement between provider claims and observed Git facts.
- [ ] Native autobranch — promote the proven dirty-trunk bootstrap and dirty-tracked-top extension outcomes from the provisional skill evidence into `ns gs`, with typed refusals, forward-only partial/ambiguous failures, checkpoint composition, and verified Git/provider postconditions.
  - Evidence: staged, unstaged, untracked, and mixed dirtiness plus unsupported and post-mutation ambiguity scenarios pass without private-state access or Flow imports.
- [ ] Preparation loop and optional autoslot — implement GS-owned changes and checkpoint workflows, then compose verified autobranch completion with the public Slots command boundary. Keep core GS operation coherent when Slots is absent.
  - Evidence: Slots-absent behavior is covered; Slot refusal, failure, and ambiguous output preserve and report the durable provider child without replaying GS mutation.
- [ ] Reconciliation contract — experimentally settle `gh stack sync` behavior across clean, behind-trunk, rebase, conflict, unpublished, published, remote-changed, untracked, and partial-failure states. Decide the public command shape and whether submit or land may invoke reconciliation automatically; update the README before implementation.
  - Evidence: the resulting implementation and recovery contract names observed ref, push, PR-link, and partial-mutation behavior rather than relying on command descriptions.
- [ ] GS-native submit — implement checks, checkpointing, topology and SHA reverification, the settled reconciliation policy, native provider submission, authoritative GitHub branch-to-PR reconciliation, and structured partial-effect reporting. Establish GS-owned submit Points and recovery behavior where the contract requires them.
  - Evidence: tests cover new and existing PRs, failed checks, provider failure, missing or duplicate PR identities, partial publication, metadata preparation failure, and partial metadata application.
- [ ] GS PR inventories — implement the GS-owned focused and submit-integrated inventory outcomes with explicit destructive authorization and deterministic provenance, without importing Flow behavior at runtime.
  - Evidence: title/body preparation and application tests prove new-versus-existing selection, complete replacement policy, no-edit preparation failure, and bounded partial-apply recovery data.
- [ ] GS-native land — settle and implement provider/GitHub topology reconciliation, readiness preflight, safe merge order, partial-prefix completion, post-merge provider maintenance, optional Slot cleanup, and honest recovery reporting. Omit Graphite-specific continuation or stack surgery unless provider evidence establishes a native outcome.
  - Evidence: repository-local scenarios cover complete landing, readiness refusal, merge failure after a landed prefix, provider disagreement, cleanup failure, and dry-run behavior.
- [ ] Pi surface and skill cutover — add native `/ns:gs:*` registration, presentation, recovery, and parity coverage. Retire only the provisional `/ns:flow:gs:*` skill-backed surfaces that the new GS commands replace; do not alter Flow's native GT CLI or Pi surfaces.
  - Evidence: Pi routing, parity, required-skill, cold-import, and startup tests pass for the settled GS catalog.
- [ ] Everyday-loop proof and documentation reconciliation — exercise the repository-local loop from preparation through landing, close remaining command/API inconsistencies, and synchronize the GS README, GS context, Context Map, provider capability documentation, and relevant Pi documentation with shipped behavior.
  - Evidence: focused package, scenario, integration, Pi, TypeScript architecture, and repository validation checks pass; bounded dependency searches confirm GS has no Flow runtime edge; Flow remains otherwise untouched.

## Parked

- Flow deprecation, archival, deletion, package removal, command removal, or Pi-surface retirement.
- Exact replacements for Graphite-shaped latest-commit extraction and stack squash without a demonstrated GS-native need.
- A universal stack-provider abstraction or command-parity layer spanning Graphite and gh-stack.
- Support for additional gh-stack versions without a separate evidence-backed widening decision.
- Cold external-consumer installation and packaging qualification beyond repository-local validation.
- Provider-private state mutation or lifecycle behavior based on direct reads of `<git-common-dir>/gh-stack`.
- Standalone plain-Git push behavior unless a GS recovery scenario proves it necessary.
