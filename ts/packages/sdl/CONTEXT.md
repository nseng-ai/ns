# @asdl/sdl

`@asdl/sdl` uses SDL to mean **Source Development Lifecycle**, not Software Development Lifecycle. It owns the public command boundary for software-development-lifecycle workflows that have migrated into SDL: users invoke them as `sdl <name>` and may have thin Pi mirrors at `/sdl:<name>`. Project-specific command behavior is allowed when it belongs to that lifecycle, but command authors use only the public SDL command-entry SDK.

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

**Project-specific SDL command extension**:
Repo-local lifecycle behavior exposed through SDL because the command belongs to the development lifecycle even when it depends on project-specific tools, policy, or orchestration packages.
*Avoid*: reason to stay outside SDL, hidden task, factory registration side effect.

**SDL command entry**:
A TypeScript or JavaScript module under `.asdl/extensions` whose default export is a command object created with `defineCommand()` from `@asdl/sdl/sdk`.
*Avoid*: YAML command spec, nested task database, arbitrary internal import, extension factory for flat commands.

**Extension command discovery**:
The side-effect-light SDL CLI step that scans built-in command definitions plus `.asdl/extensions` direct entries, directory indexes, and JSON manifest descriptors to build the command catalog without importing external command entries.
*Avoid*: eager module loading for help, recursive command crawling, hidden task registry, factory execution during discovery.

**Selected command loading**:
The SDL CLI step that imports and validates exactly one external command entry after the user selects that command. Selected help and JSON schema may load the selected entry; top-level help and unrelated commands must not load unselected entries.
*Avoid*: loading all extension code to discover command names, partial registration state from failed modules.

**CLI-only dynamic extension command loading**:
The current boundary for dynamically discovered extension commands: `sdl <name>` can be registered from `.asdl/extensions`, while exact dynamic `/sdl:<name>` Pi mirrors remain deferred until Pi has a registration-time cwd/discovery design or a different command model.
*Avoid*: accidental dynamic Pi mirror registration, assuming invocation-time `ctx.cwd` can create new exact Pi command names.

**Flat first-pass command name**:
A single-segment SDL command name such as `submit`, `changes`, `autobranch`, `autoslot`, `land`, or `push`. The first pass avoids nested command groups.
*Avoid*: `sdl pr regen`, `sdl slot auto`, command taxonomy churn.

**SDL command-entry SDK**:
The `@asdl/sdl/sdk` subpath used by command authors. It exposes `defineCommand()`, `ok()`, `failed()`, `SdlContext`, command types, result types, and `z` for SDK-owned schema identity.
*Avoid*: importing implementation modules, copying SDK types, resolving SDK through project-local internals, factory-registration API.

**Public author API**:
The stable package subpath intended for project command authors. For SDL command entries, this is currently `@asdl/sdl/sdk`.
*Avoid*: internal migration export, workspace-private helper, public promise for every package export.

**Internal migration export**:
An SDL package subpath that exists so ASDL workspace packages can share primitives during migration, but is not promised as a plugin-author API.
*Avoid*: plugin API, public SDK, command-author import path.

**Default SDL command**:
A built-in SDL command implementation used when no global or project extension command overrides it. Current examples include `changes`, `cp`, and `submit`, all defined through the built-in command table.
*Avoid*: project override, mandatory plugin, external command entry.

**Project override**:
A repo-local `.asdl/extensions` command entry or manifest descriptor that replaces a default or global command by contributing the same flat command name at project precedence.
*Avoid*: compatibility alias, wrapper around old command name, global user plugin.

**SDL Pi mirror**:
A `/sdl:<name>` Pi command that delegates to the corresponding `sdl <name>` CLI behavior, such as `/sdl:changes`, `/sdl:cp`, and `/sdl:submit`. The mirror is an adapter over SDL, not a separate implementation.
*Avoid*: parallel Pi implementation, `/code:*` replacement wrapper without SDL, independent behavior fork, dynamic arbitrary `/sdl:*` registration.

**Hard cutover**:
The migration policy that deletes old `asdl-dev <name>` and `/code:<name>` surfaces when a lifecycle command moves to SDL, unless a documented exception is approved first.
*Avoid*: long-lived compatibility alias, temporary old name, autocomplete convenience alias.

**Lower orchestration owner**:
An internal package such as `@asdl/ccc` that may own implementation orchestration while SDL owns the public lifecycle command boundary.
*Avoid*: public command namespace owner, reason to keep the old command surface, circular dependency.
