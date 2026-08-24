# Roadmap

## Work

- [x] Architecture and contract baseline — revalidated gh-stack v0.1.0, accepted ADR 0061's GS-native ownership boundary, and reshaped the GS README around the everyday loop, exact version policy, observed postconditions, outcome classes, forward recovery, and Flow independence.
  - Evidence: `docs/research/gh-stack-v0.1.0-workflow-baseline.md` captures reproducible help and disposable-repository observations; networked `sync`, `submit`, `link`, and `merge` behavior remains explicitly unsettled rather than promised.
- [~] GS-native restack-resolve vertical slice — the provider/recovery contract is settled: implement `ns gs restack-resolve` with public `gh stack rebase --no-trunk`, explicit `--downstack`, and one `gh stack rebase --continue` per accepted stop; then add its portable GS skill and thin `/ns:gs:restack-resolve` router. Preserve Slot preflight, human escalation, no implicit abort, observed Git/provider postconditions, and forward-only recovery without carrying Graphite mechanics into GS. Trunk fetching/integration and all push/GitHub effects remain deferred to reconciliation.
  - Evidence: `docs/research/gh-stack-v0.1.0-restack-resolve-contract.md` and the GS README record reproducible local behavior, rejected alternatives, starting states, partial-state recovery, and the CLI/skill/Pi boundary. Completion still requires tests for clean completion, an existing interrupted rebase, resolvable and escalating conflicts, exact-version drift, malformed/provider failure, Slot conflicts, and partial or ambiguous mutation plus CLI, skill, and Pi parity/routing checks.
- [ ] Native autobranch vertical slice — promote the proven dirty-trunk bootstrap and dirty-tracked-top extension outcomes from the provisional skill evidence into `ns gs`, adding only its required provider infrastructure, portable skill, and Pi surface, with typed refusals, forward-only partial/ambiguous failures, checkpoint composition, and verified Git/provider postconditions.
  - Evidence: staged, unstaged, untracked, and mixed dirtiness plus unsupported and post-mutation ambiguity scenarios pass without private-state access or Flow imports.
- [ ] Preparation loop and optional autoslot vertical slices — implement GS-owned changes and checkpoint workflows command by command, then compose verified autobranch completion with the public Slots command boundary. Keep core GS operation coherent when Slots is absent and ship each applicable skill/Pi surface with its CLI contract.
  - Evidence: Slots-absent behavior is covered; Slot refusal, failure, and ambiguous output preserve and report the durable provider child without replaying GS mutation.
- [ ] Reconciliation contract — experimentally settle `gh stack sync` behavior across clean, behind-trunk, rebase, conflict, unpublished, published, remote-changed, untracked, and partial-failure states. Decide the public command shape and whether submit or land may invoke reconciliation automatically; update the README before implementation.
  - Evidence: the resulting implementation and recovery contract names observed ref, push, PR-link, and partial-mutation behavior rather than relying on command descriptions.
- [ ] GS-native submit — implement checks, checkpointing, topology and SHA reverification, the settled reconciliation policy, native provider submission, authoritative GitHub branch-to-PR reconciliation, and structured partial-effect reporting. Establish GS-owned submit Points and recovery behavior where the contract requires them.
  - Evidence: tests cover new and existing PRs, failed checks, provider failure, missing or duplicate PR identities, partial publication, metadata preparation failure, and partial metadata application.
- [ ] GS PR inventories — implement the GS-owned focused and submit-integrated inventory outcomes with explicit destructive authorization and deterministic provenance, without importing Flow behavior at runtime.
  - Evidence: title/body preparation and application tests prove new-versus-existing selection, complete replacement policy, no-edit preparation failure, and bounded partial-apply recovery data.
- [ ] GS-native land — settle and implement provider/GitHub topology reconciliation, readiness preflight, safe merge order, partial-prefix completion, post-merge provider maintenance, optional Slot cleanup, and honest recovery reporting. Omit Graphite-specific continuation or stack surgery unless provider evidence establishes a native outcome.
  - Evidence: repository-local scenarios cover complete landing, readiness refusal, merge failure after a landed prefix, provider disagreement, cleanup failure, and dry-run behavior.
- [ ] Pi catalog reconciliation — after command-sized slices have shipped their native skills and `/ns:gs:*` surfaces, reconcile registration, presentation, recovery, and parity coverage across the settled catalog. Retire only provisional `/ns:flow:gs:*` skill-backed surfaces that completed GS slices replace; do not alter Flow's native GT CLI or Pi surfaces.
  - Evidence: Pi routing, parity, required-skill, cold-import, and startup tests pass for the settled GS catalog without deferring missing per-command host behavior to this final pass.
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
