# Opt-In Stacking and Provider Neutrality

## Thesis

ns still treats Graphite as the ambient, universal source of stacking behavior in important workflows: extensions construct Graphite gateways eagerly, generic workflows gate on Graphite tracking, and submit/land paths assume Graphite stack semantics. This Objective prepares the codebase so that **the default workflow is ordinary Git branches and GitHub PRs, and stacking is an explicitly selected, provider-neutral capability** — with Graphite becoming one adapter behind neutral seams rather than the substrate. The preparation is done in place as codebase-quality improvements: removing accidental couplings, cutting capability-shaped seams (topology inspection, branch preparation, reconciliation, publication), and making provider selection explicit configuration whose absence means *no stack behavior*.

Two external systems bound the design without being deliverables here. ADR 0049 and the capability matrix record locally observed `github/gh-stack` v0.0.8 semantics, including machine-readable `gh stack view --json` and a `link` path that publishes stacked PRs without local tracking; gh-stack is the intended first alternate provider in a follow-up Objective. Jujutsu (jj, colocated mode) is the extensibility stress test: this Objective does not build a jj adapter, but every neutral contract must be satisfiable by a motivated third party assembling jj support from extensibility surfaces alone.

Pluggability follows the adapter-collapse decision: user customization of operations like branch creation is served by one seam (for example, a `BranchCreationProvider`) whose built-in adapters include plain git and Graphite, with a first-party external-command adapter (script/BYO-ceremony path) added later behind the same seam — not by a new point-system kind. Additive ceremony around operations remains ordinary hook points.

## Scope

- Preserve the accepted ADR for the opt-in/neutrality decision (including jj as the motivating extensibility stress case) and the capability/semantic matrix for Graphite, gh-stack, and jj as a constraint column.
- Remove accidental ambient Graphite couplings:
  - Herdr resolving Graphite trunk at extension startup and blocking unrelated command registration.
  - Objective Runner hard-coding Graphite for required stack membership and branch creation instead of resolving the explicitly selected stack provider.
  - Flow trunk-pull/checkpoint paths using Graphite solely for trunk discovery.
  - Branch Context eagerly constructing a Graphite gateway even in plain-git mode.
- Introduce discriminated branch-vs-stack targets for submit, land, and branch creation, so ordinary branches never masquerade as one-element stacks and stack gateways exist only inside the stack arm of a workflow.
- Make stacking opt-in: an explicit flag or repository configuration selects a provider; absence of configuration means no stack behavior; ambient metadata autodetection never selects mutating workflows.
- Extract a provider-neutral stack model (ordered parent edges, trunk, optional current branch, typed diagnostics) and split capability seams — topology inspection, stacked-branch preparation, reconciliation, and publication — with Graphite as the sole real adapter, migrated behavior-preservingly from Flow's existing land/submit domain core.
- Cut the `BranchCreationProvider` seam with `plain-git` and `graphite` adapters, resolved lazily at composition roots.
- Establish adapter conformance tests at the neutral seams (topology ordering, missing/untracked branches, cycle/fork diagnostics, preparation, reconciliation outcomes including `not-needed`, and publication outcomes), so a future provider is validated by the same suite.
- Enforce the jj "do not preclude" guardrails in every new contract: optional current branch; publication takes an ordered branch list, never a provider topology handle; outcome vocabularies include `not-needed`/`automatic`; no index/staging semantics; capabilities individually satisfiable by partial providers; open-set provider identity where registration is intended; postconditions verified via `GitGateway` facts, not provider claims; no workflow reads provider-private state.

## Non-Goals

- **Building the gh-stack adapter.** That is the named follow-up Objective; here gh-stack is a design constraint the seams must satisfy.
- **Building a jj adapter** or any jj tests, CI, or docs promising jj works. jj is a stress test for contract shape only.
- **Shipping the external-command branch-creation adapter.** It is designed as one later built-in adapter behind the `BranchCreationProvider` seam, with JSON request/response and postconditions verified via git, but deferred until a concrete consumer exists.
- **Changing explicitly Graphite-branded surfaces**: `ns slot gt`, the Pi `[gt]` footer, `/gt:squash-stack`, smart-restack, and the Flow autobranch family keep Graphite as their explicit contract. Provider-neutral equivalents, if ever wanted, are new opt-in surfaces, not silent meaning changes.
- **Making slots jj-compatible.** Slots are git-worktree-native; jj uses its own workspace model. This is a documented boundary, not a defect.
- **A new point-system kind** ("operation points"). Operation replacement routes through provider seams; the point system stays additive hooks plus replaceable prompts.
- **Cutting this repo over to another provider.** This repo is intended to select Graphite explicitly once the durable provider-selection setting exists; switching it to another provider is deferred.

