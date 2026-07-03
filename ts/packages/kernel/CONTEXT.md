# @ji/kernel

`@ji/kernel` owns the public command boundary for software-development-lifecycle workflows that have migrated into ji. Generic extension commands may appear as `ns <name>`, while this repository's current grouped flow lifecycle commands appear as `ns flow <name>` with static Pi mirrors at `/ns:flow:<name>`. Project-specific ji behavior is allowed when it belongs to that lifecycle, and authors use only the public ji extension API.

## Language

**ji**:
The `@ji/kernel` package and `ji` CLI. ji is the public lifecycle command boundary for migrated software-development workflows.
*Avoid*: repo-internal developer CLI, generic ji namespace, lower orchestration implementation.

**Legacy `sdl` CLI name**:
The retired product/CLI name that used to label the user-facing command boundary for source-control and software-development-lifecycle workflows.
*Avoid*: expansion for ji, Software Development Lifecycle, Source Data Language, generic script runner, synonym for all ji tools.

**ji command surface**:
The user-facing invocation pair for a migrated lifecycle command. Generic ji extension commands may be `ns <name>` with optional `/ns:<name>` mirrors; the current project-local flow commands are grouped as `ns flow <name>` with static `/ns:flow:<name>` Pi mirrors.
*Avoid*: `sdl-dev` command for migrated workflows, `/code:*` target namespace, compatibility alias.

**ji kernel**:
The host layer of the `ji` CLI: command discovery, precedence, selected extension loading, CLI presentation, argument/schema parsing, execution context construction, and the public ji extension API. The kernel should stay small and should not own repository workflow policy until repeated command evidence proves a reusable service belongs there.
*Avoid*: repository workflow command bundle, Graphite/GitHub policy owner, hidden plugin registry, task database, synonym for all ji packages.

**ji extension**:
Repo-local or global lifecycle behavior exposed through ji because it belongs to the software-development lifecycle even when it depends on project-specific tools, policy, or orchestration packages. ji extensions default-export an extension object created with `defineExtension()` from `@ji/kernel/sdk`; command contributions currently live in an optional `commands` bucket.
*Avoid*: Pi runtime extension, reason to stay outside ji, hidden task, factory registration side effect, command-required or single-command-only model.

**Project-local ji extension**:
A checked-in repository extension under `<repo>/.ns/extensions` that contributes lifecycle behavior for that checkout. It can restore familiar repository command surfaces, including grouped surfaces such as `ns flow <name>` and capability command faces such as `ns address exec ...`, without implying the command is built into every ji installation.
*Avoid*: default ji command, universal command, compatibility alias, bundled first-party extension, package implementation module.

**Future bundled ji extension**:
A possible first-party extension distribution form for reusable ji workflows after project-local command evidence proves a stable portable contract. It is intentionally not the mechanism used for the current command-first `changes` / `cp` / `submit` / `regenerate-pr` migration.
*Avoid*: current project-local extension, privileged built-in, excuse to skip SDK boundary design, automatic destination for repo-specific workflow policy.

**Single-file ji extension**:
A direct `.ns/extensions/<name>.ts` or `.ns/extensions/<name>.js` authoring module. It is a leaf extension surface: it may import the public ji extension API, but workspace packages must not import from it. Reusable behavior proven inside a single-file extension must move or be copied into a package-owned module before packages can depend on it.
*Avoid*: shared package module, helper library, internal migration export, public SDK source.

**ji command entry**:
A command contribution inside a ji extension's `commands` array. It names and implements one command entry; when the owning manifest declares a group such as `flow`, the user-facing CLI surface is grouped as `ns flow <name>`.
*Avoid*: ji extension itself, YAML command spec, nested task database, arbitrary internal import, Pi extension command.

**ji extension discovery**:
The side-effect-light ji CLI step that scans built-in command definitions plus `.ns/extensions` direct entries, directory indexes, and JSON manifest descriptors to build the command catalog without importing external ji extension modules.
*Avoid*: eager module loading for help, recursive command crawling, hidden task registry, factory execution during discovery.

**Selected ji extension loading**:
The ji CLI step that imports and validates exactly one external ji extension contribution after the user selects a command. Selected help and JSON schema may load the selected extension contribution; top-level help and unrelated commands must not load unselected entries. Discovery diagnostics that affect the selected command are fatal; unrelated discovery diagnostics are warnings.
*Avoid*: loading all extension code to discover command names, partial registration state from failed modules, bricking static help/version/runtime for unrelated malformed entries.

**CLI-only dynamic ji extension loading**:
The current boundary for dynamically discovered ji extensions: CLI commands can be registered from `.ns/extensions` as flat entries or manifest-grouped entries, while exact dynamic Pi mirrors remain deferred until Pi has a registration-time cwd/discovery design or a different command model.
*Avoid*: accidental dynamic Pi mirror registration, assuming invocation-time `ctx.cwd` can create new exact Pi command names.

