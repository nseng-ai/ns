# @nseng-ai/pi-ns-branch-context

This context names the Pi host-adapter boundary for Branch Context. Canonical Branch Context vocabulary remains in [`@nseng-ai/branch-context`](../../../../extensions/branch-context/CONTEXT.md).

## Language

**Branch Context Pi host adapter**:
The incubating `@nseng-ai/pi-ns-branch-context` package under `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/`. It consumes portable Branch Context and Saved Plan behavior through `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api`, then presents it through Pi using neutral `@nseng-ai/pi-runtime/...` contracts.
*Avoid*: Branch Context domain owner, Branch Context Pi subpackage, `@nseng-ai/branch-context/pi`, private Branch Context source consumer

**Branch Context Pi command surface**:
The provider-independent `/ns:branch-context:*` and `/ns:plan:*` commands plus the plain-Git `/ns:git:new-branch-from-plan` and `/ns:git:impl-branch-from-plan` pair registered by the **Branch Context Pi host adapter**. The adapter owns Pi registration, prompt/status wording, saved-plan write tooling, Grill activation, session replacement, and parity metadata; command names and implementation-command formatting are stable consumer metadata owned by `@nseng-ai/branch-context/api`. Graphite and GitHub Stacks command ownership belongs to `@nseng-ai/pi-ns-gt` and `@nseng-ai/pi-ns-gs`. All three `impl-branch-from-plan` commands are strict Saved Plan creation surfaces with no existing-Attached-Plan fallback; continuing an existing branch uses provider-independent `/ns:branch-context:impl-attached-plan [<key>]`.
*Avoid*: Pi-owned Branch Context semantics, Graphite owner, ambient Graphite default, duplicated command-name literals, project-only Grill UI names in the Branch Context API
