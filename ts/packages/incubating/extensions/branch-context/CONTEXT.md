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
The explicitly selected seam that creates one named branch from an explicit start point for **Branch Context Creation**. `plain-git` is the default adapter, `graphite` is opt-in, and additive pre/post ceremony remains separate hook Points.
*Avoid*: operation Point, ambient Graphite gateway, stack provider

**Branch Context Attach**:
The workflow that attaches an existing plan source to a branch-context key while preserving Branch Memory namespace and key invariants.
*Avoid*: Branch Memory put, saved-plan write, handoff pickup

The package's command surface (the CLI/Pi-facing shell that parses arguments, lazily selects the real **Branch Creation Provider**, resolves host-context inputs, and formats user output) and its domain logic (branch-context workflow logic over injected Git, Branch Memory, and **Branch Creation Provider** seams plus resolved source values) are ordinary architectural layers, not defined terms. The base **Branch Context** context contains command, Git, and Branch Memory collaborators only; plain Git creation does not construct Graphite. That domain logic's dependency on `@nseng-ai/plans` is intentional for saved-plan sources, naming, validation, and selection.

**Branch Context extension package API**:
The curated `@nseng-ai/branch-context/api` surface used by downstream consumer packages and their tests for in-process composition without broad package-root imports. It owns portable Branch Context behavior: preparation and collision selection, attachment to an already-created named branch, partial-failure evidence, attached-plan loading and saved-plan fallback, implementation prompt content and command formatting, branch-context evidence, provider-injected branch creation, and existing-branch reuse, plus stable command-name metadata and `formatImplBranchContextCommand` needed by non-Pi consumers. Owning `@nseng-ai/branch-context` tests may still import the package root when covering root compatibility.
*Avoid*: private source import, command shell, root barrel contract, Pi registration or presentation

**Branch Context Pi host adapter**:
The separate `@nseng-ai/pi-ns-branch-context` package that owns provider-independent and plain-Git Pi slash-command registration, prompt/status presentation, saved-plan write tooling, Grill activation, and session replacement while consuming Branch Context behavior through `@nseng-ai/branch-context/api` and Saved Plan behavior through `@nseng-ai/plans/api`. Graphite and GitHub Stacks command registration live in sibling `@nseng-ai/pi-ns-gt` and `@nseng-ai/pi-ns-gs` adapters. Command-name constants remain portable extension API metadata so Skill Exposure and Herdr can refer to stable provider-independent surfaces without depending on a host adapter. Project-only Grill UI names do not belong in the Branch Context API.
*Avoid*: Branch Context Pi subpackage, `@nseng-ai/branch-context/pi`, Graphite owner/default, private source import, Pi-owned Branch Context semantics
