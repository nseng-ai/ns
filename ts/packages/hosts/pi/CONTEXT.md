# @nseng-ai/pi

`@nseng-ai/pi` is the unified private TypeScript workspace package for this repository's Pi runtime integration. It contains neutral Pi helper subpaths consumed by other workspace packages and the remaining host-resident project-local Pi extension implementations used by `.pi/extensions/*.ts` discovery adapters. Pi presentation for domain capabilities may instead live in capability `pi` subpackages stacked above `@nseng-ai/pi`; Pi-native standalone tools may live in Internal Pi-tool packages. Those packages consume neutral host helpers while their discovery adapters import the owning package directly. The cmux capability (`@nseng-ai/cmux`) separately drives cmux workspaces; its `pi` subpackage imports cmux core APIs and neutral `@nseng-ai/pi/...` helpers, while `@nseng-ai/pi` neither imports nor declares `@nseng-ai/cmux`.

## Language

**Pi (the harness)**:
The third-party coding-agent harness this repository integrates with, built by Earendil and shipped as `@earendil-works/pi-coding-agent`. ns consumes Pi's extension, command, and library surfaces but does not own or control Pi itself: upstream API or behavior changes can only be absorbed, never made, and designs must not assume ns can fix or extend Pi upstream.
*Avoid*: ns-owned harness, first-party Pi, our Pi.

**Unified Pi package**:
The private workspace package at `ts/packages/hosts/pi/` named `@nseng-ai/pi`. It replaces the former split between Pi command constants, neutral runtime helpers, and engineered project-local extension modules.
*Avoid*: compatibility shim, old package facade, published npm API.

**Project-local Pi extension surface**:
The checked-in `.pi/extensions/*.ts` files that Pi auto-discovers for this repository.
*Avoid*: global extension, npm package entry point, CLI plugin.

**Discovery adapter**:
A thin project-local extension file whose job is to register Pi commands or tools by importing implementation code from `ts/packages/hosts/pi/src/` or from another owning package when the Pi implementation has been extracted. For extracted Pi-tool packages and capability `pi` subpackages, the adapter imports the owning package through its package exports so `@nseng-ai/pi` does not become the tool or capability presentation consumer.
*Avoid*: package export, shim as implementation, generated extension, host-to-tool registry.

**Engineered Pi implementation domain**:
A tested host-resident implementation area under `ts/packages/hosts/pi/src/<domain>/` for project-local Pi behavior such as PR views, worktree status, terminal presentation, host-owned runtime helpers, and command registration helpers. Flow, cmux, Handoff, Branch Context, and Objective Pi presentation now live in each capability's `pi` subpackage.
*Avoid*: old package boundary, leaf package, one root barrel.

**Internal Pi-tool package**:
A private workspace package for a Pi-native standalone tool extracted from the host, usually under `ts/packages/internal/pi-tools/src/<tool>/` (for example `@internal/pi-tools/context-profiler`, `@internal/pi-tools/grill`, `@internal/pi-tools/thermo-council`, `@internal/pi-tools/backing-skill-commands`, and `@internal/pi-tools/pr-previews`) or, for the subagent tools, under `@internal/ns-pi-subagents/runner-subagents`. It owns its source, tests, and tool-specific parity metadata; may depend on neutral `@nseng-ai/pi/...` helper/runtime subpaths; and is registered by a project-local discovery adapter without any `@nseng-ai/pi` import of the tool package.
*Avoid*: Local Pi-tool package, Capability package, host subdirectory, neutral helper subpath, host dependency.

**Neutral Pi helper subpath**:
A curated `@nseng-ai/pi/...` package export for helper code intentionally reusable by other workspace packages, capability `pi` subpackages, or extracted Pi-tool packages, including command acknowledgement, command UI helpers, command I/O, command names, model-call and LM-JSON helpers, shared error/timer helpers, machine-envelope parsing, session replacement, skill expansion, terminal layout/presentation helpers, parity helpers, and cmux/Pi runtime/tool types. The current export map is intentionally limited to these neutral/runtime/presentation families: `commands/*`, `grill/surfaces`, `models/*`, `parity/*`, `runtime/*`, `sessions/replacement`, `skills/*`, `terminal/*`, `shared/*`, and `worktree-status` — plus `worktree-status/extension`, which is a project-local extension entrypoint carried in the export map for `.pi/extensions` loading, not a neutral helper family.
*Avoid*: project-local extension entrypoint, Pi-tool implementation, cmux capability workflow, private source deep import.

**Project-local extension entrypoint**:
An implementation module under `ts/packages/hosts/pi/src/` or another owning package that registers a Pi command family or model-visible tool through the Pi host. Lower packages should not import these entrypoints as helpers; use neutral helper subpaths or a lower package API instead.
*Avoid*: neutral helper, package facade, public npm API.

**cmux capability**:
The private first-party capability at `@nseng-ai/cmux` that drives cmux workspaces for dispatch, sidebar, workspace-summary, and planning flows. Pi owns neutral host helpers and runtime primitives rather than the cmux workflow domain.
*Avoid*: Pi discovery adapter, generic orchestration layer, public npm API.

**cmux Pi subpackage**:
The `@nseng-ai/cmux/pi` subpackage that presents cmux capability workflows by importing cmux core APIs and neutral `@nseng-ai/pi/...` helper subpaths. It owns cmux-specific Pi command registration and presentation while `@nseng-ai/pi` neither imports nor declares `@nseng-ai/cmux`.
*Avoid*: Pi host dependency on cmux, non-`pi` cmux subpackages importing Pi host helpers, generic Internal Pi-tool package.

