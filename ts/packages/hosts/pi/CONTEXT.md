# @sdl/pi

`@sdl/pi` is the unified private TypeScript workspace package for this repository's Pi runtime integration. It contains neutral Pi helper subpaths consumed by other workspace packages and the remaining host-resident project-local Pi extension implementations used by `.pi/extensions/*.ts` discovery adapters. Pi presentation for domain capabilities may instead live in capability `pi` subpackages or capability-pi packages stacked above `@sdl/pi`; Pi-native standalone tools may live in Local Pi-tool packages. Those packages consume neutral host helpers while their discovery adapters import the owning package directly. CCC (`@sdl/ccc`) remains the separate orchestration layer for repo-opinionated command-and-control workflows; the `@sdl/ccc/pi` subpackage imports CCC core APIs and neutral `@sdl/pi/...` helpers so there are no direct `@sdl/ccc` imports from `@sdl/pi/...` and no `@sdl/pi` import or declaration of `@sdl/ccc`.

## Language

**Unified Pi package**:
The private workspace package at `ts/packages/hosts/pi/` named `@sdl/pi`. It replaces the former split between Pi command constants, neutral runtime helpers, and engineered project-local extension modules.
*Avoid*: compatibility shim, old package facade, published npm API.

**Project-local Pi extension surface**:
The checked-in `.pi/extensions/*.ts` files that Pi auto-discovers for this repository.
*Avoid*: global extension, npm package entry point, CLI plugin.

**Discovery adapter**:
A thin project-local extension file whose job is to register Pi commands or tools by importing implementation code from `ts/packages/hosts/pi/src/` or from another owning package when the Pi implementation has been extracted. For extracted Pi-tool and capability-pi packages, the adapter imports the owning package through its package exports so `@sdl/pi` does not become the tool or capability presentation consumer.
*Avoid*: package export, shim as implementation, generated extension, host-to-tool registry.

**Engineered Pi implementation domain**:
A tested host-resident implementation area under `ts/packages/hosts/pi/src/<domain>/` for project-local Pi behavior such as PR views, worktree status, terminal presentation, host-owned runtime helpers, and command registration helpers. Flow, CCC, Handoff, and Objective Pi presentation now live in each capability's `pi` subpackage; Branch Context still lives in its capability-pi package pending conversion.
*Avoid*: old package boundary, leaf package, one root barrel.

**Local Pi-tool package**:
A private workspace package under `ts/packages/local/pi-tools/src/<tool>/` for a Pi-native standalone tool extracted from the host, such as `@sdl-local/pi-tools/context-profiler`, `@sdl-local/pi-tools/grill`, `@sdl-local/pi-tools/thermo-council`, `@sdl-local/pi-tools/backing-skill-commands`, `@sdl-local/pi-tools/pr-previews`, or the dispatch-focused `@sdl-local/pi-tools/runner-subagents`. It owns its source, tests, and tool-specific parity metadata; may depend on neutral `@sdl/pi/...` helper/runtime subpaths; and is registered by a project-local discovery adapter without any `@sdl/pi` import of the tool package.
*Avoid*: Capability package, host subdirectory, neutral helper subpath, host dependency.

**Neutral Pi helper subpath**:
A curated `@sdl/pi/...` package export for helper code intentionally reusable by other workspace packages, capability-pi packages, or extracted Pi-tool packages, including command acknowledgement, command UI helpers, command I/O, command names, model-call and LM-JSON helpers, shared error/timer helpers, machine-envelope parsing, session replacement, skill expansion, terminal layout/presentation helpers, parity helpers, and cmux/Pi runtime/tool types. The current export map is intentionally limited to these neutral/runtime/presentation families: `commands/*`, `grill/surfaces`, `models/*`, `parity/*`, `runtime/*`, `sessions/replacement`, `skills/expansion`, `terminal/*`, and `shared/*`.
*Avoid*: project-local extension entrypoint, Pi-tool implementation, CCC orchestration, private source deep import.

**Project-local extension entrypoint**:
An implementation module under `ts/packages/hosts/pi/src/` or another owning package that registers a Pi command family or model-visible tool through the Pi host. Lower packages should not import these entrypoints as helpers; use neutral helper subpaths or a lower package API instead.
*Avoid*: neutral helper, package facade, public npm API.

**CCC orchestration layer**:
The private TypeScript workspace package at `ts/packages/capabilities/ccc/` for repo-opinionated workflows spanning Pi, cmux, Graphite, Objectives, handoffs, branch-context workflows, source-control flows, and worktree-status observability. CCC owns orchestration policy; Pi owns neutral host helpers and runtime primitives; the **CCC Pi subpackage** owns CCC-specific Pi registration and presentation.
*Avoid*: Pi discovery adapter, lower capability package, public npm API.

**CCC Pi subpackage**:
The `@sdl/ccc/pi` subpackage that wires CCC workflows into Pi/cmux presentation by importing CCC core APIs and neutral `@sdl/pi/...` helper subpaths. It is the home for CCC-specific Pi command registration, acknowledgement/progress wiring, prompt/session formatting, machine-envelope parsing, and slash-command formatting; `@sdl/pi` itself still must not import or declare `@sdl/ccc`.
*Avoid*: Pi host dependency on CCC, non-`pi` CCC subpackages importing Pi host helpers, generic local Pi-tool package.