**Flat first-pass command name**:
A single-segment ji command name such as `submit`, `changes`, `autobranch`, `autoslot`, `land`, or `push`. The first pass avoids nested command groups.
*Avoid*: `ns pr regen`, `ns slot auto`, command taxonomy churn.

**ji extension API**:
The concrete `@ji/kernel/sdk` subpath used by ji extension authors — the live instance that fills the Public author API slot today. `@ji/kernel/sdk` is the SDK layer; `@ji/kernel` is the host/kernel container that loads extensions. It exposes the ji extension authoring surface: `defineExtension()`, the command and result types and helpers, `SdlExtensionApi` execution capabilities (including text generation), schema builder `z`, and a deliberately curated set of lower-package re-exports owned as first-party SDK vocabulary. `ts/packages/kernel/docs/sdk-reference.md` is the authoritative, complete export inventory; do not maintain a parallel hand-enumeration of exports here. Single-file ji extensions should use this API rather than ji implementation modules; packages must never depend on single-file extensions.
*Avoid*: Public ji extension API (third label for the same referent), Pi runtime extension API, importing implementation modules, copying SDK types, resolving SDK through project-local internals, importing from single-file extensions, factory-registration API, direct `zod` dependency for command schemas when the SDK `z` export is available.

**Public author API**:
The abstract slot — the stable module specifier we promise to point ji extension authors at, independent of which specifier currently fills it. The ji extension API (`@ji/kernel/sdk`) is its current and only filler. Use this term for the promise/contract; use ji extension API for the concrete exports.
*Avoid*: synonym for `@ji/kernel/sdk`, internal migration export, workspace-private helper, public promise for every package export, unqualified extension API.

**Command-first SDK promotion rule**:
The evidence rule for moving behavior into the ji extension API: one command may copy or localize a seam while it is still being proven; shared helpers can live inside `.ns/extensions/` when that keeps project-local authoring readable; promotion to `@ji/kernel/sdk` requires repeated command evidence or a clearly documented single-command necessity. Promotion should create a deep author-facing interface, not expose internals for convenience.
*Avoid*: one-command convenience export, importing implementation modules from extensions, treating duplication as automatically bad, hidden migration registry.

**Internal workspace export**:
An `@ji/kernel` subpath shared across first-party workspace packages (`ccc`, `pi`, flow) but not promised through the Public author API. It carries SDK-independent primitives — code that takes explicit callbacks (`execGit`, a text generator) rather than `SdlExtensionApi`. The dividing rule between sharing mechanisms is SDK-dependence: `ctx`-dependent shared code belongs above the SDK in the Shared extension substrate; SDK-independent primitives stay here, below the SDK. Package metadata records these subpaths under `ji.internalWorkspaceExports`.
*Avoid*: internal migration export, plugin API, public SDK, command-author import path, ctx-dependent shared code.

**Flow capability-area maturity ladder**:
The documentation/readiness model for recurring project-local flow command-author seams: `raw` command-local logic, `flow-shared` helpers under `ts/packages/capabilities/flow/src/shared/` in the `@ji/flow` workspace package, internal workspace exports for package-owned migration seams, capability-building primitives under precise `@ji/capability-kit/*` subpaths, and deferred `public-sdk` promotion into `@ji/kernel/sdk` only after a separate explicit SDK decision. For capabilities beyond flow, the Extension layering model (ADR 0009) governs: the SDK stays thin host primitives, and shared `ctx`-dependent code lives above the SDK in the Shared extension substrate rather than being promoted into `@ji/kernel/sdk`.
*Avoid*: task status, automatic SDK promotion pipeline, proof that a helper is public author API, generic rule for all future extensions.

**Flow-shared helper**:
A helper owned by the grouped project-local flow implementation package under `ts/packages/capabilities/flow/src/shared/`. It may keep repeated repo-local command authoring readable, but packages outside the implementation should use deliberate package exports rather than importing private source files, and its existence does not create public SDK surface.
*Avoid*: public SDK helper, package-owned primitive, bundled extension API, workspace dependency target.

**Default ji command**:
A built-in ji command implementation used when no global or project ji command entry overrides it. The grouped flow cutover intentionally leaves the ji kernel with no repository workflow domain defaults; lifecycle commands are restored in this repo by the grouped project-local extension package at `.ns/extensions/flow/`, not as universal built-ins.
*Avoid*: project override, mandatory plugin, external command entry, assuming a repository workflow command is built in.

**Project override**:
A repo-local `.ns/extensions` command entry or manifest descriptor that replaces a default or global command by contributing the same command key at project precedence. Grouped command keys use `group/name`, for example `flow/cp`.
*Avoid*: compatibility alias, wrapper around old command name, global user plugin.

