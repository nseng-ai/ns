# Clinkr Shell Completion

## Thesis

Clinkr should provide a first-party shell-completion foundation that lets Clinkr-based CLIs expose reliable command, option, and value suggestions without each CLI hand-rolling shell-specific parsing. SDL should be the proving consumer because its command catalog is dynamic: top-level `sdl` commands can come from built-ins, XDG global extensions, or project-local `.sdl/extensions`, while selected-command option metadata requires importing only the selected extension.

Research indicates Commander.js deliberately does not own this feature today. Commander maintainers have repeatedly said command-line completion is unsupported, non-trivial to generate, and requires shell/platform-specific setup; issue #2008 notes no currently maintained completion library that integrates cleanly with Commander. Earlier issue #385 was closed with Commander not planning to build tab completion in, and PR #907 proposed an Omelette-backed `.complete()` API but was not accepted. The recurring reasons are shell/platform maintenance burden, unresolved disagreement about whether completion belongs in a lean parser versus usage help and "did you mean" suggestions, and the lack of a maintained Commander-native integration that avoids taking over a much larger command-tree and shell-script contract. Commander 15 still ships no native completion support. Commander does expose enough public introspection for Clinkr to use safely after building a command tree: `commands`, `options`, `registeredArguments`, `createHelp().visibleCommands()`, `createHelp().visibleOptions()`, option aliases/choices, and argument choices.

The Objective is to turn that evidence into a composable Clinkr design: a static completion engine and shell bridge first, plus an explicit research path for dynamic/custom completion hooks so future commands can eventually complete runtime values such as branches, files, or project resources without forcing that complexity into the first static slice.

## Scope

- Design and implement a Clinkr-owned completion engine that can inspect a built Clinkr/Commander command tree without running command handlers.
- Generate completion candidates for visible subcommands, visible options, implicit help/version/runtime options, schema-derived enum choices, and positional enum choices where Clinkr already knows the surface.
- Provide shell integration helpers or scripts for bash, zsh, and fish, using a hidden resolver command or equivalent host-provided completion endpoint.
- Integrate SDL as the first dynamic consumer while preserving SDL extension-loading constraints:
  - top-level `sdl` completion may use side-effect-light catalog discovery only;
  - selected-command option completion may import exactly that selected command, matching selected help and `--json-schema` behavior;
  - unrelated malformed extension diagnostics must not pollute completion output in ways that break shell protocols.
- Research and de-risk dynamic/custom completion hooks as a separate roadmap item, including how a command would combine default Clinkr completions with command-owned runtime value providers.
- Document user-facing setup and implementation boundaries for Clinkr and SDL.

## Non-Goals

- Do not add legacy SDL command aliases solely for autocomplete convenience.
- Do not make Commander.js itself a fork or upstream dependency for this feature; use public Commander APIs exposed by the installed dependency.
- Do not require Carapace, Omelette, tabtab, or another runtime completion framework unless a later explicit design decision chooses that tradeoff.
- Do not make dynamic/custom runtime value completion mandatory for the first static completion slice.
- Do not turn Objectives, Branch Memory, SDL extensions, or Clinkr into a task database or workflow controller to support completion.
- Do not promise PowerShell completion in the initial scope unless a later roadmap update deliberately adds it.

## Completion Criteria

- Clinkr exposes a tested completion API or subpath that can produce completion candidates from representative Clinkr command trees without invoking command handlers.
- Completion candidates cover commands, visible options, implicit framework options, and enum choices for options/positionals.
- SDL exposes a user-facing completion setup path such as `sdl completion bash|zsh|fish` and a shell-facing resolver path, with tests around project-local SDL extension commands.
- SDL completion preserves lazy extension loading and selected-command-only import behavior.
- Dynamic/custom completion hooks have a written design decision: either implemented behind a clear API, deliberately parked with known blockers, or split into a follow-up Objective.
- Documentation explains supported shells, installation commands, limitations, and why compatibility aliases are not added for completion.
- Relevant TypeScript checks and targeted tests pass, with validation evidence recorded in future Objective updates or closure prose rather than as a standalone roadmap task.

## Assumptions and Risks

Assumptions:

