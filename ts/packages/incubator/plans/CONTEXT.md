# @nseng-ai/plans

This context captures domain language for saved implementation plans and their local store.

## Language

**Saved Plan**:
A Markdown implementation plan saved in the machine-local XDG enriched-plan store for later implementation or branch-context attachment.
*Avoid*: hidden task, handoff artifact, Branch Memory entry

**Local Plan Store**:
The XDG state tree under `$XDG_STATE_HOME/ns/enriched-plan/<repo>/<encoded-source-branch>/` (default `$HOME/.local/state/ns/enriched-plan/...`) that stores **Saved Plan** files by repository identity and source branch.
*Avoid*: Branch Memory, repo checkout, cache database

**Source Branch Plan File**:
A **Saved Plan** file tied to the source branch that produced it. The source branch affects the local plan-store path; it is not the future implementation branch.
*Avoid*: attached plan, implementation branch plan, handoff locator

**Saved-Plan Selection**:
The workflow that chooses an explicit, session-evidence, or latest **Saved Plan** while validating repository, source-branch, filename, slug, and path-containment evidence.
*Avoid*: branch-context selection, arbitrary Markdown lookup, unsafe fallback

**Plan Store Directory Evidence**:
The repository identity, source branch, encoded path keys, and directory path facts used to validate **Saved Plan** evidence before selecting a file.
*Avoid*: untrusted session metadata, branch context, attachment evidence

The package's command surface (the CLI/Pi-facing shell that parses user intent, constructs real **Gateways** at the edge, writes/lists/selects plans, and presents user-facing output) and its domain logic (saved-plan path, evidence, and selection functions that take resolved evidence or injected **Gateways** rather than raw host context, and may perform filesystem I/O through an explicit gateway or already-resolved path evidence) are ordinary architectural layers, not defined terms.

**Plans extension package API**:
The curated `@nseng-ai/plans/api` surface used by downstream consumer packages and their tests for in-process saved-plan composition without broad package-root imports. It includes saved-plan path, evidence, selection, and slug-prompt helpers needed by consumer composition and test fixtures. Owning `@nseng-ai/plans` tests may still import the package root when covering root compatibility.
*Avoid*: private source import, command shell, root barrel contract
