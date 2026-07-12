# @nseng-ai/branch-context

This context captures domain language for attaching saved plans to implementation branches.

## Language

**Branch Context**:
Branch-scoped plan attachment state stored through Branch Memory namespace `branch-context`.
*Avoid*: handoff artifact, saved plan store, hidden session state

**Attached Plan**:
A named Markdown Branch Memory entry, usually `<slug>.md`, attached to a **Branch Context** for an implementation branch.
*Avoid*: source branch plan file, handoff, arbitrary Branch Memory note

**Branch Context Creation**:
The workflow that derives a target operation, creates or tracks a branch, and stores an **Attached Plan** from a selected saved-plan source.
*Avoid*: plan saving, handoff creation, generic branch creation

**Branch Context Attach**:
The workflow that attaches an existing plan source to a branch-context key while preserving Branch Memory namespace and key invariants.
*Avoid*: Branch Memory put, saved-plan write, handoff pickup

The package's command surface (the CLI/Pi-facing shell that parses arguments, builds real **Gateways**, resolves host-context inputs, and formats user output) and its domain logic (branch-context workflow logic over injected Git, Branch Memory, and Graphite **Gateways** plus resolved source values, which does not accept raw host context, construct real adapters, or format user-facing prose) are ordinary architectural layers, not defined terms. That domain logic's dependency on `@nseng-ai/plans` is intentional for saved-plan sources, naming, validation, and selection.

**Branch Context Capability API**:
The curated `@nseng-ai/branch-context/api` surface used by downstream consumer packages and their tests for in-process composition without broad package-root imports. It owns portable Branch Context behavior: Branch Memory attachment semantics, saved-plan-to-**Attached Plan** behavior, attached-plan loading, implementation prompt content, branch-context evidence, and gateway-injected helpers for branch creation, attachment, and existing-branch reuse. Owning `@nseng-ai/branch-context` tests may still import the package root when covering root compatibility.
*Avoid*: private source import, command shell, root barrel contract, Pi slash-command registry

**Branch Context Presentation Boundary**:
Concrete Pi slash-command registration and command names such as `/ns:branch-context:impl-attached-plan` are owned by the capability's own `pi` subpackage — `src/pi/surfaces.ts` defines the command-name constants and `registerBranchContextCommands` performs registration — with `hosts/pi` merely delegating via `@nseng-ai/branch-context/pi`. Branch Context core (non-`pi` code) must not depend on the Pi package because Pi is a Presentation Host above capabilities; importing Pi outside the `pi` subpackage would pull host-specific command surfaces into the Branch Context provider boundary.
*Avoid*: Capability API command-name export, duplicated Pi command string outside the `pi` subpackage, host-specific launch formatter in core
