# Honest Composable Command Model

## Thesis

The current ns command execution surface risks confusing host-varying invocation facilities with stable capability collaborators. The deleted `composable-command-core` experiment demonstrated useful pieces—composable command definitions, semantic events, host-edge rendering, and working `flow cp` and `flow changes` ports—but its cross-capability `FirstPartyCommandContext` grouped dependencies by “first-party command” rather than by capability ownership. It exposed raw execution beside gateways and could have become another ambient dependency bag like `NsExtensionApi`.

This Objective will settle and prove a more honest model. The SDK command invocation interface contains only facts and channels that genuinely vary by host or invocation. Every capability owns exactly one named root collaborator context, constructed at its composition edge and shared across that capability’s commands; command-, operation-, and workflow-specific dependency contexts do not proliferate. Capability contexts expose capability-owned Consumer Gateways where practical rather than raw process primitives or unnecessarily broad provider contracts.

The model must survive real execution pressure rather than documentation alone: a simple Flow command, maximal Flow `submit`, and one command from a second capability must work through the existing ns CLI and Pi paths. The proof records before/after complexity and glue evidence and ends with an actionable contract for a later repository-wide migration. This Objective proves the replacement and specifies migration; it does not itself migrate every legacy command.

This record begins as an Ideation Objective. Its initial roadmap is a Frontier of design questions. When those questions resolve, the record crystallizes in place into a dependency-ordered implementation roadmap for the proof described above. The originating wayfinding session is preserved at `references/wayfinder-map.md` as evidence; this Objective is authoritative.

## Scope

- Define the smallest complete SDK invocation contract for existing ns CLI and Pi execution, including lifetime, result/event ownership, interactions, presentation capabilities, output format, and other host-varying facilities only when supported by named consumers.
- Define one root collaborator context per capability, including composition-root construction, Consumer Gateway narrowing, command binding, testing, and separation from invocation data.
- Explicitly reject a cross-capability `FirstPartyCommandContext` or equivalent universal collaborator bag.
- Preserve ordinary libraries and gateway seams as capability collaborators rather than laundering model access, Git, Graphite, environment policy, or raw command execution through the SDK invocation contract.
- Select and baseline a second-capability command that complements Flow `changes` and Flow `submit` as a breadth test.
- Pressure-test the proposed interface against all three proof commands and both existing hosts before committing to the implementation roadmap.
- Implement the settled composable command model and the representative proof ports after crystallization.
- Record qualitative invariants and quantitative before/after evidence, including command glue, adapter count/shape, context surface, and preserved behavior.
- Produce a written full-migration contract covering inventory, compatibility obligations, deletion targets, sequencing constraints, documentation impact, and required evidence for later work.
- Reconcile settled terminology with root and package `CONTEXT.md` files when the model introduces or changes domain language.

## Non-Goals

- Completing the repository-wide migration away from `NsExtensionApi` or any successor legacy execution/context surface.
- Treating indefinite coexistence of legacy and composable execution as a successful outcome.
- Redesigning extension packaging, descriptors, discovery, precedence, or catalog loading.
- Broadly redesigning generic Clinkr mechanics; only narrow ns SDK adapter changes earned by the proof are in scope.
- Consolidating or relocating provider gateway implementations as incidental cleanup.
- Adding a new command host; the proof uses the existing ns CLI and Pi paths.
- Creating command-, operation-, or workflow-specific dependency contexts to make individual ports easier.
- Restoring the deleted stack unchanged or treating its design documents as authoritative over current evidence.
- Opening or executing the later full-migration Objective; this Objective produces the contract from which that work can be scoped.

## Completion Criteria

1. The Objective has crystallized from Question Rows into a reviewed, dependency-ordered implementation roadmap with the SDK invocation contract and capability-context composition rules settled.
2. The SDK command invocation interface contains only named host- or invocation-varying facts and channels; its explicit exclusions prevent catalog/discovery and stable libraries, gateways, model facilities, environment policy, and raw execution from becoming ambient command dependencies.
3. Every proof capability has exactly one named root collaborator context, and no `FirstPartyCommandContext`, command-specific context, workflow-specific context, or equivalent cross-capability dependency bag is introduced.
4. Flow `changes`, Flow `submit`, and the selected second-capability command execute through the settled model in both the existing ns CLI and Pi paths with supported behavior preserved.
5. The proof commands consume capability-owned narrowed Consumer Gateways where practical and do not fake process primitives or reconstruct real gateway adapters inside domain/workflow logic.
6. Temporary compatibility scaffolding is bounded by documented invariants and named migration deletion targets rather than becoming a supported second model.
7. A recorded evidence report compares the before and after states, evaluates the settled success/failure criteria, and reaches an explicit adopt, revise, or reject verdict.
8. A written full-migration contract gives a fresh later session enough inventory, constraints, deletion markers, sequencing guidance, and documentation obligations to scope migration without repeating this architectural investigation.
9. Relevant package tests and repository validation pass for the implemented proof, and the settled vocabulary is reflected in applicable context and author documentation.

## Assumptions and Risks

- **Assumption — one capability context is cohesive enough.** Stable collaborators are expected to share capability ownership and composition lifetime. The pressure test must disprove this rather than silently minting narrower named contexts if Flow `submit` or the second capability reveals a genuinely different lifetime.
- **Assumption — a universal invocation contract can remain small.** Existing CLI and Pi hosts are expected to differ mainly in invocation facts and channels. The contract should grow only from named proof consumers, not convenience or hypothetical hosts.
- **Assumption — Flow plus a second capability is representative.** Flow supplies simple and maximal depth; another capability supplies breadth. The second command must be selected for architectural contrast rather than ease of migration.
- **Risk — the capability context becomes a capability-sized service locator.** Exactly one context prevents fragmentation but can still hide dependencies. Mitigation must come from disciplined construction, capability-owned gateway vocabulary, explicit command binding, and reviewable field use—not additional command context types.
- **Risk — raw execution remains an escape hatch.** A context that exposes both a command runner and gateways lets implementations bypass domain seams. The composition rule must specify when raw execution is legitimate and keep it out of domain/workflow code where a Consumer Gateway exists.
- **Risk — compatibility scaffolding entrenches.** A bridge or dual route can become permanent. The proof must distinguish scaffolding permitted now from deletion markers assigned to the later migration contract.
- **Risk — the proof overfits Flow or presentation mechanics.** Cross-capability breadth and both-host execution are required to expose assumptions that a Flow-only or CLI-only design would miss.
- **Risk — quantitative simplification becomes line-count theater.** Measurements are supporting evidence, not the verdict. Interface depth, ownership locality, behavioral preservation, and absence of ambient dependencies remain primary.
- **Risk — deleted-stack evidence is stale.** Recoverable commits are an evidence cache, but current code and conventions control. Revalidate relevant seams before using old implementation choices.

## Open Questions

### Frontier

- What is the smallest complete SDK invocation interface required by the proof commands and current hosts?
- How does one capability root context remain explicit and testable without spawning command contexts or becoming a service locator?
- Which second capability and command provide the strongest contrasting proof?

### Fog

- The exact implementation batches remain unspecified until the invocation interface, capability composition rule, and proof set are settled.
- The boundary between temporary compatibility scaffolding and later migration deletion work depends on what the pressure-test prototype exposes.
- Whether the final decision merits a durable ADR or only glossary and author-documentation updates cannot be judged until alternatives and trade-offs are concrete.
- Capability-by-capability migration sequencing may require additional Question Rows after the representative proofs reveal dependency and host-coupling patterns.
