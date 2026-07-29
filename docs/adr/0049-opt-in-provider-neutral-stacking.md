# ADR 0049: Opt-In, Provider-Neutral Stacking

## Status

Accepted

## Context

ns has treated Graphite as ambient workflow infrastructure: generic composition roots construct Graphite gateways, unrelated startup and trunk discovery depend on `gt`, and workflows model an ordinary branch as a degenerate stack. That coupling makes plain Git plus GitHub unnecessarily fragile and would turn any alternate stack implementation into a Graphite-shaped adapter.

The provider comparison in [`docs/conventions/stack-provider-capability-matrix.md`](../conventions/stack-provider-capability-matrix.md) demonstrates that command parity is the wrong abstraction. Graphite, `github/gh-stack` v0.0.8, and colocated Jujutsu differ in local topology ownership, current-branch guarantees, preparation, reconciliation, and publication. In particular, `gh stack link` publishes an ordered stack without local gh-stack tracking, while Jujutsu may have no current Git branch and has no Git staging ritual.

## Decision

Ordinary Git branches and GitHub pull requests are the default ns workflow. Stacking is activated only by an explicit discriminated stack target whose provider is selected by a flag or typed repository setting. No configured provider means no stack behavior. Passive metadata may inform diagnostics, but autodetection must never select a mutating stack workflow.

Submit, land, and branch creation distinguish ordinary branch targets from stack targets. Composition roots construct stack adapters lazily and only inside the stack arm. Generic trunk and branch facts come from Git/config rather than a stack provider. This repository may explicitly select Graphite while compatibility work proceeds, but that selection is configuration—not an ambient platform assumption.

A Stack Provider is not one universal interface. Provider-neutral contracts are split by independently satisfiable capability:

1. topology inspection;
2. stacked-branch preparation;
3. reconciliation;
4. publication; and
5. branch creation as an adjacent, separately selected operation.

The neutral stack model contains ordered parent edges, trunk, an optional current branch, and typed missing/untracked/cycle/fork diagnostics. Publication accepts an ordered branch list rather than a provider topology handle. Workflow policy remains above these seams; provider command mechanics and private state remain inside adapters.

Branch creation follows **adapter collapse**: one `BranchCreationProvider` seam has built-in `plain-git` and `graphite` adapters and may later gain an external-command adapter with a typed JSON request/response contract. Operation replacement does not create a new Point kind. Additive pre/post ceremony remains ordinary hooks at Points under ADR 0031.

Graphite is the sole real stack adapter required by this decision. A gh-stack adapter is follow-up work. Jujutsu is not a target adapter; colocated jj is the extensibility stress case that prevents contracts from baking in Graphite or Git-checkout assumptions.

New neutral contracts must satisfy all eight jj guardrails:

1. **Optional current branch.** No contract assumes an attached Git `HEAD` or ambient branch target.
2. **Ordered publication input.** Publication takes explicit bottom-to-top branches, never a provider topology handle.
3. **Non-ritual outcomes.** Reconciliation and preparation vocabularies can express `not-needed` and `automatic`; mandatory restack is not universal.
4. **No index semantics.** Contracts do not require staging, index mutation, or a Git-style working-copy ceremony.
5. **Partial capability providers.** A provider may implement topology, preparation, reconciliation, publication, or branch creation independently without lying through stubs.
6. **Open provider identity.** Registration seams accept an open provider identity; closed unions are limited to built-in configuration validation where appropriate.
7. **Observed postconditions.** Git branch/ref/commit effects are verified through `GitGateway` facts, and PR effects through GitHub facts, rather than trusting provider claims.
8. **Private-state isolation.** Workflows never read provider-private metadata or command output; only an adapter may do so and must return neutral facts.

Placement follows ADRs 0019 and 0032. The provider-neutral stack contracts are ns-shaped extension-building substrate, so they belong in a precise Extension Kit subpackage rather than Neutral Infra. Graphite-specific adapters remain in `@nseng-ai/extension-kit/graphite`. Flow owns submit/land policy above the seams, and Branch Context owns its branch-context workflow policy. The exact Extension Kit subpath name is an implementation-level naming choice; it must preserve these ownership and dependency directions and must not create duplicate import doors.

## Consequences

- Plain branch workflows must run with no Graphite binary, metadata, gateway construction, or tracking gate.
- Existing Flow land/submit behavior is migrated in behavior-preserving slices before policy changes; conformance suites protect neutral semantics rather than command transcripts.
- Provider selection and current-stack compatibility need an explicit phased configuration, but the exact setting and flag spelling remain reversible implementation choices.
- gh-stack's v0.0.x semantics must be revalidated when its follow-up adapter begins.
- Explicitly Graphite-branded surfaces such as `ns slot gt`, `[gt]`, `/gt:squash-stack`, smart-restack, and Flow autobranch remain Graphite contracts.

## Alternatives

- **Keep Graphite ambient and add exceptions for plain Git:** rejected because the default remains coupled and every alternate provider inherits Graphite semantics.
- **One monolithic StackProvider:** rejected because topology, reconciliation, and publication are independently satisfiable—demonstrated by `gh stack link` and the jj constraint—and pass-through adapters would be shallow seams.
- **Model a branch as a one-element stack:** rejected because it activates stack dependencies and obscures distinct branch policy.
- **Choose stack behavior by metadata autodetection:** rejected because stale or incidental metadata must not authorize mutation.
- **Add operation replacement as a Point kind:** rejected because one provider seam with adapters is the coherent replacement boundary; Points remain additive hooks and prompts.
- **Put neutral stacking in Foundation:** rejected under ADR 0032 because the contracts serve ns workflow composition and lack a credible substantially-as-is external consumer.
