# @asdl/sdl

`@asdl/sdl` uses SDL to mean **Source Development Lifecycle**, not Software Development Lifecycle. It owns the public command boundary for software-development-lifecycle workflows that have migrated into SDL: users invoke them as `sdl <name>` and may have thin Pi mirrors at `/sdl:<name>`. Project-specific SDL behavior is allowed when it belongs to that lifecycle, and authors use only the public SDL extension API.

## Language

**SDL**:
The `@asdl/sdl` package and `sdl` CLI. SDL is the public lifecycle command boundary for migrated software-development workflows.
*Avoid*: repo-internal developer CLI, generic ASDL namespace, lower orchestration implementation.

**Source Development Lifecycle CLI**:
The expanded meaning of `sdl`: the user-facing CLI for source-control and software-development-lifecycle workflows that have migrated out of private repo tooling.
*Avoid*: Software Development Lifecycle as the expansion of SDL in this package, Source Data Language, generic script runner, synonym for all ASDL tools.

**SDL command surface**:
The user-facing invocation pair for a migrated lifecycle command: `sdl <name>` plus optional `/sdl:<name>` Pi mirror when implemented.
*Avoid*: `asdl-dev` command for migrated workflows, `/code:*` target namespace, compatibility alias.

**SDL extension**:
Repo-local or global lifecycle behavior exposed through SDL because it belongs to the Source Development Lifecycle even when it depends on project-specific tools, policy, or orchestration packages. SDL extensions live under `.asdl/extensions` and default-export an extension object created with `defineExtension()` from `@asdl/sdl/sdk`; command contributions currently live in an optional `commands` bucket.
*Avoid*: Pi runtime extension, reason to stay outside SDL, hidden task, factory registration side effect, command-required or single-command-only model.

**SDL command entry**:
A command contribution inside an SDL extension's `commands` array. It names and implements one flat `sdl <name>` command.
*Avoid*: SDL extension itself, YAML command spec, nested task database, arbitrary internal import, Pi extension command.

**SDL extension discovery**:
The side-effect-light SDL CLI step that scans built-in command definitions plus `.asdl/extensions` direct entries, directory indexes, and JSON manifest descriptors to build the command catalog without importing external SDL extension modules.
*Avoid*: eager module loading for help, recursive command crawling, hidden task registry, factory execution during discovery.

**Selected SDL extension loading**:
The SDL CLI step that imports and validates exactly one external SDL extension contribution after the user selects a command. Selected help and JSON schema may load the selected extension contribution; top-level help and unrelated commands must not load unselected entries. Discovery diagnostics that affect the selected command are fatal; unrelated discovery diagnostics are warnings.
*Avoid*: loading all extension code to discover command names, partial registration state from failed modules, bricking static help/version/runtime for unrelated malformed entries.

**CLI-only dynamic SDL extension loading**:
The current boundary for dynamically discovered SDL extensions: `sdl <name>` can be registered from `.asdl/extensions`, while exact dynamic `/sdl:<name>` Pi mirrors remain deferred until Pi has a registration-time cwd/discovery design or a different command model.
*Avoid*: accidental dynamic Pi mirror registration, assuming invocation-time `ctx.cwd` can create new exact Pi command names.

**Flat first-pass command name**:
A single-segment SDL command name such as `submit`, `changes`, `autobranch`, `autoslot`, `land`, or `push`. The first pass avoids nested command groups.
*Avoid*: `sdl pr regen`, `sdl slot auto`, command taxonomy churn.

**SDL extension API**:
The `@asdl/sdl/sdk` subpath used by SDL extension authors. It exposes `defineExtension()`, `ok()`, `failed()`, `SdlContext`, extension/command types, result types, and `z` for SDK-owned schema identity.
*Avoid*: Pi runtime extension API, importing implementation modules, copying SDK types, resolving SDK through project-local internals, factory-registration API.

**Public author API**:
The stable package subpath intended for SDL extension authors. For SDL extensions, this is currently `@asdl/sdl/sdk`.
*Avoid*: internal migration export, workspace-private helper, public promise for every package export, unqualified extension API.

**Internal migration export**:
An SDL package subpath that exists so ASDL workspace packages can share primitives during migration, but is not promised as a plugin-author API.
*Avoid*: plugin API, public SDK, command-author import path.

**Default SDL command**:
A built-in SDL command implementation used when no global or project SDL command entry overrides it. Current examples include `changes`, `cp`, `submit`, and `regenerate-pr`, all defined through the built-in command table.
*Avoid*: project override, mandatory plugin, external command entry.

**Project override**:
A repo-local `.asdl/extensions` command entry or manifest descriptor that replaces a default or global command by contributing the same flat command name at project precedence.
*Avoid*: compatibility alias, wrapper around old command name, global user plugin.

**SDL Pi mirror**:
A `/sdl:<name>` Pi command that delegates to the corresponding `sdl <name>` CLI behavior, such as `/sdl:changes`, `/sdl:cp`, and `/sdl:submit`. Nested code-lifecycle mirrors such as `/sdl:code:regenerate-pr` may delegate to an SDL command without registering a flat `/sdl:<name>` mirror. The mirror is an adapter over SDL, not a separate implementation.
*Avoid*: parallel Pi implementation, `/code:*` replacement wrapper without SDL, independent behavior fork, dynamic arbitrary `/sdl:*` registration.

**Hard cutover**:
The migration policy that deletes old `asdl-dev <name>` and `/code:<name>` surfaces when a lifecycle command moves to SDL, unless a documented exception is approved first.
*Avoid*: long-lived compatibility alias, temporary old name, autocomplete convenience alias.

**Lower orchestration owner**:
An internal package such as `@asdl/ccc` that may own implementation orchestration while SDL owns the public lifecycle command boundary.
*Avoid*: public command namespace owner, reason to keep the old command surface, circular dependency.
