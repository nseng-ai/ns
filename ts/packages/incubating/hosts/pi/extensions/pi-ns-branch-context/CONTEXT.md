# @nseng-ai/pi-ns-branch-context

This context names the Pi host-adapter boundary for Branch Context. Canonical Branch Context vocabulary remains in [`@nseng-ai/branch-context`](../../../../extensions/branch-context/CONTEXT.md).

## Language

**Branch Context Pi host adapter**:
The incubating `@nseng-ai/pi-ns-branch-context` package under `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/`. It consumes portable Branch Context and Saved Plan behavior through `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api`, then presents it through Pi using neutral `@nseng-ai/pi-runtime/...` contracts.
*Avoid*: Branch Context domain owner, Branch Context Pi subpackage, `@nseng-ai/branch-context/pi`, private Branch Context source consumer

**Branch Context Pi command surface**:
The preserved `/ns:branch-context:*` and `/ns:plan:*` commands registered by the **Branch Context Pi host adapter**. The adapter owns Pi registration, prompt/status wording, Saved Plan command orchestration, Grill activation, session replacement, and parity metadata; command names and implementation-command formatting are stable consumer metadata owned by `@nseng-ai/branch-context/api`.
*Avoid*: Pi-owned Branch Context semantics, duplicated command-name literals, project-only Grill UI names in the Branch Context API

**Session Plan discovery**:
The Branch Context Pi host adapter's conservative classification of actionable plan material in a persisted Pi session. The adapter captures the exact effective `session-plan-discovery` skill, forks the persisted session into an isolated tool-less Pi process, and returns one of five bounded typed outcomes. Discovery owns evidence and candidate extraction. Each no-path Branch Context Pi consumer owns bounded candidate selection, mandatory semantic confirmation, and materialization; consumers do not use a latest-plan fallback. Version 1 reasons over the fork's effective constructed context and does not inspect raw JSONL entries compacted out of that context.
*Avoid*: deterministic Saved Plan selection, session transcript reconstruction, compaction-aware discovery, implicit current-plan authority
