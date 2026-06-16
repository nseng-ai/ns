# @asdl/ccc

`@asdl/ccc` is CCC — Cmux Command and Control — the private TypeScript workspace layer for repo-opinionated orchestration across Pi, cmux, Graphite, Objectives, handoffs, branch-context workflows, and worktree flows. CCC composes lower-level capabilities; those lower-level packages and runtime modules must not import CCC.

## Language

**CCC**:
The durable private TypeScript layer for coordinating multi-step, repo-opinionated command-and-control workflows that span Pi command surfaces, cmux workspaces, Graphite stack operations, Objective implementation, handoff continuation, branch-context implementation, autobranch/unified-land behavior, and worktree-status presentation.
*Avoid*: public slash-command namespace, published npm package, replacement for cmux, replacement for Graphite, generic automation framework.

**Cmux Command and Control**:
The expanded name of CCC. It emphasizes that CCC owns orchestration around cmux-oriented command flows, not cmux itself and not every Pi extension.
*Avoid*: cmux CLI, cmux backend, command registry.

**CCC orchestration layer**:
The package-level implementation home for workflows that must compose multiple lower capabilities into one coherent command path. It may coordinate branch preparation, workspace opening, child Pi dispatch, deterministic evidence collection, and presentation handoff when those concerns belong to one repo workflow.
*Avoid*: primitive gateway, storage backend, UI adapter, one-off script.

**CCC boundary**:
The dependency direction rule: CCC may depend on lower-level packages, CLIs, and runtime capabilities that expose primitive operations, but lower-level packages must not import `@asdl/ccc`. CCC-owned Pi command surfaces use the `ccc` slash-command prefix; cmux wording is reserved for the external tool/workspace domain.
*Avoid*: circular helper import, public API promise, compatibility alias.

**Lower capability**:
A package, CLI, gateway, or runtime module that owns one narrower primitive or domain operation for CCC to compose, such as `@asdl/pi-extension-runtime` helper contracts, branch-context creation/loading, Branch Memory storage, Objective record access, Git/Graphite facts, command execution, Pi registration, or cmux workspace mutation.
*Avoid*: CCC submodule, orchestrator, command surface.

**Project-local adapter**:
A checked-in Pi extension file under `.pi/extensions/` that registers stable user-facing slash commands and delegates implementation. Project-local adapters are discovery and registration surfaces, not CCC itself.
*Avoid*: CCC package, lower capability, hidden command alias.

**CCC command surface**:
The CCC-owned Pi slash commands users invoke with the `ccc` prefix, such as `/ccc:workspace:*` and `/ccc:sidebar:*`. These commands may create or update cmux workspaces, but the command namespace names the command-and-control layer rather than the cmux tool.
*Avoid*: `/cmux:*` compatibility alias, cmux CLI command, generic Pi extension command.

**Stable non-`ccc` orchestration surface**:
A public Pi command whose user-facing namespace remains outside `ccc` while CCC owns the repo-opinionated implementation behind it, such as `/objective:stack-impl`, `/sdl:code:autobranch`, or `/sdl:code:land`.
*Avoid*: compatibility alias, evidence that the lower adapter owns the workflow policy, old `/code:*` lifecycle alias.

**Objective stack implementation orchestration**:
The CCC-owned launch/orchestration path behind public `/objective:stack-impl`: active Objective selection handoff, skill expansion or fallback prompt construction, and dispatching one explicit Objective selector into the portable stack-implementation skill. Objective record storage, list/current/update/next/close/archive semantics remain lower capabilities.
*Avoid*: Objective store, Objective CLI semantics, normal Objective update workflow, new `/ccc:*` alias for stack implementation.

**Autobranch orchestration**:
The CCC-owned implementation behind public `/sdl:code:autobranch`, composing pending-worktree inspection, branch slug/name preparation, Graphite branch creation, stash/restore or latest-commit recovery mechanics, and checkpoint commit primitives into one repo source-control command flow.
*Avoid*: Pi registration adapter, checkpoint primitive owner, plain branch creation helper, old `/code:autobranch` alias.

**Land orchestration**:
The CCC-owned implementation behind public unified `/sdl:code:land`, coordinating strict Graphite stack-shape discovery, isolated single-PR squash merging into `gt trunk`, stack-mode PR metadata validation/update prompts, managed landing-slot cleanup, bottom-to-current squash merges, and post-merge Graphite refresh/delete/restack/submit maintenance.
*Avoid*: Pi registration adapter, separate stack landing command, general GitHub lifecycle owner, lower Graphite/GitHub gateway, old `/code:land` alias.

**Worktree status observability**:
The CCC-owned operational model and presentation for repository status surfaced through the `worktree-status` Pi renderer: Branch Memory scope summaries, Graphite metadata-derived down/up state, branch-local commit marker, dirty marker, Graphite metadata diagnostics, and PR hyperlink rendering.
*Avoid*: Pi footer lifecycle, session manager, filesystem watcher scheduling, Branch Memory storage owner, Graphite primitive owner.

**Graphite metadata status**:
A passive CCC worktree-status fact derived from Graphite's local metadata database to identify the current branch parent, children, and trunk state without shelling out to `gt branch info` for presentation.
*Avoid*: Graphite command gateway, mutation policy, full stack lifecycle owner.

**Autobranch preparation**:
The deterministic pre-transaction plan for `/sdl:code:autobranch`: choose a branch slug/name and collect facts before moving work. Dirty-worktree preparation also prepares a checkpoint message; clean latest-commit preparation inspects trunk/upstream/parent shape and derives a slug from the existing commit message and diff.
*Avoid*: branch transaction, stash operation, model prompt alone.

**Autobranch transaction**:
The mutating `/sdl:code:autobranch` sequence that creates a Graphite branch from dirty worktree changes by stashing, creating the branch, restoring changes, and writing a checkpoint commit.
*Avoid*: latest-commit extraction, preparation, reusable checkpoint message generation.

**Latest-commit autobranch transaction**:
The clean-worktree `/sdl:code:autobranch` mutation path that creates a recovery branch, resets the source branch to the parent, creates the Graphite branch, hard-resets it to the original commit SHA, verifies the SHA, and cleans up recovery evidence.
*Avoid*: dirty-worktree stash path, plain `gt create`, landing command.

**Orchestration candidate**:
An existing command flow that likely belongs in CCC once behavior is moved deliberately, including cmux workspace/sidebar flows, branch-context upstack implementation sessions, handoff-tab, remaining source-control wrappers, and worktree-status behavior.
*Avoid*: moved implementation, immediate dependency, completed consolidation.
