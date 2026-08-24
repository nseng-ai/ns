# GS-Native Workflow Rebuild

## Thesis

Build a cohesive everyday stacked-development workflow in `@nseng-ai/gs`, designed around the official `github/gh-stack` provider's own primitives and failure modes. Use the existing Flow workflows only as evidence for useful user outcomes; do not reproduce Graphite rituals, force command parity, introduce a universal stack-provider abstraction, or make GS depend on Flow.

The target loop covers understanding and checkpointing work, creating or extending a gh-stack, resolving restack conflicts, optionally moving work into a Slot, reconciling provider state, submitting pull requests, generating PR inventories, and landing the stack. Build it as command-sized vertical slices: each slice starts from an actual user workflow, revalidates the pinned pre-1.0 gh-stack behavior it needs, settles the user-facing contract in the GS README, and then adds only the provider infrastructure, CLI behavior, portable skill, and Pi surface that workflow proves necessary.

This Objective does not modify or retire Flow. Eventual Flow retirement motivates an independent GS design but belongs to later work after the GS workflow is proven.

## Scope

- Revalidate the installed pre-1.0 gh-stack version and experimentally characterize the provider operations needed by each workflow.
- Supersede the affected parts of ADR 0049 so GS owns gh-stack-native lifecycle workflows while preserving explicit provider selection, provider-private state isolation, and observed Git/GitHub postconditions.
- Evolve the GS README into the canonical user-facing workflow contract before each implementation slice.
- Build provider infrastructure incrementally inside command-sized vertical slices rather than as a standalone provider-module phase; keep each GS-owned, fake-driven adapter and semantic fact narrow to a proven workflow need and independent of Flow.
- Implement an outcome-oriented `ns gs` surface for restack conflict resolution, changes, checkpointing, autobranch, optional autoslot, reconciliation, submission, PR-inventory generation, and landing. Exact names and grouping may change when provider evidence supports a better shape.
- Preserve forward-only recovery for mutating workflows: distinguish refusal, completion, known partial failure, and ambiguous failure from observed Git, gh-stack, and GitHub state.
- Keep Slots optional and compose it through its public command boundary only after GS state is durable and verified.
- Ship each settled CLI workflow with its portable GS skill and native `/ns:gs:*` Pi surface when applicable, so command, skill, and host behavior evolve as one vertical slice rather than through a deferred bulk cutover.
- Prove the complete GS everyday loop through repository-local package, scenario, integration, and Pi tests.
- Keep GS context vocabulary, command documentation, and provider capability documentation synchronized with implemented ground truth.

## Non-Goals

- Modify, deprecate, archive, delete, or otherwise retire Flow or its Pi surfaces in this Objective.
- Preserve one-for-one Flow command parity. Graphite-shaped operations such as latest-commit extraction or stack squash are omitted unless GS usage establishes a native need.
- Implement GS as an adapter beneath Flow or introduce a provider-neutral Flow compatibility layer.
- Add a GS runtime import from `@nseng-ai/flow` or reuse Flow's private implementation modules.
- Read or mutate gh-stack's private local state for lifecycle operations; `ns gs list` remains a separately justified local-only inspection feature.
- Support multiple pre-1.0 gh-stack versions before evidence justifies widening the pinned baseline.
- Require Slots for the core GS workflow.
- Make cold external-consumer repository qualification a closure gate for this Objective.

## Completion Criteria

