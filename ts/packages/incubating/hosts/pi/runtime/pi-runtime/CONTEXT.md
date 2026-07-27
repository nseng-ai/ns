# @nseng-ai/pi-runtime

`@nseng-ai/pi-runtime` is the unified TypeScript workspace package for this repository's Pi runtime integration, at incubating disposition under `ts/packages/incubating/hosts/pi/runtime/`. It contains neutral Pi helper subpaths consumed by other workspace packages and the remaining host-resident project-local Pi extension implementations used by `.pi/extensions/*.ts` discovery adapters. Pi presentation for ns extension domains may live in a separate `pi-ns-<domain>` host-adapter package or, while the broader extraction remains incomplete, in the owning extension's `pi` subpackage stacked above `@nseng-ai/pi-runtime`; Pi-native standalone tools may live in Internal Pi-tool packages. Those packages consume neutral host helpers while their discovery adapters import the owning package directly. Generic Flow mirrors and stack squash live in `@nseng-ai/flow/pi`, while the repo-specific code-workflow picker and smart-restack presentation live in `@internal/pi-tools/code-workflows` and meet only in project-local discovery composition. The Herdr extension separately drives Herdr spaces, tabs, and responsible implementation workflows; its `pi` subpackage imports Herdr core APIs and neutral `@nseng-ai/pi-runtime/...` helpers.

## Language

**Pi (the harness)**:
The third-party coding-agent harness this repository integrates with, built by Earendil and shipped as `@earendil-works/pi-coding-agent`. ns consumes Pi's extension, command, and library surfaces but does not own or control Pi itself: upstream API or behavior changes can only be absorbed, never made, and designs must not assume ns can fix or extend Pi upstream.
*Avoid*: ns-owned harness, first-party Pi, our Pi.

**Pi Runtime package**:
The workspace package at `ts/packages/incubating/hosts/pi/runtime/pi-runtime/` named `@nseng-ai/pi-runtime`. Its **Release disposition** is incubating, so it is still `private: true` and unpublished while its external contract is unwarranted. It replaces the former split between Pi command constants, neutral runtime helpers, and engineered project-local extension modules. The old identity `@nseng-ai/pi` was a hard cutover with no alias or forwarding package (ADR 0045).
*Avoid*: `@nseng-ai/pi` (retired name), unified Pi package (retired phrasing), compatibility shim, old package facade, published npm API.

**Project-local Pi extension surface**:
The checked-in `.pi/extensions/*.ts` files that Pi auto-discovers for this repository.
*Avoid*: global extension, npm package entry point, CLI plugin.

**Discovery adapter**:
A thin project-local extension file whose job is to register Pi commands or tools by importing implementation code from `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/` or from another owning package when the Pi implementation has been extracted. For extracted Pi-tool packages and extension `pi` subpackages, the adapter imports the owning package through its package exports so `@nseng-ai/pi-runtime` does not become the tool or extension presentation consumer.
*Avoid*: package export, shim as implementation, generated extension, host-to-tool registry.

**Engineered Pi implementation domain**:
A tested host-resident implementation area under `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/<domain>/` for project-local Pi behavior such as PR views, worktree status, terminal presentation, host-owned runtime helpers, and command registration helpers. Flow, Herdr, Handoff, and Branch Context Pi presentation currently live in each extension's `pi` subpackage. Objective Pi presentation is implemented separately in `@nseng-ai/pi-ns-objectives`, consuming `@nseng-ai/objectives/api`; that feature-branch extraction has not landed or been published, and the broader Pi separation remains incomplete.
*Avoid*: old package boundary, leaf package, one root barrel, Objectives Pi subpackage.

