# Honest Composable Command Model

## Destination

Produce an implementation-ready Objective definition for an honest composable command execution model. The SDK exposes only host-varying invocation facts and channels; every capability owns exactly one stable collaborator context; no cross-capability `FirstPartyCommandContext` exists.

The Objective must prove the model with simple and maximal Flow commands plus one command from a second capability through the existing ns CLI and Pi paths, record complexity and glue evidence, and produce a written contract for a later full migration away from the legacy execution/context surface.

## Notes

- This is a planning map. It produces an implementation-ready Objective definition, not implementation and not the Objective record itself.
- Use the `grilling`, `domain-modeling`, and `codebase-design` disciplines while resolving design tickets.
- Start from the recoverable deleted `composable-command-core` stack as evidence, not as an architecture to restore unchanged. Its final tip is `e9cf6d97fe0835039f28047060f9113e5e09f943`; its lineage includes `bc4d62a5e`, `ac8fe6b20`, `132b8784e`, `49b4f2921`, and `4b95cd600`.
- The deleted stack successfully explored composable command definitions, semantic events, SDK host-edge rendering, and the `flow cp` / `flow changes` ports. It did not complete the maximal `flow submit` pressure test or its migration verdict.
- `FirstPartyCommandContext` is rejected: it groups dependencies by “first-party command” rather than capability ownership, exposes raw execution beside gateways, and risks recreating `NsExtensionApi` as another ambient dependency bag.
- Every capability has exactly one named root collaborator context. Do not introduce command-, operation-, or workflow-specific dependency contexts. Invocation facts remain separate from stable collaborators.
- The universal SDK invocation interface is restricted to facts and channels that genuinely vary by host or invocation. Catalog/discovery, libraries, gateways, model facilities, and raw execution do not belong in command handlers merely because they are broadly useful.
- The proving Objective will not perform the full legacy migration. Its evidence must end in a written, actionable migration contract; opening a follow-up Objective is not part of this destination.
- Consult `docs/conventions/consumer-gateways-and-command-shape.md` before settling context construction or gateway shape. Capability contexts expose capability-owned Consumer Gateways rather than full provider contracts where practical.
- Preserve the repository’s current vocabulary from `CONTEXT-MAP.md`, root `CONTEXT.md`, `ts/packages/sdk/CONTEXT.md`, and `ts/packages/capabilities/flow/CONTEXT.md`. Record new glossary terms only when the model genuinely introduces them.

## Decisions so far

<!-- Closed tickets are indexed here. The detail lives only in each ticket's Resolution. -->

## Not yet specified

- The Objective roadmap’s exact implementation batches remain foggy until the invocation interface, capability composition rules, and proof cases are settled.
- The precise boundary between temporary compatibility scaffolding and the later full-migration contract depends on what the proof prototype exposes.
- Whether the settled model requires a durable ADR or only glossary/documentation updates cannot be judged until the alternatives and trade-offs are concrete.
- The migration contract’s capability-by-capability sequencing may need further questions after the representative proof cases reveal dependency and host-coupling patterns.

## Out of scope

- Performing the command refactor or creating the fresh Objective during this wayfinding effort.
- Completing the repository-wide migration away from `NsExtensionApi` or any successor legacy execution/context surface.
- Redesigning extension packaging, descriptors, discovery, precedence, or catalog loading.
- A broad redesign of generic Clinkr mechanics. Only narrow ns SDK adapter requirements may enter the future Objective.
- Consolidating or relocating provider gateway implementations as a side effect of command work.
- Adding a new command host. The proof uses the existing ns CLI and Pi paths.
- Treating indefinite coexistence of legacy and composable execution as a successful destination.

## Tickets

### Specify the host-varying invocation contract

- type: grilling
- status: open

**Question:** What is the smallest complete SDK invocation interface required by the representative commands and the existing ns CLI and Pi hosts, including field semantics, lifetimes, result/event ownership, interaction behavior, and explicit exclusions?

**Resolution:**

### Specify the single capability-context composition rule

- type: grilling
- status: open

**Question:** How is each capability’s one root collaborator context constructed, narrowed through Consumer Gateways, bound into command definitions, and used by tests without creating command/workflow contexts, exposing raw execution escape hatches, or mixing per-invocation facts into stable collaborators?

**Resolution:**

### Select the cross-capability proof command and evidence baseline

- type: grilling
- status: open

**Question:** Which second capability and command, alongside Flow `changes` and `submit`, best test capability-context ownership and host portability, and what current code, tests, glue, and host behavior form the before-state evidence for all three proofs?

**Resolution:**

### Pressure-test the model against the proof set

- type: prototype
- status: open
- blocked by: [Specify the host-varying invocation contract](#specify-the-host-varying-invocation-contract), [Specify the single capability-context composition rule](#specify-the-single-capability-context-composition-rule), [Select the cross-capability proof command and evidence baseline](#select-the-cross-capability-proof-command-and-evidence-baseline)

**Question:** Does a concrete, non-production design sketch for Flow `changes`, Flow `submit`, and the selected second-capability command remain coherent through both ns CLI and Pi execution while preserving one context per capability and avoiding faked process primitives?

**Resolution:**

### Settle bounded coexistence and compatibility scaffolding

- type: grilling
- status: open
- blocked by: [Pressure-test the model against the proof set](#pressure-test-the-model-against-the-proof-set)

**Question:** What temporary adapters or dual-routing behavior may the proving Objective introduce, what invariants prevent them from becoming a second permanent model, and which deletion markers belong to the later full migration rather than this proof?

**Resolution:**

### Define proof success and failure criteria

- type: grilling
- status: open
- blocked by: [Pressure-test the model against the proof set](#pressure-test-the-model-against-the-proof-set)

**Question:** Which qualitative invariants and quantitative before/after measurements determine whether the model passed, needs revision, or should be rejected before a full migration is recommended?

**Resolution:**

### Define the full-migration contract

- type: grilling
- status: open
- blocked by: [Settle bounded coexistence and compatibility scaffolding](#settle-bounded-coexistence-and-compatibility-scaffolding), [Define proof success and failure criteria](#define-proof-success-and-failure-criteria)

**Question:** What inventory, compatibility obligations, deletion targets, sequencing constraints, documentation changes, and evidence must the proving Objective record so a later session can scope the repository-wide migration without repeating architectural discovery?

**Resolution:**

### Assemble the implementation-ready Objective definition

- type: task
- status: open
- blocked by: [Specify the host-varying invocation contract](#specify-the-host-varying-invocation-contract), [Specify the single capability-context composition rule](#specify-the-single-capability-context-composition-rule), [Select the cross-capability proof command and evidence baseline](#select-the-cross-capability-proof-command-and-evidence-baseline), [Settle bounded coexistence and compatibility scaffolding](#settle-bounded-coexistence-and-compatibility-scaffolding), [Define proof success and failure criteria](#define-proof-success-and-failure-criteria), [Define the full-migration contract](#define-the-full-migration-contract)

**Question:** Consolidate the settled ticket decisions into a reviewed Objective definition containing thesis, scope, non-goals, architectural invariants, completion criteria, evidence plan, risks, and a dependency-ordered roadmap suitable for fresh Objective creation.

**Resolution:**