## Completion Criteria

- The ADR recording opt-in stacking, capability-split provider neutrality, the adapter-collapse pluggability decision, and the jj guardrails is accepted, and the capability/semantic matrix exists.
- ns works with no stack provider configured across provider-optional in-scope workflows: Branch Context, Herdr, checkpointing, trunk operations, and single-branch submit/land/push operate on plain git plus GitHub gateways with no Graphite gateway constructed. Objective Runner is deliberately stack-required for now and refuses clearly when no provider is selected.
- The four named ambient couplings (Herdr startup, Objective Runner's hard-coded Graphite gate and child prompt, generic Flow trunk discovery, and eager Branch Context wiring) are gone. Objective Runner tests exercise an injected selected-provider adapter and explicit no-provider refusal; the other couplings are verified without Graphite available.
- Submit, land, and branch creation take discriminated branch-vs-stack targets; stack behavior activates only on explicit selection.
- The neutral stack model and split capability seams exist with Graphite as their sole adapter; Flow land/submit planning consumes them behavior-preservingly, existing Flow tests pass, and conformance suites run against the Graphite adapter.
- The `BranchCreationProvider` seam exists with `plain-git` (default) and `graphite` adapters, provider identity is an open set at seams intended for registration, and every new contract passes the jj guardrail review ("could a colocated-jj provider fill this in without a stub or a lie?").
- Neutral stacking vocabulary is recorded in the relevant `CONTEXT.md` files, and `docs/conventions/graphite-dependency-boundary.md` is reconciled with the opt-in direction.

## Assumptions and Risks

**Assumptions** (each disprovable by later evidence):

- Flow's existing land/submit domain core (`StackSnapshot`, `RestackRequirement`, submit transport, maintenance planning) is close enough to provider-neutral that extraction is mostly renaming/reshaping, not redesign. If Graphite semantics turn out to be load-bearing in the planning logic, the extraction slices grow substantially.
- Colocated jj exports bookmarks as ordinary git refs reliably enough that `GitGateway`-based postcondition verification works for foreign providers. This grounds guardrail 7; if wrong, the verification story needs a rethink when someone builds such a provider.
- The gh-stack semantics recorded from v0.0.8 remain stable enough that designing seams against their shapes does not mislead the follow-up Objective. Drift is expected and tolerable because no adapter ships here.
- Two-plus justified adapters (Graphite now; gh-stack and external-command designed) make the capability seams real rather than speculative, per the one-adapter/two-adapter seam rule.
- Existing behavior where `ns flow submit` acts on the current Graphite stack can be preserved during preparation via explicit configuration/compatibility phasing without blocking the discriminated-target work.

**Risks** (needing de-risking, mitigation, or acceptance):

- **Behavior regression during extraction.** Flow land/submit are high-stakes publication workflows; migrating their planning onto neutral seams risks subtle policy changes. Mitigation: behavior-preserving slices gated on the existing Flow test suites plus conformance tests; no policy edits ride along with extractions.
- **Shallow-seam risk.** Cutting neutral interfaces before the capability split is understood could produce a "universal gt" — a large interface with pass-through adapters. Mitigation: the capability matrix and jj-column review precede seam cuts; monolithic provider interfaces are rejected in review.
- **Opt-in default breaks contributor muscle memory.** This repo's own workflows assume Graphite is ambient, and `ns.toml` does not yet carry a stack-provider selection. Mitigation: implement and document this repo's explicit Graphite selection before defaults flip.
- **Scope creep toward the follow-up.** The gh-stack adapter is tempting to start once seams exist. Acceptance: parked explicitly; the follow-up Objective owns it.
- **Convention drift.** `graphite-dependency-boundary.md` and contributor/skill guidance still reflect Graphite-era workflow assumptions. Mitigation: orientation.md carries the direction now; convention/skill reconciliation remains explicit roadmap work.

## Open Questions

- The neutral stacking contracts belong in a precise Extension Kit subpackage beside, not inside, the Graphite adapter; the exact subpath name remains an implementation-level naming choice, and relocation must not create duplicate import doors (ADR 0049).
- Exact configuration surface for provider selection (typed settings table name and flag spellings) and how Branch Context's existing `--graphite`/`--plain-git` flags map onto it.
- How Objective Runner consumes the repository-configured provider's branch-creation and membership capabilities without coupling to provider-private topology; repository configuration is the sole provider authority for all Runner work, and selection is mandatory until a concrete plain-Git multi-PR bookkeeping model exists.
- How the Flow submit compatibility phase is expressed (repo config selecting current-stack behavior versus a deprecation window) and what its removal trigger is.
- Whether `deriveSubmitStackTopologyFacts` and land topology derivation share one neutral graph module or stay two consumers of the neutral model.
