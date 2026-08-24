# GS-Native Workflow Rebuild

## Thesis

Build a cohesive everyday stacked-development workflow in `@nseng-ai/gs`, designed around the official `github/gh-stack` provider's own primitives and failure modes. Use the existing Flow workflows only as evidence for useful user outcomes; do not reproduce Graphite rituals, force command parity, introduce a universal stack-provider abstraction, or make GS depend on Flow.

The target loop covers understanding and checkpointing work, creating or extending a gh-stack, resolving restack conflicts, optionally starting or continuing work in a Slot, reconciling provider state, submitting pull requests, generating PR inventories, and landing the stack. Build it as command-sized vertical slices: each slice starts from an actual user workflow, revalidates the pinned pre-1.0 gh-stack behavior it needs, settles the user-facing contract in the GS README, and then adds only the provider infrastructure, CLI behavior, portable skill, and Pi surface that workflow proves necessary.

The lifecycle model must preserve gh-stack v0.1.0's worktree boundary. Git branch refs are repository-shared, but gh-stack topology, recorded heads and bases, PR associations, checksums, and locks live under the invoking worktree's private Git directory. Provider observations and mutations are therefore scoped to one explicit provider worktree; moving a branch between worktrees does not move stack membership or coordinate provider locks.

This Objective does not modify or retire Flow. Eventual Flow retirement motivates an independent GS design but belongs to later work after the GS workflow is proven.

## Scope

- Revalidate the installed pre-1.0 gh-stack version and experimentally characterize the provider operations needed by each workflow, including linked-worktree metadata, lock, shared-ref, occupancy, and recovery behavior.
- Establish an explicit provider-worktree ownership policy: distinguish repository-shared Git refs, worktree-local gh-stack state and locks, and GitHub remote authority; scope every provider fact and mutation to its invoking worktree.
- Correct local inventory to reflect the provider's actual worktree-local storage, or introduce any future cross-worktree aggregation only with explicit provenance and divergence semantics.
- Supersede the affected parts of ADR 0049 so GS owns gh-stack-native lifecycle workflows while preserving explicit provider selection, provider-private state isolation, and observed Git/GitHub postconditions.
- Evolve the GS README into the canonical user-facing workflow contract before each implementation slice.
- Build provider infrastructure incrementally inside command-sized vertical slices rather than as a standalone provider-module phase; keep each GS-owned, fake-driven adapter and semantic fact narrow to a proven workflow need and independent of Flow.
- Implement an outcome-oriented `ns gs` surface for restack conflict resolution, changes, checkpointing, autobranch, optional autoslot, reconciliation, submission, PR-inventory generation, and landing. Exact names and grouping may change when provider evidence supports a better shape.
- Preserve forward-only recovery for mutating workflows: distinguish refusal, completion, known partial failure, and ambiguous failure from observed Git, gh-stack, and GitHub state.
- Keep Slots optional and compose them through their public command boundary without assuming branch checkout transfers provider state. Support destination establishment only through experimentally verified public provider operations; otherwise preserve one stable provider worktree and refuse unsupported movement.
- Ship each settled CLI workflow with its portable GS skill and native `/ns:gs:*` Pi surface when applicable, so command, skill, and host behavior evolve as one vertical slice rather than through a deferred bulk cutover.
- Prove the complete GS everyday loop through repository-local package, scenario, integration, and Pi tests.
- Keep GS context vocabulary, command documentation, and provider capability documentation synchronized with implemented ground truth.

## Non-Goals

- Modify, deprecate, archive, delete, or otherwise retire Flow or its Pi surfaces in this Objective.
- Preserve one-for-one Flow command parity. Graphite-shaped operations such as latest-commit extraction or stack squash are omitted unless GS usage establishes a native need.
- Implement GS as an adapter beneath Flow or introduce a provider-neutral Flow compatibility layer.
- Add a GS runtime import from `@nseng-ai/flow` or reuse Flow's private implementation modules.
- Read, mutate, copy, merge, or reconstruct gh-stack's private local state for lifecycle operations; `ns gs list` remains a separately justified current-worktree inspection feature.
- Promise general ownership transfer for unpublished or multi-layer stacks before a provider-native adoption and source-retirement procedure is experimentally proven.
- Treat an ns-owned lock as proof of repository-wide serialization of direct `gh stack` processes.
- Support multiple pre-1.0 gh-stack versions before evidence justifies widening the pinned baseline.
- Require Slots for the core GS workflow.
- Make cold external-consumer repository qualification a closure gate for this Objective.

## Completion Criteria

- An accepted ADR supersedes the affected Flow-owned provider-neutral direction in ADR 0049 and records GS-native workflow ownership and architecture constraints.
- The GS README truthfully specifies the implemented everyday loop, supported gh-stack version, starting states, provider operations, postconditions, refusal classes, partial effects, and recovery guidance.
- GS has no runtime dependency on Flow and does not expose a universal GT/GS provider transaction.
- The implemented command surface supports the complete outcome loop: inspect and checkpoint work, bootstrap or extend a gh-stack, resolve restack conflicts, optionally enter a Slot, reconcile, submit, generate PR inventories, and land.
- Each mutating workflow verifies effects with the relevant combination of repository-shared Git facts, invoking-worktree gh-stack facts, and GitHub facts instead of trusting process success alone.
- Every provider mutation and recovery result identifies or preserves its provider worktree; completion never implies that peer worktrees' gh-stack metadata agrees.
- Tests cover staged, unstaged, untracked, and mixed work where applicable; unsupported states; version drift; provider-command failure; known partial mutation; ambiguous mutation; recovery facts; wrong-worktree invocation; missing, stale, and divergent peer metadata; independent provider-lock concurrency; shared-ref movement; and initiating-worktree recovery.
- Slots-absent operation is covered. Any supported Slot composition proves destination provider readiness after placement; unsupported multi-layer movement refuses safely; partial placement preserves and separately reports the shared branch/checkpoint, source provider state, and destination provider status.
- Native `/ns:gs:*` Pi surfaces have command-routing and parity coverage.
- Repository-local GS tests, relevant integration and Pi tests, TypeScript architecture checks, and the repository validation gate pass.
- Flow source, commands, registrations, and documentation remain unchanged except for any narrowly unavoidable cross-reference that must acknowledge the accepted superseding ADR.