**Internal Pi-tool package**:
A private workspace package for a Pi-native standalone tool extracted from the host, usually under `ts/packages/internal/hosts/pi/tools/pi-tools/src/<tool>/` (for example `@internal/pi-tools/code-workflows`, `@internal/pi-tools/context-profiler`, `@internal/pi-tools/grill`, `@internal/pi-tools/thermo-council`, and `@internal/pi-tools/backing-skill-commands`) or, for the subagent tools, under `@internal/ns-pi-subagents/runner-subagents`. It owns its source, tests, and tool-specific parity metadata; may depend on neutral `@nseng-ai/pi-runtime/...` helper/runtime subpaths; and is registered by a project-local discovery adapter without any `@nseng-ai/pi-runtime` import of the tool package.
*Avoid*: Local Pi-tool package, ns extension package, host subdirectory, neutral helper subpath, host dependency.

**Neutral Pi helper subpath**:
A curated `@nseng-ai/pi-runtime/...` package export for helper code intentionally reusable by other workspace packages, extension `pi` subpackages, or extracted Pi-tool packages, including command acknowledgement, command UI helpers, command I/O, command names, model-call and LM-JSON helpers, shared error/timer helpers, machine-envelope parsing, session replacement, skill expansion, terminal layout/presentation helpers, parity helpers, and Pi runtime/tool types. The current export map is intentionally limited to these neutral/runtime/presentation families: `commands/*`, `grill/surfaces`, `models/*`, `parity/*`, `runtime/*`, `sessions/replacement`, `skills/*`, `terminal/*`, `shared/*`, and `worktree-status` — plus `worktree-status/extension`, which is a project-local extension entrypoint carried in the export map for `.pi/extensions` loading, not a neutral helper family.
*Avoid*: project-local extension entrypoint, Pi-tool implementation, Herdr extension workflow, private source deep import.

**Project-local extension entrypoint**:
An implementation module under `ts/packages/incubating/hosts/pi/runtime/pi-runtime/src/` or another owning package that registers a Pi command family or model-visible tool through the Pi host. Lower packages should not import these entrypoints as helpers; use neutral helper subpaths or a lower package API instead.
*Avoid*: neutral helper, package facade, public npm API.

**Herdr Pi subpackage**:
The `@nseng-ai/herdr/pi` subpackage presents Herdr's resource-first space and tab operations plus `/ns:herdr:impl:prompt:space`, `/ns:herdr:impl:plan:space`, and `/ns:herdr:impl:plan:tab`. Each `impl` command implements a prompt or Saved Plan while preserving the existing agent instructions and workflow behavior. Prepared Herdr Launch and Pi launch remain destination/process startup mechanics beneath the workflow; `ns-impl` identifies prompt transport/storage for implementation workflows, and Handoff launch remains specific to the durable Handoff integration.
*Avoid*: Pi host ownership of Herdr, non-`pi` Herdr subpackages importing Pi host helpers, generic Internal Pi-tool package, implementation commands under `/ns:herdr:launch:*`.

**Pi command namespace**:
The colon-separated repo-owned Pi slash command surface chosen by workflow ownership rather than implementation file. First-party product and orchestration commands default to `/ns:<extension>:...`, such as `/ns:herdr:*`, `/ns:objective:*`, `/ns:handoff:*`, `/ns:flow:*`, and `/ns:branch-context:*`; `/pi:*` remains reserved for Pi-native UI/session affordances.
*Avoid*: package path, visibility flag, arbitrary grouping, legacy top-level aliases.

**Branch Context Pi command surface**:
The Pi-owned slash-command presentation for Branch Context workflows, including `/ns:branch-context:from-plan`, `/ns:branch-context:upstack-impl-from-plan`, `/ns:branch-context:impl-attached-plan`, and formatting an implementation launch command as `/ns:branch-context:impl-attached-plan <attached-key>` for Pi sessions or Herdr launch commands. Branch Context domain/API behavior stays in `@nseng-ai/branch-context/api`; saved-plan selection behavior stays in `@nseng-ai/plans/api`.
*Avoid*: Branch Context domain owner, attached-plan storage semantics, Saved Plan domain owner, extension-package-API replacement.

