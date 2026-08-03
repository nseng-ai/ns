# @nseng-ai/pi-ns-branch-context

This context names the Pi host-adapter boundary for Branch Context. Canonical Branch Context vocabulary remains in [`@nseng-ai/branch-context`](../../../../extensions/branch-context/CONTEXT.md).

## Language

**Branch Context Pi host adapter**:
The incubating `@nseng-ai/pi-ns-branch-context` package under `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/`. It consumes portable Branch Context behavior, including prepared repository-selected branch creation, through `@nseng-ai/branch-context/api` and Saved Plan behavior through `@nseng-ai/plans/api`, then presents it through Pi using neutral `@nseng-ai/pi-runtime/...` contracts.
*Avoid*: Branch Context domain owner, Branch Context Pi subpackage, `@nseng-ai/branch-context/pi`, private Branch Context source consumer

**Branch Context Pi command surface**:
The preserved `/ns:branch-context:*` and `/ns:plan:*` commands registered by the **Branch Context Pi host adapter**. The adapter owns Pi registration, prompt/status wording, saved-plan write tooling, Grill activation, session replacement, and parity metadata; command names and implementation-command formatting are stable consumer metadata owned by `@nseng-ai/branch-context/api`.
*Avoid*: Pi-owned Branch Context semantics, duplicated command-name literals, project-only Grill UI names in the Branch Context API
