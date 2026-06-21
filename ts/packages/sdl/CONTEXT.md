# @sdl/sdl

`@sdl/sdl` uses SDL to mean **Source Development Lifecycle**, not Software Development Lifecycle. It owns the public command boundary for software-development-lifecycle workflows that have migrated into SDL: users invoke them as `sdl <name>` and may have thin Pi mirrors at `/sdl:<name>`. Project-specific SDL behavior is allowed when it belongs to that lifecycle, and authors use only the public SDL extension API.

## Language

**SDL**:
The `@sdl/sdl` package and `sdl` CLI. SDL is the public lifecycle command boundary for migrated software-development workflows.
*Avoid*: repo-internal developer CLI, generic SDL namespace, lower orchestration implementation.

**Source Development Lifecycle CLI**:
The expanded meaning of `sdl`: the user-facing CLI for source-control and software-development-lifecycle workflows that have migrated out of private repo tooling.
*Avoid*: Software Development Lifecycle as the expansion of SDL in this package, Source Data Language, generic script runner, synonym for all SDL tools.

**SDL command surface**:
The user-facing invocation pair for a migrated lifecycle command: `sdl <name>` plus optional `/sdl:<name>` Pi mirror when implemented.
*Avoid*: `sdl-dev` command for migrated workflows, `/code:*` target namespace, compatibility alias.

**SDL extension**:
Repo-local or global lifecycle behavior exposed through SDL because it belongs to the Source Development Lifecycle even when it depends on project-specific tools, policy, or orchestration packages. SDL extensions live under `.sdl/extensions` and default-export an extension object created with `defineExtension()` from `@sdl/sdl/sdk`; command contributions currently live in an optional `commands` bucket.
*Avoid*: Pi runtime extension, reason to stay outside SDL, hidden task, factory registration side effect, command-required or single-command-only model.

**Single-file SDL extension**:
A direct `.sdl/extensions/<name>.ts` or `.sdl/extensions/<name>.js` authoring module. It is a leaf extension surface: it may import the public SDL extension API, but workspace packages must not import from it. Reusable behavior proven inside a single-file extension must move or be copied into a package-owned module before packages can depend on it.
*Avoid*: shared package module, helper library, internal migration export, public SDK source.

**SDL command entry**:
A command contribution inside an SDL extension's `commands` array. It names and implements one flat `sdl <name>` command.
*Avoid*: SDL extension itself, YAML command spec, nested task database, arbitrary internal import, Pi extension command.

**SDL extension discovery**:
The side-effect-light SDL CLI step that scans built-in command definitions plus `.sdl/extensions` direct entries, directory indexes, and JSON manifest descriptors to build the command catalog without importing external SDL extension modules.
*Avoid*: eager module loading for help, recursive command crawling, hidden task registry, factory execution during discovery.

**Selected SDL extension loading**:
The SDL CLI step that imports and validates exactly one external SDL extension contribution after the user selects a command. Selected help and JSON schema may load the selected extension contribution; top-level help and unrelated commands must not load unselected entries. Discovery diagnostics that affect the selected command are fatal; unrelated discovery diagnostics are warnings.
*Avoid*: loading all extension code to discover command names, partial registration state from failed modules, bricking static help/version/runtime for unrelated malformed entries.

**CLI-only dynamic SDL extension loading**:
The current boundary for dynamically discovered SDL extensions: `sdl <name>` can be registered from `.sdl/extensions`, while exact dynamic `/sdl:<name>` Pi mirrors remain deferred until Pi has a registration-time cwd/discovery design or a different command model.
*Avoid*: accidental dynamic Pi mirror registration, assuming invocation-time `ctx.cwd` can create new exact Pi command names.

**Flat first-pass command name**:
A single-segment SDL command name such as `submit`, `changes`, `autobranch`, `autoslot`, `land`, or `push`. The first pass avoids nested command groups.
*Avoid*: `sdl pr regen`, `sdl slot auto`, command taxonomy churn.

**SDL extension API**:
The `@sdl/sdl/sdk` subpath used by SDL extension authors. It exposes `defineExtension()`, `ok()`, `failed()`, `SdlContext`, extension/command types, result types, and `z` for SDK-owned schema identity. Single-file SDL extensions should use this API rather than SDL implementation modules; packages must never depend on single-file extensions.
*Avoid*: Pi runtime extension API, importing implementation modules, copying SDK types, resolving SDK through project-local internals, importing from single-file extensions, factory-registration API.

**Public author API**:
The stable package subpath intended for SDL extension authors. For SDL extensions, this is currently `@sdl/sdl/sdk`.
*Avoid*: internal migration export, workspace-private helper, public promise for every package export, unqualified extension API.

**Internal migration export**:
An SDL package subpath that exists so SDL workspace packages can share primitives during migration, but is not promised as a plugin-author API.
*Avoid*: plugin API, public SDK, command-author import path.

**Default SDL command**:
A built-in SDL command implementation used when no global or project SDL command entry overrides it. The project-local extension cutover intentionally leaves the SDL kernel with no repository workflow domain defaults; `changes`, `cp`, `autobranch`, `submit`, and `regenerate-pr` are restored in this repo as direct project-local extensions at `.sdl/extensions/changes.ts`, `.sdl/extensions/cp.ts`, `.sdl/extensions/autobranch.ts`, `.sdl/extensions/submit.ts`, and `.sdl/extensions/regenerate-pr.ts`, not as universal built-ins.
*Avoid*: project override, mandatory plugin, external command entry, assuming a repository workflow command is built in.

**Project override**:
A repo-local `.sdl/extensions` command entry or manifest descriptor that replaces a default or global command by contributing the same flat command name at project precedence.
*Avoid*: compatibility alias, wrapper around old command name, global user plugin.

**SDL Pi mirror**:
A `/sdl:<name>` Pi command that delegates to the corresponding `sdl <name>` CLI behavior. During the project-local extension migration, `/sdl:changes`, `/sdl:cp`, `/sdl:autobranch`, `/sdl:submit`, `/sdl:regenerate-pr`, `/sdl:push`, and `/sdl:code:changes` are explicit mirrors for repo-local SDL commands; old checkpoint `/code:*`, nested checkpoint aliases, `/sdl:code:autobranch`, `/sdl:code:submit`, `/sdl:code:regenerate-pr`, `/sdl:code:push`, and legacy submit/PR-regeneration/push aliases are not restored. The mirror is an adapter over SDL, not a separate implementation.
*Avoid*: parallel Pi implementation, `/code:*` replacement wrapper without SDL, independent behavior fork, dynamic arbitrary `/sdl:*` registration, advertising mirrors for unavailable SDL commands.

**Hard cutover**:
The migration policy that deletes old `sdl-dev <name>` and `/code:<name>` surfaces when a lifecycle command moves to SDL, unless a documented exception is approved first.
*Avoid*: long-lived compatibility alias, temporary old name, autocomplete convenience alias.

**Lower orchestration owner**:
An internal package such as `@sdl/ccc` that may own implementation orchestration while SDL owns the public lifecycle command boundary.
*Avoid*: public command namespace owner, reason to keep the old command surface, circular dependency.