**ji Pi mirror**:
A Pi command that delegates to corresponding ji CLI behavior. Lifecycle mirrors now use `/ns:flow:<name>` over `ns flow <name>` for `changes`, `cp`, `autobranch`, `autoslot`, `submit`, `regenerate-pr`, `push`, `land`, and `pull-trunk`; old flat `/ns:<name>`, `/ns:code:<name>`, and `/code:*` lifecycle aliases are not restored. The mirror is an adapter over ji, not a separate implementation.
*Avoid*: parallel Pi implementation, `/code:*` replacement wrapper without ji, independent behavior fork, dynamic arbitrary `/ns:*` registration, advertising mirrors for unavailable ji commands.

**Hard cutover**:
The migration policy that deletes old top-level `ns <name>`, flat `/ns:<name>`, `/ns:code:<name>`, `sdl-dev <name>`, and `/code:<name>` surfaces when a lifecycle command moves into the grouped ji flow family, unless a documented exception is approved first.
*Avoid*: long-lived compatibility alias, temporary old name, autocomplete convenience alias.

**Lower orchestration owner**:
An internal package such as `@ji/ccc` that may own implementation orchestration while ji owns the public lifecycle command boundary.
*Avoid*: public command namespace owner, reason to keep the old command surface, circular dependency.

## Extension layering

The end-state architecture for ji capabilities relative to the ji extension API (`@ji/kernel/sdk`). Defined in ADR 0009. Below the SDK: neutral infra (`@ji/core`, `@ji/clinkr`, `@ji/brmem`). The SDK: the ji kernel (`@ji/kernel`) plus the `@ji/kernel/sdk` package. Above the SDK: the Capability Kit (including gateway subpackages such as `@ji/capability-kit/graphite`) plus the Capabilities (first-party extensions) built on it.

**Capability extension**:
An above-SDK extension that contributes one ji capability — flow, handoff, objective, branch-context, plans, address, slot, roaster, or aretro — depending only on host primitives, neutral infra, and curated provider Capability APIs. `ccc` is the highest-fan-out consumer in the Extension Dependency Graph, not a privileged tier.
*Avoid*: standalone tool, kernel default, Pi runtime extension, below-SDK package, internal workspace export consumer.

The kernel-loaded command surface — `defineExtension()` command contributions registered as CLI and Pi mirror surfaces — is the thin shell that converts `ctx` into gateways and calls the **Gateway-injected capability core**; it is an ordinary architectural layer, not a defined term.

**Capability API**:
The capability face that a downstream **consumer** extension imports — a curated, typed programmatic export consumed in-process (chiefly by `ccc`) through the required `@ji/<cap>/api` subpath. Consumers depend on the Capability API only, never on internal modules, package-private subpaths, or the provider's CLI.
*Avoid*: Peer API, command contribution, internal module import, CLI invocation of a provider, `ctx`-passing API, provider guts.

**Gateway-injected capability core**:
The rule that capability domain logic and its Capability API take injected gateways such as `GitGateway`, never raw `SdlExtensionApi`. `ctx` lives only in the kernel-loaded command surface, which converts `ctx`→gateways at the edge. This is what makes domain logic unit-testable with `InMemoryGitGateway`.
*Avoid*: `ctx`-threaded domain logic, exec-string test seam, host access inside the domain logic.

**Extension Dependency Graph**:
The acyclic, shallow graph of consumer→provider dependencies through `@ji/<cap>/api` Capability API subpaths. Capabilities are mostly leaves (providers); `ccc` is the highest-fan-out consumer. These are ordinary package edges — the kernel loader is unaware of them. The graph must stay acyclic; a cycle is debt (see the `@ji/pi` ↔ `@ji/ccc` cycle tracked by the `sdl-extension-architecture` Objective).
*Avoid*: kernel-resolved dependency, capability-to-capability web, cyclic dependency edge.

**Capability Kit** (`@ji/capability-kit`):
The above-SDK package holding cross-cutting, capability-agnostic code shared among capabilities — the `ctx`→gateway adapter and shared result/error shapes — distinct from capability-specific logic, which stays in each capability behind its Capability API. The name "Extension Kit" is reserved for a future general all-extensions substrate.
*Avoid*: Extension Kit (reserved name), capability-specific home, below-SDK package, public author API, kitchen-sink utilities, `@ji/core`.

**Capability-building primitive subpaths** (`@ji/capability-kit/*`):
Precise internal workspace subpaths for small shared first-party capability-building primitives extracted out of the former transitional package (checkpoint-flow/message, pending-worktree, temp-files, text-generation, text-repair). They are not public `@ji/kernel/sdk` author API by default and not product capability owners; they exist to avoid both kernel/SDK pollution and a permanent transitional holding pen.
*Avoid*: public SDK surface, product capability domain home, below-SDK package, transitional debt label, root-barrel convenience.