**Thin extension mirror**:
A Pi command surface whose durable lifecycle, selection, storage, or domain decisions are delegated to the owning extension package API while the host adapter keeps slash-command registration, prompt/status wording, picker/editor presentation, launch/session orchestration, or TUI behavior. Current statuses: Handoff delegates artifact lifecycle and identity through `@nseng-ai/handoffs/api`; Branch Context + Plans delegate through `@nseng-ai/branch-context/api` and `@nseng-ai/plans/api`; the extracted `@nseng-ai/pi-ns-objectives` package delegates list/candidate/selection behavior through `@nseng-ai/objectives/api`.
*Avoid*: Pi-tool package, duplicate domain owner, host-owned storage semantics, extension migration shortcut.

**PR feedback Pi presentation residue**:
The accepted remaining host-resident Pi presentation/session behavior around PR feedback workflows: editor prefill, stack-prompt assembly, live watch state, dirty-tree/idle gating, and prompt injection. Stack-wide review-thread and check presentation lives in stack-view; portable download/check/thread primitives belong to the Address extension (`ns address exec ...` / `@nseng-ai/pr-feedback/api`); future reusable watch/fingerprint seams should move through a focused Address extension/API follow-up.
*Avoid*: Pi-native tool candidate, PR feedback domain owner, Address extension-package-API owner.

**Immediate command acknowledgement**:
The command-registration requirement that repo-owned Pi slash commands acknowledge receipt synchronously before waiting for idle state or starting slow work. Use `@nseng-ai/pi-runtime/commands/ack` helpers rather than hand-writing acknowledgement behavior.
*Avoid*: post-work status only, hidden progress, per-command bespoke acknowledgement.

**Tool-call parity boundary**:
The parity-review convention that Pi model-visible tools are host-native bridges, not standalone parity metadata rows. The command workflow that depends on a tool owns any required fallback documentation.
*Avoid*: custom-tool parity row, hidden command surface, tool as workflow owner.

**Runner subagent**:
A fresh Pi subprocess launched by a parent extension with an isolated conversation and explicit return mode. The model-visible dispatch tool and its shared runtime, process, JSON-event, and presentation helpers live in `@internal/ns-pi-subagents/runner-subagents`; the package still consumes neutral `@nseng-ai/pi-runtime/...` runtime/tool helper subpaths where it needs Pi host types or agent-definition loading.
*Avoid*: queued slash command, child thread, transcript scrape, forcing `@nseng-ai/pi-runtime` to import the extracted dispatch package.

**Terminal helper surface**:
The neutral `@nseng-ai/pi-runtime/terminal/*` layout and presentation subpaths owned by the Pi host and intentionally consumed by extracted Pi-tool packages and orchestration packages. This surface includes bordered overlay chrome, sizing, and wrapped-detail viewport behavior. Keep this surface in `@nseng-ai/pi-runtime` unless a future extraction proves a smaller acyclic home without broad churn.
*Avoid*: standalone Pi-tool package, feature-domain implementation, terminal emulator ownership.

**Terminal capture**:
A runner-subagent return mode where a generated runtime extension registers capture-only terminal tools whose validated input becomes the parent result.
*Avoid*: tool side effect, assistant final answer, stdout scrape.

**Final-text result**:
A runner-subagent return mode where the parent accepts the child assistant's final useful text as the result.
*Avoid*: terminal capture, transcript import, custom message.

**Worktree status observability**:
The host-owned operational status model and presentation that combines worktree identity, Branch Memory scope, Graphite stack facts, local commit and dirty markers, metadata diagnostics, and GitHub PR state for Pi's footer.
*Avoid*: Herdr extension workflow, Git status replacement, Branch Memory storage

**Graphite metadata status**:
A passive **Worktree status observability** fact derived from Graphite's local metadata to identify the current branch's parent, children, trunk relationship, and stack counts without invoking `gt` for presentation.
*Avoid*: Graphite mutation, full stack lifecycle, shell-command status

**Worktree status adapter**:
The Pi lifecycle module behind `.pi/extensions/worktree-status.ts`: it registers the renderer and refresh command, manages session cancellation and watched paths, and installs the custom footer over host-owned **Worktree status observability**.
*Avoid*: Graphite metadata parser owner, Branch Memory storage owner, Herdr extension adapter