## Metaprompt

When `objective-next` proposes implementation work for this Objective, serialize the inner proposed prompt as a directly invocable Pi planning command: its first line must begin with `/ns:plan:grill-and-save`, one space, and then the implementation-planning request. Keep the remaining prompt cold-start safe with the selected roadmap row, durable starting references, bounded scope, constraints, and completion evidence. This prefix applies to implementation proposals only; research, decision, grilling, and other non-implementation steps keep their natural prompt form.

The command should produce a reviewed Saved plan before implementation rather than authorizing implementation directly. This serialization rule does not change step selection or grant execution permission.

## Assumptions and Risks

**Assumptions**

- The revalidated gh-stack v0.1.0 command surface supports a local inter-branch restack-resolve loop through `view --json` and `rebase --no-trunk` / `rebase --continue`; the broader everyday loop still appears possible through `init`, `add`, `sync`, `submit`, `link`, and `merge`, but those networked mutation and recovery semantics remain unverified workflow by workflow.
- The existing GS autobranch and autoslot skills contain useful single-worktree operational evidence, but their procedures are not permanent interfaces and require revalidation against worktree-local provider state.
- Repository-shared Git facts and GitHub observations can establish postconditions that provider command output cannot establish reliably, while supported provider output establishes only invoking-worktree gh-stack facts.
- Repository-local fake-driven, scenario, integration, and Pi coverage is sufficient for this incubating Objective's closure gate.
- The GS package can own ordinary Git/GitHub preparation behavior when that behavior forms part of the GS workflow, without pretending every step is intrinsically a stack-provider operation.

**Risks**

- gh-stack is pre-1.0 and may change commands, JSON output, private behavior, or failure boundaries while implementation is in progress. The initial lifecycle baseline is pinned to exactly v0.1.0; evidence-gated widening mitigates but does not eliminate this risk.
- `gh stack sync` combines fetching, rebasing, pushing, and PR linking and is therefore rejected as the local restack-resolve primitive; whether it has acceptable semantics for later reconciliation remains unresolved.
- Submit and land may expose provider/GitHub inconsistencies or partial mutations that require a different workflow shape than Flow's.
- Reusing Flow vocabulary or architecture by habit could produce a disguised Graphite adapter rather than a deep GS module.
- Optional Slots composition may encounter extension-discovery or command-boundary limitations and must not create a hard GS-to-Slots package dependency without a new decision.
- Worktree-local provider metadata can diverge over repository-shared refs, while worktree-local locks permit concurrent provider processes in different worktrees; Git branch occupancy prevents only some conflicting mutations.
- Moving one branch to a Slot can leave the destination without stack membership and the source with stale provider ownership. No supported general move or source-retirement operation is yet established, especially for unpublished multi-layer stacks.
- Freeing or recreating a provider-owning Slot may discard the only useful local stack model even when the shared branches remain.
- Repository-local proof may miss packaging or external-installation defects; cold-consumer qualification remains follow-up work rather than being implied by closure.
- A command-first implementation can still over-generalize from Graphite precedent. Each vertical slice must separate reusable user outcomes from provider-specific mechanics and extract shared GS infrastructure only after the command demonstrates the need.
- The broad everyday-loop scope may need resequencing as provider experiments reveal hard semantic dependencies.

## Open Questions

- Which parts of `code-gt-restack-resolve` express provider-independent conflict-resolution policy, and which Graphite-specific assumptions must not carry into the GS skill implementation?
- Should reconciliation be an explicit `ns gs sync` workflow, an internal submit/land phase, or both?
- Does `gh stack sync` have acceptable mutation and recovery semantics for automatic composition?
- Does normal GS publication need only `gh stack submit`, or does an outcome require `gh stack link`?
- Which of the provisional command names should survive after the README contract is tested against provider-native concepts?
- What stack and PR ordering permits safe landing, and what provider reconciliation is required after each successful merge?
- Is there a GS-native continuation behavior after landing, or should Flow's Graphite-specific `--up` behavior disappear?
- Can optional autoslot be registered cleanly through existing extension-presence facilities, or does the command need an invocation-time availability check?
- What durable identity and lifetime define a stack's provider worktree, and must it remain stable until the stack is landed or explicitly retired?
- Can supported public commands establish an existing complete stack in a destination worktree without rewriting refs, losing PR associations, or creating a competing local definition?
- How can stale source or peer worktree state be detected, surfaced, reconciled, or retired without reading or mutating private provider files?
- Is an ns-owned repository-wide operation lease useful as defense in depth even though it cannot serialize direct `gh stack` invocations?
- What Slot cleanup is legal while active stack layers still depend on the Slot's worktree-local provider state?
- Which lifecycle operations remain safe when peer worktrees hold divergent metadata but no stack branch is checked out there?
- Which shared-looking Git/GitHub helpers are truly GS-owned versus deserving later extraction after a second current consumer appears?