**Pi command namespace**:
The colon-separated repo-owned Pi slash command surface chosen by workflow ownership rather than implementation file. First-party product and orchestration commands default to `/ns:<extension>:...`, such as `/ns:cmux:*`, `/ns:objective:*`, `/ns:handoff:*`, `/ns:flow:*`, and `/ns:branch-context:*`; `/pi:*` remains reserved for Pi-native UI/session affordances.
*Avoid*: package path, visibility flag, arbitrary grouping, legacy top-level aliases.

**Branch Context Pi command surface**:
The Pi-owned slash-command presentation for Branch Context workflows, including `/ns:branch-context:from-plan`, `/ns:branch-context:upstack-impl-from-plan`, `/ns:branch-context:impl-attached-plan`, and formatting an implementation launch command as `/ns:branch-context:impl-attached-plan <attached-key>` for Pi sessions or cmux capability launch commands. Branch Context domain/API behavior stays in `@nseng-ai/branch-context/api`; saved-plan selection behavior stays in `@nseng-ai/plans/api`.
*Avoid*: Branch Context domain owner, attached-plan storage semantics, Saved Plan domain owner, Capability API replacement.

**Thin capability mirror**:
A host-resident Pi command surface whose durable lifecycle, selection, storage, or domain decisions are delegated to the owning Capability API while Pi keeps slash-command registration, prompt/status wording, picker/editor presentation, launch/session orchestration, or TUI behavior. Current thin-shell statuses: Handoff delegates artifact lifecycle and identity through `@nseng-ai/handoffs/api`; Branch Context + Plans delegate through `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api`; Objective delegates list/candidate/selection behavior through `@nseng-ai/objectives/api`.
*Avoid*: Pi-tool package, duplicate domain owner, host-owned storage semantics, capability migration shortcut.

**PR feedback Pi presentation residue**:
The accepted remaining host-resident Pi presentation/session behavior around PR feedback workflows: editor prefill, stack-prompt assembly, live watch state, dirty-tree/idle gating, and prompt injection. PR feedback/check modal previews now live in the Internal Pi-tool package `@internal/pi-tools/pr-previews`; portable download/check/thread primitives belong to the Address Capability (`ns address exec ...` / `@nseng-ai/pr-feedback/api`); future reusable watch/fingerprint seams should move through a focused Address Capability/API follow-up.
*Avoid*: Pi-native tool candidate, PR feedback domain owner, Address Capability API owner.

**Immediate command acknowledgement**:
The command-registration requirement that repo-owned Pi slash commands acknowledge receipt synchronously before waiting for idle state or starting slow work. Use `@nseng-ai/pi/commands/ack` helpers rather than hand-writing acknowledgement behavior.
*Avoid*: post-work status only, hidden progress, per-command bespoke acknowledgement.

**Tool-call parity boundary**:
The parity-review convention that Pi model-visible tools are host-native bridges, not standalone parity metadata rows. The command workflow that depends on a tool owns any required fallback documentation.
*Avoid*: custom-tool parity row, hidden command surface, tool as workflow owner.

**Runner subagent**:
A fresh Pi subprocess launched by a parent extension with an isolated conversation and explicit return mode. The model-visible dispatch tool and its shared runtime, process, JSON-event, and presentation helpers live in `@internal/ns-pi-subagents/runner-subagents`; the package still consumes neutral `@nseng-ai/pi/...` runtime/tool helper subpaths where it needs Pi host types or agent-definition loading.
*Avoid*: queued slash command, child thread, transcript scrape, forcing `@nseng-ai/pi` to import the extracted dispatch package.

**Terminal helper surface**:
The neutral `@nseng-ai/pi/terminal/*` layout and presentation subpaths owned by the Pi host and intentionally consumed by extracted Pi-tool packages and orchestration packages. Keep this surface in `@nseng-ai/pi` unless a future extraction proves a smaller acyclic home without broad churn.
*Avoid*: standalone Pi-tool package, feature-domain implementation, terminal emulator ownership.

**Terminal capture**:
A runner-subagent return mode where a generated runtime extension registers capture-only terminal tools whose validated input becomes the parent result.
*Avoid*: tool side effect, assistant final answer, stdout scrape.

**Final-text result**:
A runner-subagent return mode where the parent accepts the child assistant's final useful text as the result.
*Avoid*: terminal capture, transcript import, custom message.

**Worktree status observability**:
The host-owned operational status model and presentation that combines worktree identity, Branch Memory scope, Graphite stack facts, local commit and dirty markers, metadata diagnostics, and GitHub PR state for Pi's footer.
*Avoid*: cmux capability workflow, Git status replacement, Branch Memory storage

**Graphite metadata status**:
A passive **Worktree status observability** fact derived from Graphite's local metadata to identify the current branch's parent, children, trunk relationship, and stack counts without invoking `gt` for presentation.
*Avoid*: Graphite mutation, full stack lifecycle, shell-command status

**Worktree status adapter**:
The Pi lifecycle module behind `.pi/extensions/worktree-status.ts`: it registers the renderer and refresh command, manages session cancellation and watched paths, and installs the custom footer over host-owned **Worktree status observability**.
*Avoid*: Graphite metadata parser owner, Branch Memory storage owner, cmux capability adapter
