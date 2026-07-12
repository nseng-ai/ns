# @nseng-ai/cmux

`@nseng-ai/cmux` is CCC — Cmux Command and Control — the private TypeScript workspace layer for repo-opinionated orchestration across Pi, cmux, Graphite, Objectives, handoffs, branch-context workflows, and worktree flows. CCC is a container package: `core` and `cmux` compose lower-level capabilities through Pi-free orchestration interfaces, while the `pi` subpackage owns CCC-specific Pi registration and presentation wiring and is the only CCC unit that may import neutral `@nseng-ai/pi/...` helpers.

## Language

**CCC**:
The durable private TypeScript layer for coordinating multi-step, repo-opinionated command-and-control workflows that span Pi command surfaces, cmux workspaces, Graphite stack operations, Objective implementation, handoff continuation, branch-context implementation, unified-land behavior, and worktree-status presentation.
*Avoid*: public slash-command namespace, published npm package, replacement for cmux, replacement for Graphite, generic automation framework.

**Cmux Command and Control**:
The expanded name of CCC. It emphasizes that CCC owns orchestration around cmux-oriented command flows, not cmux itself and not every Pi extension.
*Avoid*: cmux CLI, cmux backend, command registry.

**CCC orchestration layer**:
The package-level implementation home for workflows that must compose multiple lower capabilities into one coherent command path. It may coordinate branch preparation, workspace opening, child Pi dispatch, deterministic evidence collection, and presentation handoff when those concerns belong to one repo workflow.
*Avoid*: primitive gateway, storage backend, UI adapter, one-off script.

**CCC boundary**:
The dependency direction rule: CCC may depend on lower-level packages, CLIs, and provider **Capability APIs**, but only the CCC `pi` subpackage may depend on the Pi host. Pi-specific CCC command registration, acknowledgement/progress presentation, prompt/session formatting, machine-envelope parsing, and slash-command formatting belongs in the **CCC Pi subpackage**. Checked-in `.pi/extensions/*.ts` project-local adapters at the repo root may still register CCC-owned commands by importing `@nseng-ai/cmux/pi`, since they are not part of the `@nseng-ai/pi` package. CCC-owned Pi command surfaces use the `ns:ccc` extension surface; cmux wording is reserved for the external tool/workspace domain.
*Avoid*: circular helper import, direct `@nseng-ai/pi/...` imports from non-`pi` CCC subpackages, public API promise, compatibility alias.

**CCC Pi subpackage**:
The `@nseng-ai/cmux/pi` subpackage that presents CCC workflows inside Pi/cmux by importing CCC core APIs and neutral `@nseng-ai/pi/...` helper subpaths. It owns CCC-specific Pi-facing code while the rest of `@nseng-ai/cmux` exposes small Pi-free orchestration interfaces, preferably through `@nseng-ai/cmux/api`.
*Avoid*: CCC domain owner, Pi host internals package, pass-through shim, place for non-Pi orchestration logic.

**Lower capability**:
A package, CLI, gateway, or runtime module that owns one narrower primitive or domain operation for CCC to compose, such as neutral `@nseng-ai/pi/...` helper contracts, branch-context creation/loading, Branch Memory storage, Objective record access, Git/Graphite facts, command execution, Pi registration, or cmux workspace mutation.
*Avoid*: CCC submodule, orchestrator, command surface.

**Project-local adapter**:
A checked-in Pi extension file under `.pi/extensions/` that registers stable user-facing slash commands and delegates implementation. Project-local adapters are discovery and registration surfaces, not CCC itself.
*Avoid*: CCC package, lower capability, hidden command alias.

**CCC command surface**:
The CCC-owned Pi slash commands users invoke through the `ns:ccc` extension surface, such as `/ns:cmux:workspace:*` and `/ns:cmux:sidebar:*`. These commands may create or update cmux workspaces, but the command namespace names the command-and-control layer rather than the cmux tool.
*Avoid*: `/cmux:*` compatibility alias, cmux CLI command, generic Pi extension command, legacy top-level CCC alias.

**Stable non-CCC orchestration surface**:
A public Pi command whose user-facing namespace remains outside `ns:ccc` while CCC may compose repo-opinionated behavior through lower Capability APIs, such as `/ns:objective:stack-impl` or `/ns:flow:land`. Autobranch is a public Flow lifecycle surface at `ns flow autobranch` / `/ns:flow:autobranch`, not a CCC command.
*Avoid*: compatibility alias, evidence that namespace alone determines domain ownership, old `/code:*` lifecycle alias.

**Objective stack implementation orchestration**:
The CCC-owned launch/orchestration path behind public `/ns:objective:stack-impl`: active Objective selection handoff, skill expansion or fallback prompt construction, and dispatching one explicit Objective selector into the portable stack-implementation skill. Objective record storage, list/current/update/next/close/delete semantics remain lower capabilities.
*Avoid*: Objective store, Objective CLI semantics, normal Objective update workflow, new `/ns:cmux:*` alias for stack implementation.

**Portable command progress**:
Human-facing intermediate progress for CCC workflows that can run through both ns CLI and Pi command mirrors. The canonical seam is SDK `NsCommandIo`, threaded through lower orchestration and adapted at the edge to CLI `onOutput`/stderr, durable notifications, or Pi-rendered messages without duplication.
*Avoid*: Pi-only status as a CLI progress solution, bespoke per-command progress sink, machine-readable event protocol, final result summary.

**Worktree status observability**:
The CCC-owned operational model and presentation for repository status surfaced through the `worktree-status` Pi renderer: Branch Memory scope summaries, Graphite metadata-derived down/up state, branch-local commit marker, dirty marker, Graphite metadata diagnostics, and PR hyperlink rendering.
*Avoid*: Pi footer lifecycle, session manager, filesystem watcher scheduling, Branch Memory storage owner, Graphite primitive owner.

**Graphite metadata status**:
A passive CCC worktree-status fact derived from Graphite's local metadata database to identify the current branch parent, children, and trunk state without shelling out to `gt branch info` for presentation.
*Avoid*: Graphite command gateway, mutation policy, full stack lifecycle owner.

**Orchestration candidate**:
An existing command flow that likely belongs in CCC once behavior is moved deliberately, including cmux workspace/sidebar flows, branch-context upstack implementation sessions, handoff-tab, remaining source-control wrappers, and worktree-status behavior.
*Avoid*: moved implementation, immediate dependency, completed consolidation.
