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
The workflow that derives a target operation, delegates branch creation to the selected **Branch Creation Provider**, and stores an **Attached Plan** from a selected saved-plan source.
*Avoid*: plan saving, handoff creation, provider-specific branch ceremony

**Branch Creation Provider**:
The repository-selected seam that creates one named branch from an explicit start point for **Branch Context Creation**. `[workflow].branch-creation` selects the closed built-in set `plain-git` or `graphite`; absence means `plain-git`, invalid configuration fails closed, and ordinary invocations cannot override it. User-defined provider registration remains deferred. Additive pre/post ceremony remains separate hook Points.
*Avoid*: operation Point, ambient Graphite gateway, stack provider

**Branch Context Attach**:
The workflow that attaches an existing plan source to a branch-context key while preserving Branch Memory namespace and key invariants.
*Avoid*: Branch Memory put, saved-plan write, handoff pickup

The package's command surface (the CLI/Pi-facing shell that parses arguments, lazily builds the selected real **Gateways**, resolves host-context inputs, and formats user output) and its domain logic (branch-context workflow logic over injected Git, Branch Memory, and **Branch Creation Provider** seams plus resolved source values, which does not accept raw host context, construct real adapters, or format user-facing prose) are ordinary architectural layers, not defined terms. That domain logic's dependency on `@nseng-ai/plans` is intentional for saved-plan sources, naming, validation, and selection.

**Branch Context extension package API**:
The curated `@nseng-ai/branch-context/api` surface used by downstream consumer packages and their tests for in-process composition without broad package-root imports. It owns portable Branch Context behavior: Branch Memory attachment semantics, saved-plan-to-**Attached Plan** behavior, attached-plan loading, implementation prompt content, branch-context evidence, gateway-injected helpers for branch creation, attachment, and existing-branch reuse, plus stable command-name metadata and `formatImplBranchContextCommand` needed by non-Pi consumers. Owning `@nseng-ai/branch-context` tests may still import the package root when covering root compatibility.
*Avoid*: private source import, command shell, root barrel contract, Pi registration or presentation

**Branch Context Pi host adapter**:
The separate `@nseng-ai/pi-ns-branch-context` package that owns concrete Pi slash-command registration, prompt/status presentation, saved-plan write tooling, Grill activation, and session replacement while consuming Branch Context behavior through `@nseng-ai/branch-context/api` and Saved Plan behavior through `@nseng-ai/plans/api`. Command-name constants remain portable extension API metadata so Skill Exposure and Herdr can refer to the stable surfaces without depending on a host adapter. Project-only Grill UI names do not belong in the Branch Context API.
*Avoid*: Branch Context Pi subpackage, `@nseng-ai/branch-context/pi`, private source import, Pi-owned Branch Context semantics
