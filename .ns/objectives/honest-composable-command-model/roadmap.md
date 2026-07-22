# Roadmap

## Work

- [ ] **Specify the host-varying invocation contract**
  - Type: grilling
  - Question: What is the smallest complete SDK invocation interface required by the representative commands and the existing ns CLI and Pi hosts, including field semantics, lifetimes, result/event ownership, interaction behavior, and explicit exclusions?
  - Blocked by: none
  - Evidence: a settled interface sketch names every field’s current consumer and explicitly excludes catalog/discovery, stable collaborators, raw execution, and hypothetical-host facilities that have not earned a place.

- [ ] **Specify the single capability-context composition rule**
  - Type: grilling
  - Question: How is each capability’s one root collaborator context constructed, narrowed through Consumer Gateways, bound into command definitions, and used by tests without creating command/workflow contexts, exposing raw execution escape hatches, or mixing per-invocation facts into stable collaborators?
  - Blocked by: none
  - Evidence: the rule covers production composition roots, fake construction, gateway-channel identity, command binding, dependency visibility, and the service-locator failure mode.

- [ ] **Select the cross-capability proof command and evidence baseline**
  - Type: grilling
  - Question: Which second capability and command, alongside Flow `changes` and `submit`, best test capability-context ownership and host portability, and what current code, tests, glue, and host behavior form the before-state evidence for all three proofs?
  - Blocked by: none
  - Evidence: the selected command exercises a materially different collaborator or interaction shape, and the baseline records relevant implementation, adapters, tests, and both-host behavior without repeating broad reconnaissance.

- [ ] **Pressure-test the model against the proof set**
  - Type: prototype
  - Question: Does a concrete, non-production design sketch for Flow `changes`, Flow `submit`, and the selected second-capability command remain coherent through both ns CLI and Pi execution while preserving one context per capability and avoiding faked process primitives?
  - Blocked by: Specify the host-varying invocation contract; Specify the single capability-context composition rule; Select the cross-capability proof command and evidence baseline.
  - Evidence: a linked prototype or design sketch exercises construction, binding, invocation, events/results, interactions, and testing for all proof commands; findings identify any model revision before implementation.

- [ ] **Settle bounded coexistence and compatibility scaffolding**
  - Type: grilling
  - Question: What temporary adapters or dual-routing behavior may the proving Objective introduce, what invariants prevent them from becoming a second permanent model, and which deletion markers belong to the later full migration rather than this proof?
  - Blocked by: Pressure-test the model against the proof set.
  - Evidence: every permitted bridge has a bounded purpose and named later deletion target; indefinite coexistence is explicitly rejected.

- [ ] **Define proof success and failure criteria**
  - Type: grilling
  - Question: Which qualitative invariants and quantitative before/after measurements determine whether the model passed, needs revision, or should be rejected before a full migration is recommended?
  - Blocked by: Pressure-test the model against the proof set.
  - Evidence: criteria cover ownership, interface depth, host behavior, testability, adapter/glue change, and ambient-dependency escape hatches; thresholds lead to adopt, revise, or reject outcomes rather than automatic adoption.

- [ ] **Define the full-migration contract**
  - Type: grilling
  - Question: What inventory, compatibility obligations, deletion targets, sequencing constraints, documentation changes, and evidence must the proving Objective record so a later session can scope the repository-wide migration without repeating architectural discovery?
  - Blocked by: Settle bounded coexistence and compatibility scaffolding; Define proof success and failure criteria.
  - Evidence: the required artifact shape and contents are settled, including treatment of legacy commands that do not fit in-process composable execution.

- [ ] **Crystallize the proof implementation roadmap**
  - Type: task
  - Question: Replace the resolved Question Rows with the fewest dependency-ordered implementation slices that deliver the settled proof, evidence report, and migration contract without expanding into the full migration.
  - Blocked by: Specify the host-varying invocation contract; Specify the single capability-context composition rule; Select the cross-capability proof command and evidence baseline; Settle bounded coexistence and compatibility scaffolding; Define proof success and failure criteria; Define the full-migration contract.
  - Evidence: `objective.md` reflects settled decisions and remaining risks; this roadmap contains ordinary executable slices rather than an ideation Frontier; Fog is empty or explicitly parked beyond the destination.

## Parked

- Repository-wide migration away from `NsExtensionApi` or the surviving legacy execution/context surface, to be scoped from this Objective’s migration contract.
- Deletion of all compatibility bridges and legacy routes not required to complete the representative proof.
- Migration of commands beyond Flow `changes`, Flow `submit`, and the selected second-capability command.
- New command hosts and subprocess hosting enhancements for command forms not exercised by existing ns CLI and Pi paths.
- Broad generic Clinkr redesign, extension discovery/descriptor redesign, and provider gateway consolidation.