**Pi command namespace**:
The first segment before `:` in a repo-owned Pi slash command, chosen by workflow ownership rather than implementation file. `/pi:*` names Pi-native UI/session affordances; `/ccc:*` names command-and-control or cmux/session orchestration; `/ji:flow:*` names SDL lifecycle mirrors; `/ji:branch-context:*` names Pi presentation for Branch Context workflows; `/handoff:*` names durable Handoff artifact lifecycle operations.
*Avoid*: package path, visibility flag, arbitrary grouping, legacy top-level aliases.

**Branch Context Pi command surface**:
The Pi-owned slash-command presentation for Branch Context workflows, including `/ji:branch-context:from-plan`, `/ji:branch-context:upstack-impl-from-plan`, `/ji:branch-context:impl-attached-plan`, and formatting an implementation launch command as `/ji:branch-context:impl-attached-plan <attached-key>` for Pi sessions or CCC Pi launch commands. Branch Context domain/API behavior stays in `@sdl/branch-context/api`; saved-plan selection behavior stays in `@sdl/plans/api`.
*Avoid*: Branch Context domain owner, attached-plan storage semantics, Saved Plan domain owner, Capability API replacement.

**Thin capability mirror**:
A host-resident Pi command surface whose durable lifecycle, selection, storage, or domain decisions are delegated to the owning Capability API while Pi keeps slash-command registration, prompt/status wording, picker/editor presentation, launch/session orchestration, or TUI behavior. Current thin-shell statuses: Handoff delegates artifact lifecycle and identity through `@sdl/handoff/api`; Branch Context + Plans delegate through `@sdl/branch-context/api` and `@sdl/plans/api`; Objective delegates list/candidate/selection behavior through `@sdl/objective/api`.
*Avoid*: Pi-tool package, duplicate domain owner, host-owned storage semantics, capability migration shortcut.

**PR feedback Pi presentation residue**:
The accepted remaining host-resident Pi presentation/session behavior around PR feedback workflows: editor prefill, stack-prompt assembly, live watch state, dirty-tree/idle gating, and prompt injection. PR feedback/check modal previews now live in the Local Pi-tool package `@sdl-local/pi-tools/pr-previews`; portable download/check/thread primitives belong to the Address Capability (`ji address exec ...` / `@sdl/address/api`); future reusable watch/fingerprint seams should move through a focused Address Capability/API follow-up.
*Avoid*: Pi-native tool candidate, PR feedback domain owner, Address Capability API owner.

**Immediate command acknowledgement**:
The command-registration requirement that repo-owned Pi slash commands acknowledge receipt synchronously before waiting for idle state or starting slow work. Use `@sdl/pi/commands/ack` helpers rather than hand-writing acknowledgement behavior.
*Avoid*: post-work status only, hidden progress, per-command bespoke acknowledgement.

**Tool-call parity boundary**:
The parity-review convention that Pi model-visible tools are host-native bridges, not standalone parity metadata rows. The command workflow that depends on a tool owns any required fallback documentation.
*Avoid*: custom-tool parity row, hidden command surface, tool as workflow owner.

**Runner subagent**:
A fresh Pi subprocess launched by a parent extension with an isolated conversation and explicit return mode. The model-visible dispatch tool and its shared runtime, process, JSON-event, and presentation helpers live in `@sdl-local/pi-tools/runner-subagents`; the package still consumes neutral `@sdl/pi/...` runtime/tool helper subpaths where it needs Pi host types or agent-definition loading.
*Avoid*: queued slash command, child thread, transcript scrape, forcing `@sdl/pi` to import the extracted dispatch package.

**Terminal helper surface**:
The neutral `@sdl/pi/terminal/*` layout and presentation subpaths owned by the Pi host and intentionally consumed by extracted Pi-tool packages and orchestration packages. Keep this surface in `@sdl/pi` unless a future extraction proves a smaller acyclic home without broad churn.
*Avoid*: standalone Pi-tool package, feature-domain implementation, terminal emulator ownership.

**Terminal capture**:
A runner-subagent return mode where a generated runtime extension registers capture-only terminal tools whose validated input becomes the parent result.
*Avoid*: tool side effect, assistant final answer, stdout scrape.

**Final-text result**:
A runner-subagent return mode where the parent accepts the child assistant's final useful text as the result.
*Avoid*: terminal capture, transcript import, custom message.

**Worktree status adapter**:
The Pi lifecycle module behind `.pi/extensions/worktree-status.ts`: registers the `worktree-status` renderer, reacts to session/tool/agent/shutdown events, manages active-session cancellation, watches Git/Branch Memory/worktree paths, installs the custom footer, and renders generic cwd/session/model/context/token/cost footer lines, while the repo-operational status facts and their presentation are owned by CCC's worktree-status observability model and consumed through neutral seams, not by `@sdl/pi` importing `@sdl/ccc`.
*Avoid*: CCC observability fact owner, Graphite metadata parser owner, Branch Memory storage owner.
