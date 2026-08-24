# ADR 0061: GS-Native Lifecycle Ownership

## Status

Accepted

Supersedes ADR 0049 only where that decision assigned gh-stack lifecycle work to future provider-neutral Flow capabilities and required provider-private command output to be hidden behind neutral adapters. ADR 0049's plain-Git default, explicit provider selection, lazy provider construction, observed-postcondition rule, Graphite ownership, and Jujutsu guardrails for genuinely neutral contracts remain accepted.

## Context

ADR 0049 used `github/gh-stack` as evidence that command parity is the wrong abstraction, then anticipated implementing it as independently selectable neutral topology, preparation, reconciliation, and publication capabilities beneath Flow. Revalidation of the pinned pre-1.0 provider shows a more cohesive and provider-specific lifecycle. `gh stack sync` claims to combine fetch, local/remote stack reconciliation, trunk movement, cascade rebases, atomic branch pushes, PR-state synchronization, and remote-stack linking. `submit`, `link`, and `merge` have distinct GitHub effects and recovery boundaries. Flattening these operations into Flow's existing capability seams would either leak gh-stack semantics through neutral contracts or produce shallow pass-through adapters.

The same v0.1.0 observations also show that provider acceptance is not workflow safety: `init` preserves dirty tracked work, and `add` can succeed from a trunk checkout associated with an existing stack. ns must choose supported starting states and verify outcomes rather than treating provider permissiveness or exit success as its contract.

## Decision

`@nseng-ai/gs` owns the gh-stack everyday lifecycle as a provider-branded ns extension. Its workflows are designed from supported `github/gh-stack` operations and failure modes, not as Flow adapters and not as implementations of a universal stack-provider transaction. Flow continues to own its existing Graphite workflows and remains unchanged by this decision.

GS initially supports exactly gh-stack v0.1.0. Every lifecycle composition root checks the installed version before mutation and refuses unqualified version drift. Widening support requires new command, output, mutation-boundary, and recovery evidence; pre-1.0 compatibility is never inferred from version ordering.

GS lifecycle code may invoke supported public gh-stack commands and consume their public output, but it does not read or mutate gh-stack's private local state. The existing local-only `ns gs list` inventory is a separately justified inspection feature and is not a lifecycle fact source.

Each mutating workflow defines ns-owned starting states, refusals, and postconditions. It classifies outcomes as:

- **refused** — no intended mutation began;
- **completed** — every required postcondition was independently observed;
- **known partial failure** — observed effects identify what completed and what remains; or
- **ambiguous failure** — a mutation may have occurred but authoritative observations cannot establish its extent.

Provider exit status, prose, and JSON are evidence, not authoritative completion facts. GS verifies the relevant combination of Git checkout, refs, commits, and worktree state; supported gh-stack facts; and authoritative GitHub branch, PR, base, stack, queue, and merge facts. After a known partial or ambiguous mutation, GS preserves observed durable state and gives forward recovery guidance. It does not blindly retry, infer rollback, delete branches, unstack, or reconstruct private metadata.

The GS README is the mutable user-facing contract. A mutating command is implemented only after focused provider experiments settle that workflow's supported starting states, effects, postconditions, refusal classes, partial effects, and recovery guidance. Unverified provider help remains capability orientation, not an ns guarantee.

Slots remain optional. GS may compose a verified durable lifecycle outcome with Slots through the public Slot command boundary; GS does not acquire a package dependency on Slots or make Slot success part of core provider correctness.

## Consequences

- The GS package can form deep modules around provider-native outcomes instead of mirroring Flow commands or Graphite rituals.
- No GS runtime dependency on Flow or universal GT/GS lifecycle interface is permitted.
- `sync`, `submit`, `link`, and `merge` remain unsettled until remote experiments establish their observable phase and recovery boundaries.
- v0.1.0 help claims about atomic pushes, rollback, remote stack updates, and atomic stack merge are not product guarantees without independent observations.
- Flow retirement, deprecation, and command removal remain separate future work.

## Considered Options

- **Implement gh-stack beneath ADR 0049's neutral Flow capabilities:** rejected because the provider combines concerns differently and would force either leaky neutral contracts or shallow adapters.
- **Copy Flow command parity into GS:** rejected because Graphite-specific operations and recovery rituals are not evidence of GS-native outcomes.
- **Trust provider success and rollback claims:** rejected because Git and GitHub effects can disagree with process output or stop after partial external mutation.
- **Support any installed pre-1.0 version:** rejected because the observed command and JSON contracts are unstable and already changed between the ADR 0049 v0.0.8 snapshot and v0.1.0.