- An accepted ADR supersedes the affected Flow-owned provider-neutral direction in ADR 0049 and records GS-native workflow ownership and architecture constraints.
- The GS README truthfully specifies the implemented everyday loop, supported gh-stack version, starting states, provider operations, postconditions, refusal classes, partial effects, and recovery guidance.
- GS has no runtime dependency on Flow and does not expose a universal GT/GS provider transaction.
- The implemented command surface supports the complete outcome loop: inspect and checkpoint work, bootstrap or extend a gh-stack, resolve restack conflicts, optionally enter a Slot, reconcile, submit, generate PR inventories, and land.
- Each mutating workflow verifies effects with the relevant combination of Git, supported gh-stack output, and GitHub facts instead of trusting process success alone.
- Tests cover staged, unstaged, untracked, and mixed work where applicable; unsupported states; version drift; provider-command failure; known partial mutation; ambiguous mutation; and recovery facts.
- Slots-absent operation is covered, and autoslot failure preserves the already verified GS branch, checkpoint, and provider state.
- Native `/ns:gs:*` Pi surfaces have command-routing and parity coverage.
- Repository-local GS tests, relevant integration and Pi tests, TypeScript architecture checks, and the repository validation gate pass.
- Flow source, commands, registrations, and documentation remain unchanged except for any narrowly unavoidable cross-reference that must acknowledge the accepted superseding ADR.

## Assumptions and Risks

**Assumptions**

- The revalidated gh-stack v0.1.0 command surface appears capable of supporting the everyday loop through `view`, `init`, `add`, `sync`, `submit`, `link`, and `merge`, but networked mutation and recovery semantics remain unverified workflow by workflow.
- The existing GS autobranch and autoslot skills contain useful operational evidence, but their procedures are not permanent interfaces and require revalidation.
- Git and GitHub observations can establish the postconditions that provider command output cannot establish reliably.
- Repository-local fake-driven, scenario, integration, and Pi coverage is sufficient for this incubating Objective's closure gate.
- The GS package can own ordinary Git/GitHub preparation behavior when that behavior forms part of the GS workflow, without pretending every step is intrinsically a stack-provider operation.

**Risks**

- gh-stack is pre-1.0 and may change commands, JSON output, private behavior, or failure boundaries while implementation is in progress. The initial lifecycle baseline is pinned to exactly v0.1.0; evidence-gated widening mitigates but does not eliminate this risk.
- `gh stack sync` may combine fetching, rebasing, pushing, and PR linking in ways that make automatic composition unsafe or make a direct replacement for `pull-trunk` undesirable.
- Submit and land may expose provider/GitHub inconsistencies or partial mutations that require a different workflow shape than Flow's.
- Reusing Flow vocabulary or architecture by habit could produce a disguised Graphite adapter rather than a deep GS module.
- Optional Slots composition may encounter extension-discovery or command-boundary limitations and must not create a hard GS-to-Slots package dependency without a new decision.
- Repository-local proof may miss packaging or external-installation defects; cold-consumer qualification remains follow-up work rather than being implied by closure.
- A command-first implementation can still over-generalize from Graphite precedent. Each vertical slice must separate reusable user outcomes from provider-specific mechanics and extract shared GS infrastructure only after the command demonstrates the need.
- The broad everyday-loop scope may need resequencing as provider experiments reveal hard semantic dependencies.

## Open Questions

- Can gh-stack v0.1.0 support a safe `ns gs restack-resolve` workflow through public commands, or does `sync` couple local restacking to fetch, push, or GitHub mutations too tightly for that outcome?
- Which parts of `code-gt-restack-resolve` express provider-independent conflict-resolution policy, and which Graphite-specific assumptions must not carry into the GS skill?
- Should reconciliation be an explicit `ns gs sync` workflow, an internal submit/land phase, or both?
- Does `gh stack sync` have acceptable mutation and recovery semantics for automatic composition?
- Does normal GS publication need only `gh stack submit`, or does an outcome require `gh stack link`?
- Which of the provisional command names should survive after the README contract is tested against provider-native concepts?
- What stack and PR ordering permits safe landing, and what provider reconciliation is required after each successful merge?
- Is there a GS-native continuation behavior after landing, or should Flow's Graphite-specific `--up` behavior disappear?
- Can optional autoslot be registered cleanly through existing extension-presence facilities, or does the command need an invocation-time availability check?
- Which shared-looking Git/GitHub helpers are truly GS-owned versus deserving later extraction after a second current consumer appears?
