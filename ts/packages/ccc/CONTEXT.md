# @asdl/ccc

`@asdl/ccc` is CCC — Cmux Command and Control — the private TypeScript workspace layer for repo-opinionated orchestration across Pi, cmux, Graphite, Objectives, handoffs, planned branches, and worktree flows. CCC composes lower-level capabilities; those lower-level packages and runtime modules must not import CCC.

## Language

**CCC**:
The durable private TypeScript layer for coordinating multi-step, repo-opinionated command-and-control workflows that span Pi command surfaces, cmux workspaces, Graphite stack operations, Objective implementation, handoff continuation, planned-branch execution, autobranch/land behavior, and worktree-status presentation.
_Avoid_: public slash-command namespace, published npm package, replacement for cmux, replacement for Graphite, generic automation framework.

**Cmux Command and Control**:
The expanded name of CCC. It emphasizes that CCC owns orchestration around cmux-oriented command flows, not cmux itself and not every Pi extension.
_Avoid_: cmux CLI, cmux backend, command registry.

**CCC orchestration layer**:
The package-level implementation home for workflows that must compose multiple lower capabilities into one coherent command path. It may coordinate branch preparation, workspace opening, child Pi dispatch, deterministic evidence collection, and presentation handoff when those concerns belong to one repo workflow.
_Avoid_: primitive gateway, storage backend, UI adapter, one-off script.

**CCC boundary**:
The dependency direction rule: CCC may depend on lower-level packages, CLIs, and runtime capabilities that expose primitive operations, but lower-level packages must not import `@asdl/ccc`. CCC-owned Pi command surfaces use the `ccc` slash-command prefix; cmux wording is reserved for the external tool/workspace domain.
_Avoid_: circular helper import, public API promise, compatibility alias.

**Lower capability**:
A package, CLI, gateway, or runtime module that owns one narrower primitive or domain operation for CCC to compose, such as `@asdl/pi-extension-runtime` helper contracts, planned-branch creation/loading, Branch Memory storage, Objective record access, Git/Graphite facts, command execution, Pi registration, or cmux workspace mutation.
_Avoid_: CCC submodule, orchestrator, command surface.

**Project-local adapter**:
A checked-in Pi extension file under `.pi/extensions/` that registers stable user-facing slash commands and delegates implementation. Project-local adapters are discovery and registration surfaces, not CCC itself.
_Avoid_: CCC package, lower capability, hidden command alias.

**CCC command surface**:
The CCC-owned Pi slash commands users invoke with the `ccc` prefix, such as `/ccc:workspace:*` and `/ccc:sidebar:*`. These commands may create or update cmux workspaces, but the command namespace names the command-and-control layer rather than the cmux tool.
_Avoid_: `/cmux:*` compatibility alias, cmux CLI command, generic Pi extension command.

**Objective stack implementation orchestration**:
The CCC-owned launch/orchestration path behind public `/objective:stack-impl`: active Objective selection handoff, skill expansion or fallback prompt construction, and dispatching one explicit Objective selector into the portable stack-implementation skill. Objective record storage, list/current/update/next/close/archive semantics remain lower capabilities.
_Avoid_: Objective store, Objective CLI semantics, normal Objective update workflow, new `/ccc:*` alias for stack implementation.

**Orchestration candidate**:
An existing command flow that likely belongs in CCC once behavior is moved deliberately, including cmux workspace/sidebar flows, planned-branch up-and-impl, handoff-tab, autobranch/land, and worktree-status behavior.
_Avoid_: moved implementation, immediate dependency, completed consolidation.
