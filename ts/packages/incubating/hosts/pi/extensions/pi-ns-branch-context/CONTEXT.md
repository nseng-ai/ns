# @nseng-ai/pi-ns-branch-context

This context names the Pi host-adapter boundary for Branch Context. Canonical Branch Context vocabulary remains in [`@nseng-ai/branch-context`](../../../../extensions/branch-context/CONTEXT.md).

## Language

**Branch Context Pi host adapter**:
The incubating `@nseng-ai/pi-ns-branch-context` package under `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/`. It consumes portable Branch Context and Saved Plan behavior through `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api`, then presents it through Pi using neutral `@nseng-ai/pi-runtime/...` contracts.
*Avoid*: Branch Context domain owner, Branch Context Pi subpackage, `@nseng-ai/branch-context/pi`, private Branch Context source consumer

**Branch Context Pi command surface**:
The preserved `/ns:branch-context:*` commands and `/ns:plan:save` registered by the **Branch Context Pi host adapter**. The adapter owns Pi registration, prompt/status wording, saved-plan write tooling, session replacement, and parity metadata; command names and implementation-command formatting are stable consumer metadata owned by `@nseng-ai/branch-context/api`. Users can review plans separately with `grill-me`, `grill-with-docs`, `grilling`, or `domain-modeling`, or invoke the portable `plan-grill-and-save` skill when review should end with this adapter's retained Saved Plan writer. The skill has no Pi command wrapper.
*Avoid*: Pi-owned Branch Context semantics, duplicated command-name literals, host-specific plan-review UI names in the Branch Context API
