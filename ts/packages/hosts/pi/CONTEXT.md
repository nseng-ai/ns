# @sdl/pi

`@sdl/pi` is the unified private TypeScript workspace package for this repository's Pi runtime integration. It contains both neutral Pi helper subpaths consumed by other workspace packages and engineered project-local Pi extension implementations used by `.pi/extensions/*.ts` discovery adapters. CCC (`@sdl/ccc`) remains the separate orchestration layer for repo-opinionated command-and-control workflows; after the single-package cutover CCC may consume neutral `@sdl/pi/...` helper subpaths, while `@sdl/pi` no longer imports or declares `@sdl/ccc`, so the dependency runs one way (CCC → neutral Pi helpers).

## Language

**Unified Pi package**:
The private workspace package at `ts/packages/pi/` named `@sdl/pi`. It replaces the former split between Pi command constants, neutral runtime helpers, and engineered project-local extension modules.
*Avoid*: compatibility shim, old package facade, published npm API.

**Project-local Pi extension surface**:
The checked-in `.pi/extensions/*.ts` files that Pi auto-discovers for this repository.
*Avoid*: global extension, npm package entry point, CLI plugin.

**Discovery adapter**:
A thin project-local extension file whose job is to register Pi commands or tools by importing implementation code from `ts/packages/pi/src/`.
*Avoid*: package export, shim as implementation, generated extension.

**Engineered Pi implementation domain**:
A tested implementation area under `ts/packages/pi/src/<domain>/` for project-local Pi behavior such as Branch Context, Handoff, Objective commands, runner subagents, grill UI, PR views, worktree status, SDL flow mirrors, terminal presentation, and command registration helpers.
*Avoid*: old package boundary, leaf package, one root barrel.

**Neutral Pi helper subpath**:
A curated `@sdl/pi/...` package export for helper code intentionally reusable by other workspace packages, including command acknowledgement, command I/O, command names, branch slug normalization, machine-envelope parsing, Objective selection/list/picker helpers, session replacement, skill expansion, terminal presentation, runner-subagent usage, and cmux/Pi runtime types.
*Avoid*: project-local extension entrypoint, CCC orchestration, private source deep import.

**Project-local extension entrypoint**:
An implementation module under `ts/packages/pi/src/` that registers a Pi command family or model-visible tool through the Pi host. Lower packages should not import these entrypoints as helpers; use neutral helper subpaths or a lower package API instead.
*Avoid*: neutral helper, package facade, public npm API.

**CCC orchestration layer**:
The private TypeScript workspace package at `ts/packages/ccc/` for repo-opinionated workflows spanning Pi, cmux, Graphite, Objectives, handoffs, branch-context workflows, source-control flows, and worktree-status observability. CCC owns orchestration policy; Pi owns discovery, registration, and Pi-native presentation adapters.
*Avoid*: Pi discovery adapter, lower capability package, public npm API.

**Pi command namespace**:
The first segment before `:` in a repo-owned Pi slash command, chosen by workflow ownership rather than implementation file. `/pi:*` names Pi-native UI/session affordances; `/ccc:*` names command-and-control or cmux/session orchestration; `/sdl:flow:*` names SDL lifecycle mirrors; `/handoff:*` names durable Handoff artifact lifecycle operations.
*Avoid*: package path, visibility flag, arbitrary grouping, legacy top-level aliases.

**Immediate command acknowledgement**:
The command-registration requirement that repo-owned Pi slash commands acknowledge receipt synchronously before waiting for idle state or starting slow work. Use `@sdl/pi/commands/ack` helpers rather than hand-writing acknowledgement behavior.
*Avoid*: post-work status only, hidden progress, per-command bespoke acknowledgement.

**Tool-call parity boundary**:
The parity-review convention that Pi model-visible tools are host-native bridges, not standalone parity metadata rows. The command workflow that depends on a tool owns any required fallback documentation.
*Avoid*: custom-tool parity row, hidden command surface, tool as workflow owner.

**Runner subagent**:
A fresh Pi subprocess launched by a parent extension with an isolated conversation and explicit return mode.
*Avoid*: queued slash command, child thread, transcript scrape.

**Terminal capture**:
A runner-subagent return mode where a generated runtime extension registers capture-only terminal tools whose validated input becomes the parent result.
*Avoid*: tool side effect, assistant final answer, stdout scrape.

**Final-text result**:
A runner-subagent return mode where the parent accepts the child assistant's final useful text as the result.
*Avoid*: terminal capture, transcript import, custom message.

**Worktree status adapter**:
The Pi lifecycle module behind `.pi/extensions/worktree-status.ts`: registers the `worktree-status` renderer, reacts to session/tool/agent/shutdown events, manages active-session cancellation, watches Git/Branch Memory/worktree paths, installs the custom footer, and renders generic cwd/session/model/context/token/cost footer lines, while the repo-operational status facts and their presentation are owned by CCC's worktree-status observability model and consumed through neutral seams, not by `@sdl/pi` importing `@sdl/ccc`.
*Avoid*: CCC observability fact owner, Graphite metadata parser owner, Branch Memory storage owner.
