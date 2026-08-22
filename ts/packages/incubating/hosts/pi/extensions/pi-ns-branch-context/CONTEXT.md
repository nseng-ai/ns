# @nseng-ai/pi-ns-branch-context

This context names the Pi host-adapter boundary for Branch Context. Canonical Branch Context vocabulary remains in [`@nseng-ai/branch-context`](../../../../extensions/branch-context/CONTEXT.md).

## Language

**Branch Context Pi host adapter**:
The incubating `@nseng-ai/pi-ns-branch-context` package under `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/`. It consumes portable Branch Context and Saved Plan behavior through `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api`, then presents it through Pi using neutral `@nseng-ai/pi-runtime/...` contracts.
*Avoid*: Branch Context domain owner, Branch Context Pi subpackage, `@nseng-ai/branch-context/pi`, private Branch Context source consumer

**Branch Context Pi command surface**:
The preserved `/ns:branch-context:*` and `/ns:plan:*` commands registered by the **Branch Context Pi host adapter**. The adapter owns Pi registration, prompt/status wording, Saved Plan authoring prompts, Grill activation, fresh-session orchestration, and parity metadata; deterministic saving is delegated to the hidden `enriched-plan exec save --content-file` CLI, not a model-visible write tool. Command names and implementation-command formatting are stable consumer metadata owned by `@nseng-ai/branch-context/api`. Branch Context resumption session artifacts remain separate evidence for reusing an Attached Plan; they do not select Saved Plans.
*Avoid*: Pi-owned Branch Context semantics, Saved Plan session evidence, `write_saved_plan_file`, duplicated command-name literals, project-only Grill UI names in the Branch Context API
