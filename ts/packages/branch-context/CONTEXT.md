# @sdl/branch-context

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

**Branch Context Command Face**:
The CLI/Pi-facing shell that parses arguments, builds real **Gateways**, resolves host-context inputs, and formats user output.
*Avoid*: Branch Context Core, Peer API, presentation-neutral workflow

**Branch Context Peer API**:
The curated `@sdl/branch-context/api` surface used by sibling packages for in-process composition without broad package-root imports.
*Avoid*: private source import, command shell, root barrel contract

**Branch Context Core**:
Branch-context workflow logic over injected Git, Branch Memory, and Graphite **Gateways** plus resolved source values. It does not accept raw host context, construct real adapters, or format user-facing prose.
*Avoid*: command face, formatting helper, gateway bag, real adapter construction
