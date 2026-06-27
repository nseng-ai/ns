# @sdl/pi

`@sdl/pi` is the private TypeScript Pi Presentation Host for this repository. It owns Pi runtime integration, project-local discovery glue, neutral Pi helper/runtime subpaths, and thin Pi presentation shells. Standalone Pi-native tool packages stack on `@sdl/pi`; capability mirrors thin toward their owning Capability APIs. CCC (`@sdl/ccc`) remains the separate orchestration layer for repo-opinionated command-and-control workflows and may consume neutral `@sdl/pi/...` helper subpaths, while `@sdl/pi` does not import or declare `@sdl/ccc`, so the dependency runs one way (CCC → neutral Pi helpers).

## Language

**Pi Presentation Host**:
The private workspace package at `ts/packages/hosts/pi/` named `@sdl/pi`. It owns Pi runtime integration, project-local discovery adapters, neutral Pi helper/runtime subpaths, host-native parity helpers, and thin Pi presentation shells; it is not a home for standalone tool domains or capability domain logic.
*Avoid*: capability package, feature-domain warehouse, extracted tool package, public npm API.

**Project-local Pi extension surface**:
The checked-in `.pi/extensions/*.ts` files that Pi auto-discovers for this repository.
*Avoid*: global extension, npm package entry point, CLI plugin.

**Discovery adapter**:
A thin project-local extension file whose job is to register Pi commands or tools by importing implementation code from `ts/packages/hosts/pi/src/` or from another owning package when the Pi implementation has been extracted. When the owner is an extracted package, the adapter imports that package's source entrypoint directly because `.pi/extensions` discovery cannot rely on TypeScript workspace package exports.
*Avoid*: package export, shim as implementation, generated extension.

**Engineered Pi implementation domain**:
A tested implementation area under `ts/packages/hosts/pi/src/<domain>/` for Pi behavior still owned by the **Pi Presentation Host**, such as Branch Context, Handoff, Objective commands, runner subagents, grill UI, PR views, worktree status, SDL flow mirrors, terminal presentation, and command registration helpers.
*Avoid*: old package boundary, extracted tool package, one root barrel.

**Neutral Pi helper subpath**:
A curated `@sdl/pi/...` package export for helper or runtime code intentionally reusable by other workspace packages, including command acknowledgement, command I/O, command names, branch slug normalization, machine-envelope parsing, render/scroll helpers, LM JSON parsing, Objective selection/list/picker helpers, session replacement, skill expansion, terminal presentation, runner-subagent usage, and cmux/Pi runtime types.
*Avoid*: project-local extension entrypoint, CCC orchestration, private source deep import.

**Project-local extension entrypoint**:
An implementation module under `ts/packages/hosts/pi/src/` or another owning package that registers a Pi command family or model-visible tool through the Pi host. Lower packages should not import these entrypoints as helpers; use neutral helper subpaths or a lower package API instead.
*Avoid*: neutral helper, package facade, public npm API.

**Pi-native tool package**:
A private package under the Pi-tool tier, such as `ts/packages/pi-tools/<tool>/`, for a standalone Pi-native tool that stacks on `@sdl/pi`. It owns the tool's implementation, focused tests, project-local extension entrypoint, and parity metadata, while importing only neutral `@sdl/pi/...` helper/runtime/parity subpaths from the host. `@sdl/pi` must not import a Pi-native tool package.
*Avoid*: capability package, host helper subpath, discovery adapter, package pulled into the host registry.

**Capability mirror**:
A Pi command or tool surface that presents an SDL **Capability** through Pi. If it contains capability-specific decisions, thin it toward the owning package's **Capability API** instead of moving that domain into a Pi-native tool package.
*Avoid*: standalone Pi tool, host-owned capability domain, duplicated capability logic.

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

**Pi surface parity ownership**:
The package that owns a Pi command registration owns the matching parity metadata and focused parity test. An extracted Pi-native tool package keeps its parity record with the tool; the `@sdl/pi` host parity registry covers host-owned surfaces and must not import the extracted tool package.
*Avoid*: host registry as global package index, parity metadata without live-registration coverage, host-to-tool dependency for accounting.

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
