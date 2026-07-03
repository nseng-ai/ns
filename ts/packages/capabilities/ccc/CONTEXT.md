# @ji/ccc

`@ji/ccc` is CCC — Cmux Command and Control — the private TypeScript workspace layer for repo-opinionated orchestration across Pi, cmux, Graphite, Objectives, handoffs, branch-context workflows, and worktree flows. CCC is a container package: `core`, `autobranch`, and `cmux` compose lower-level capabilities through Pi-free orchestration interfaces, while the `pi` subpackage owns CCC-specific Pi registration and presentation wiring and is the only CCC unit that may import neutral `@ji/pi/...` helpers.

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
The dependency direction rule: CCC may depend on lower-level packages, CLIs, and provider **Capability APIs**, but only the CCC `pi` subpackage may depend on the Pi host. Pi-specific CCC command registration, acknowledgement/progress presentation, prompt/session formatting, machine-envelope parsing, and slash-command formatting belongs in the **CCC Pi subpackage**. Checked-in `.pi/extensions/*.ts` project-local adapters at the repo root may still register CCC-owned commands by importing `@ji/ccc/pi`, since they are not part of the `@ji/pi` package. CCC-owned Pi command surfaces use the `ccc` slash-command prefix; cmux wording is reserved for the external tool/workspace domain.
*Avoid*: circular helper import, direct `@ji/pi/...` imports from non-`pi` CCC subpackages, public API promise, compatibility alias.

**CCC Pi subpackage**:
The `@ji/ccc/pi` subpackage that presents CCC workflows inside Pi/cmux by importing CCC core APIs and neutral `@ji/pi/...` helper subpaths. It owns CCC-specific Pi-facing code while the rest of `@ji/ccc` exposes small Pi-free orchestration interfaces, preferably through `@ji/ccc/api`.
*Avoid*: CCC domain owner, Pi host internals package, pass-through shim, place for non-Pi orchestration logic.

**Lower capability**:
A package, CLI, gateway, or runtime module that owns one narrower primitive or domain operation for CCC to compose, such as neutral `@ji/pi/...` helper contracts, branch-context creation/loading, Branch Memory storage, Objective record access, Git/Graphite facts, command execution, Pi registration, or cmux workspace mutation.
*Avoid*: CCC submodule, orchestrator, command surface.

**Project-local adapter**:
A checked-in Pi extension file under `.pi/extensions/` that registers stable user-facing slash commands and delegates implementation. Project-local adapters are discovery and registration surfaces, not CCC itself.
*Avoid*: CCC package, lower capability, hidden command alias.

**CCC command surface**:
The CCC-owned Pi slash commands users invoke with the `ccc` prefix, such as `/ccc:workspace:*` and `/ccc:sidebar:*`. These commands may create or update cmux workspaces, but the command namespace names the command-and-control layer rather than the cmux tool.
*Avoid*: `/cmux:*` compatibility alias, cmux CLI command, generic Pi extension command.

**Stable non-`ccc` orchestration surface**:
A public Pi command whose user-facing namespace remains outside `ccc` while CCC may compose repo-opinionated behavior through lower Capability APIs, such as `/objective:stack-impl` or `/ns:flow:land`. Autobranch is now public ji lifecycle surface `ns flow autobranch` / `/ns:flow:autobranch`, with `ccc exec autobranch` retained as hidden internal compatibility over Flow-owned behavior.
*Avoid*: compatibility alias, evidence that namespace alone determines domain ownership, old `/code:*` lifecycle alias.

**Objective stack implementation orchestration**:
The CCC-owned launch/orchestration path behind public `/objective:stack-impl`: active Objective selection handoff, skill expansion or fallback prompt construction, and dispatching one explicit Objective selector into the portable stack-implementation skill. Objective record storage, list/current/update/next/close/archive semantics remain lower capabilities.
*Avoid*: Objective store, Objective CLI semantics, normal Objective update workflow, new `/ccc:*` alias for stack implementation.

**Autobranch compatibility flow**:
The hidden CCC `ccc exec autobranch` wrapper retained for internal compatibility, consuming Flow-owned autobranch behavior through the Flow Capability API while adapting CCC CLI dependencies and checkpoint-message helpers. The public ji lifecycle boundary is `ns flow autobranch` / `/ns:flow:autobranch`.
*Avoid*: public Pi registration adapter, current `/ns:flow:autobranch` surface, checkpoint primitive owner, plain branch creation helper, old `/code:autobranch` alias.

**Flow land consumption**:
The CCC composition path behind public unified `/ns:flow:land`, consuming Flow-owned land behavior through `@ji/flow/api` for strict Graphite stack-shape discovery, isolated single-PR squash merging into `gt trunk`, stack-mode PR metadata validation/update prompts, managed landing-slot cleanup, bottom-to-current squash merges, and post-merge Graphite refresh/delete/restack/submit maintenance.
*Avoid*: Pi registration adapter, separate stack landing command, Flow land internals owner, general GitHub lifecycle owner, lower Graphite/GitHub gateway, old `/code:land` alias.

**Portable command progress**:
Human-facing intermediate progress for CCC workflows that can run through both ji CLI and Pi command mirrors. The canonical seam is SDK `SdlCommandIo`, threaded through lower orchestration and adapted at the edge to CLI `onOutput`/stderr, durable notifications, or Pi-rendered messages without duplication.
*Avoid*: Pi-only status as a CLI progress solution, bespoke per-command progress sink, machine-readable event protocol, final result summary.

**Worktree status observability**:
The CCC-owned operational model and presentation for repository status surfaced through the `worktree-status` Pi renderer: Branch Memory scope summaries, Graphite metadata-derived down/up state, branch-local commit marker, dirty marker, Graphite metadata diagnostics, and PR hyperlink rendering.
*Avoid*: Pi footer lifecycle, session manager, filesystem watcher scheduling, Branch Memory storage owner, Graphite primitive owner.

**Graphite metadata status**:
A passive CCC worktree-status fact derived from Graphite's local metadata database to identify the current branch parent, children, and trunk state without shelling out to `gt branch info` for presentation.
*Avoid*: Graphite command gateway, mutation policy, full stack lifecycle owner.

**Autobranch preparation**:
The deterministic pre-transaction plan for the autobranch flow: choose a branch slug/name and collect facts before moving work. Dirty-worktree preparation also prepares a checkpoint message; clean latest-commit preparation inspects trunk/upstream/parent shape and derives a slug from the existing commit message and diff.
*Avoid*: branch transaction, stash operation, model prompt alone.

**Autobranch transaction**:
The mutating autobranch dirty-worktree sequence that creates a Graphite branch from dirty worktree changes by stashing, creating the branch, restoring changes, and writing a checkpoint commit.
*Avoid*: latest-commit extraction, preparation, reusable checkpoint message generation.

**Latest-commit autobranch transaction**:
The clean-worktree autobranch mutation path that creates a recovery branch, resets the source branch to the parent, creates the Graphite branch, hard-resets it to the original commit SHA, verifies the SHA, and cleans up recovery evidence.
*Avoid*: dirty-worktree stash path, plain `gt create`, landing command.

**Orchestration candidate**:
An existing command flow that likely belongs in CCC once behavior is moved deliberately, including cmux workspace/sidebar flows, branch-context upstack implementation sessions, handoff-tab, remaining source-control wrappers, and worktree-status behavior.
*Avoid*: moved implementation, immediate dependency, completed consolidation.