- Commander’s public introspection is sufficient for static completion: local Commander 15.0.0 and installed Commander 14 expose `commands`, `options`, `registeredArguments`, and help visibility helpers that Clinkr can use without private `_` fields for the common path.
- Clinkr’s schema-derived `SurfacePlan` already contains the most important static metadata, so completion can reuse existing surface derivation rather than reparsing Zod schemas independently.
- A hidden resolver command that emits machine-readable or newline-delimited candidates is easier to test and safer for dynamic SDL catalogs than generated static shell scripts containing a snapshot of all commands.
- Bash, zsh, and fish are enough for initial SDL developer ergonomics; PowerShell can remain out of scope until requested.

Risks:

- Shell protocol differences can consume disproportionate time. Bash uses programmable completion (`complete`, `compgen`, and often `COMP_LINE`/`COMP_POINT`), fish uses `complete` rules and command substitutions, and zsh has its own `compdef`/completion-system conventions.
- Completion output is a strict shell protocol; ordinary warning text from SDL extension discovery can corrupt suggestions unless routed, suppressed, or represented separately.
- Dynamic/custom completions can blur boundaries: command-owned providers may need async I/O, cancellation, error handling, default completion fallback, and security/performance limits.
- Reusing Commander introspection must avoid private fields where possible, but some implicit root-only options may still be easier to track in Clinkr’s own metadata than to rediscover from Commander.
- Installed shell scripts can be hard to test end-to-end in CI; most tests may need to validate resolver behavior and script text rather than interactive shell tab behavior.

Research findings captured for future implementers:

- Commander issue #2008: maintainer response says Commander does not support command-line completion, it is a reasonable amount of work to generate completions and handle shell/platform setup, and no maintained completion library was known to integrate cleanly with Commander.
- Commander issue #385: tab completion was considered but Commander was not planning to build it in; breadcrumbs point users to external packages and alternatives.
- Commander PR #907: proposed built-in autocomplete via Omelette, mapping Commander structures into an Omelette template and exposing `.complete()` rules for options/arguments, with users running `eval "$(command-name --completion)"`; this was not accepted into Commander.
- `commander-completion` (twolfson): older mixin approach adds `Command.completion()` and `Command.complete({ line, cursor })`, driven by `COMP_LINE`/`COMP_POINT`; useful as a protocol pattern but stale for current Commander.
- `tabtab`: library pattern inspired by npm, with shell bridge scripts for bash/zsh/fish and a Node resolver that logs completions; docs emphasize install/uninstall and environment parsing.
- `omelette`: template/tree/event-based completion library for Node/Deno; supports bash/zsh/fish installation helpers and dynamic callbacks, but introduces a template abstraction separate from Clinkr’s schema-derived command surface.
- `commander-auto-complete`: older Commander autocomplete package; community comments describe it as stale and not production-sufficient.
- `@gutenye/commander-completion-carapace`: newer Commander integration that emits/installs Carapace specs and supports many shells, but adds a Carapace dependency and an external spec model.
- `@naerth/commander-autocomplete`: recent Commander autocomplete package but currently Bash-only, with zsh/fish not yet available.
- yargs: built-in completion engine has `completion()`, `getCompletion()`, default command/option/choice completion, and custom completion functions with a default-completion fallback. Its history shows custom completion APIs can become awkward and need careful design.
- oclif: autocomplete is handled through a plugin, generated scripts, and cache/manifest concepts; useful evidence that large CLIs often separate completion data generation from runtime command execution.
- The ecosystem pattern is that frameworks with good completion own enough of the command tree and shell setup to make completion a first-party primitive. Clinkr's `SurfacePlan` gives it a better architectural position than a thin Commander plugin, while PowerShell/Windows and per-shell script generation remain the main cost centers.
- Before final implementation or documentation, do a quick current-issue scan for any 2025-2026 Commander completion revival; current evidence says Commander 15 remains completion-free, but the durable design should not rely on stale community-state assumptions.

## Open Questions

- Should Clinkr expose completion as a low-level pure API only, or also provide a standard hidden command and visible `completion <shell>` command helper for host CLIs?
- What exact output contract should the resolver use: newline-delimited strings, tab-separated descriptions, JSON, or shell-specific rendering?
- Should SDL suppress unrelated extension warnings during completion, redirect them to debug-only output, or include them only when completing an explicitly broken selected command?
- How should dynamic/custom completion providers compose with default Clinkr completions: replace, append, filter, or callback-style fallback like yargs?
- Is file/directory completion in scope for Clinkr dynamic hooks, or should shell-native file completion remain the default when Clinkr has no candidate?
