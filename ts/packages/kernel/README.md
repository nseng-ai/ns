# ji

`ji` is the durable public command boundary for software-development-lifecycle workflows that have migrated out of repo-internal tooling. The package now exposes the active kernel SDK as `@ns/kernel` and `@ns/kernel/sdk`.

The retired `sdl-dev` package no longer owns current command surfaces. Lower packages such as `@ns/ccc` may continue to own repo-specific orchestration internals, but ji owns the public lifecycle command surface once a workflow moves to `ji`.

## Command ownership and hard cutover

Migrated lifecycle commands target one deliberate ji command surface. Generic extension commands may be flat (`ns <name>`), but this repository's current lifecycle flow commands are grouped:

- CLI: `ns flow <name>`
- Pi, when a mirror exists: `/ns:flow:<name>`

A migration slice should delete old command names and old `/code:<name>` Pi mirrors in the same slice unless an explicit, documented exception is approved before implementation. Do not keep compatibility aliases only for autocomplete or habit.

## Slot extension command face

`ns slot ...` is contributed by the bundled `@ns/slot` ji extension. The kernel discovers the Slot command manifest through the generic extension registry; it does not import Slot code or construct Slot context for ordinary ji help/parsing paths. `@ns/slot` remains the implementation and Capability API owner, and the package does not expose a standalone `slot` executable. Humans and agents should invoke Slot operations through `ns slot`, including navigation commands and agent-facing `ns slot gt exec ...` helpers.

Parent-shell directory changes require opt-in shell integration because a child process cannot `cd` its parent shell:

```bash
ns shell show --shell zsh
ns shell install --shell zsh
ns shell install --shell bash
ns slot shell show --shell zsh
ns slot shell install --shell zsh
```

`ns shell` is the canonical kernel-owned shell integration. The Slot extension contributes `ns slot shell ...` compatibility aliases that install the same canonical `ns()` wrapper. The wrapper uses `NS_CD_DIRECTIVE_FILE` and invokes `command ns "$@"`; it does not install a `slot()` function. Programmatic first-party consumers should continue to use curated Slot Capability APIs such as `@ns/slot/api` rather than parsing `ns slot --format json` output.

## Shell completion

ji ships first-party shell completion built on the Clinkr completion engine. Completion is a Clinkr primitive: Clinkr owns the static command/option/value planner over its own surface metadata, and ji is the proving consumer that wires it to a dynamic command catalog. Commander.js deliberately does not provide completion, so ji does not depend on a Commander completion plugin.

### Supported shells

bash, zsh, and fish are supported. PowerShell and Carapace-style spec export are out of scope for now (see Limitations).

### Setup

Print a setup script for your shell and evaluate it from your shell startup file:

```bash
# bash (~/.bashrc)
eval "$(ns completion bash)"

# zsh (~/.zshrc)
eval "$(ns completion zsh)"

# fish (~/.config/fish/config.fish)
ns completion fish | source
```

Each `ns completion <shell>` command prints a setup script that registers a completion hook for `ji`. The script does not embed a snapshot of the command tree; it calls back into ji at completion time so suggestions always reflect the current built-in, XDG global, and project-local command catalog.

### How it resolves candidates

The generated script invokes the hidden resolver `ns completion exec resolve <words...>`, which prints completion candidates as newline-delimited values on stdout, one per line. Descriptions are intentionally omitted in this first bridge; stdout is candidate values only.

Resolution preserves ji's lazy extension loading:

- Top-level completion is built from side-effect-light catalog metadata (built-in table, filesystem entries, JSON manifests) and does not eager-load command modules.
- Selected-command option and value completion imports only the selected command, matching `ns <cmd> --help` and `--json-schema` behavior.
- Diagnostics for a selected broken command are written to stderr; resolver stdout stays candidate-only and the resolver uses a shell-friendly exit code so completion does not break.
- Unrelated malformed extensions are not loaded for unrelated completion contexts and do not corrupt resolver output.

Static candidates cover visible subcommands and groups, visible options, implicit framework options (`-h/--help`, `-V/--version`, `--runtime`), rendered-command options (`--format`, `--json-schema`), and enum values for options and positionals.

### Dynamic value completion

Extension commands can contribute runtime value candidates (for example, branch names) through the optional `completionProvider` hook on a command. Provider candidates run only on the async completion path for the selected command, are appended to the static candidates, and are deduped. Provider failures are captured so static candidates remain available, resolver stdout stays candidate-only, and the resolver keeps exit code `0`. See `completionProvider` in [`docs/sdk-reference.md`](./docs/sdk-reference.md).

The proving consumer is `ns slot checkout` / `ns slot co`, which complete local branch names for the branch and base positionals without performing any checkout/create/delete mutation. Branch completion is local branches only; remote refs are out of scope.

### Limitations

- bash, zsh, and fish only; no PowerShell completion.
- No Carapace spec export backend.
- No rich file/directory completion helper API; shell-native file completion remains the fallback when ji has no candidate.
- Candidate descriptions are omitted from the newline resolver output.
- Standalone `slot` completion is not supported; install completion for `ji`, not for a `slot` executable.

### No compatibility aliases

ji does not retain old or renamed command names as compatibility aliases for autocomplete convenience. Completion reflects the current canonical command surface only; migrated workflows delete old names rather than keeping hidden aliases to satisfy habit or tab completion.

## ji extensions

ji treats project-specific lifecycle behavior as first-class. ji extensions can contribute command entries today and are expected to grow additional contribution points later.

The ji kernel owns the stable host mechanics: command discovery, precedence, selected extension loading, CLI presentation, argument/schema parsing, the execution context, and the public author API. It should not own repository workflow policy such as checkpoint wording, PR-description prompts, Graphite submit orchestration, or project-specific GitHub behavior unless that policy has deliberately become a reusable kernel service.

Project-local ji extensions own repo-specific command behavior. In this repository, flow commands such as `changes`, `cp`, `autobranch`, `submit`, `regenerate-pr`, and `push` are checked in under the grouped `.ns/extensions/flow/` package; their presence here does not make them universal built-in ji commands.

Reusable first-party capability commands can ship with the installed CLI as preinstalled extension metadata rather than requiring every consuming repo to check in matching `.ns/extensions` manifests. This is a distribution convenience for the same extension model: `ns objective ...` is discoverable in a foreign repo, but selected Objective commands are still imported lazily from their owning package module specifiers such as `@ns/objective/ns/commands/list`, and global/project `.ns/extensions` entries keep their normal override role. A workflow should become preinstalled only after the project-local form proves a stable reusable contract and the repository-specific policy has been separated from the portable behavior.

Command catalogs are discovered in increasing precedence:

```text
built-in command table < preinstalled first-party extension metadata < $XDG_DATA_HOME/ns/extensions < <cwd>/.ns/extensions
```

Global and project roots support these one-level entry shapes:

```text
.ns/extensions/greet.ts
.ns/extensions/greet.js
.ns/extensions/greet/index.ts
.ns/extensions/greet/index.js
.ns/extensions/package-name/package.json
```

Direct files and directory indexes infer one ji command-entry name from the file or directory name. Top-level help eager-loads these non-package extension modules to show their explicit command summaries; if an import fails, help keeps the command visible with a generic placeholder and prints a warning. Package manifests provide top-level help metadata without executing TypeScript:

```json
{
	"ns": {
		"commands": [
			{
				"name": "greet",
				"description": "Say hello.",
				"fullDescription": "Say hello with custom project policy.",
				"entry": "./src/greet.ts"
			}
		]
	}
}
```

Manifest command entries require `name`, `description`, and a relative POSIX-style `entry` path to a `.ts` or `.js` file. `fullDescription` is optional and defaults to `description`.

ji extension modules default-export an extension object created with `defineExtension()`. A command contribution is one entry in the extension's optional `commands` array; extensions may omit `commands` when they have no command contributions for the current ji surface.

```ts
import { defineExtension, ok } from "@ns/kernel/sdk";

export default defineExtension({
	commands: [
		{
			name: "greet",
			summary: "Say hello.",
			description: "Say hello with custom project policy.",
			run() {
				return ok("hello");
			},
		},
	],
});
```

Command path segments must match `[a-z][a-z0-9-]*`. Manifest `path` entries can declare nested command paths such as `slot gt up`; slashes, colons, spaces, and uppercase names are not supported.

Duplicate command names within one extension root are errors. Across roots, higher-precedence sources override lower-precedence sources: project overrides XDG global and built-in; XDG global overrides built-in. Overrides are recorded as non-fatal diagnostics.

Discovery is side-effect-light: `ns --version`, `ns --runtime`, and unselected command lookup read only built-in definitions, filesystem entries, and JSON manifests. Top-level help (`ns`, `ns --help`, and `ns -h`) additionally imports and validates non-package direct-file and directory-index extension modules so the command list can show their real summaries; package manifest commands are not imported for the listing. Malformed discovery entries and help-time import failures that do not affect a selected command are printed as stderr warnings while the invocation continues and stdout remains reserved for primary output. Discovery diagnostics that affect the selected command are fatal, including higher-precedence broken overrides that would otherwise fall back to lower-precedence commands. ji imports and validates exactly one external ji extension contribution when a command is selected, including selected-command help and JSON schema.

The legacy `.ns/commands/<command>.ts` path has been removed. It is not a compatibility fallback.

Dynamic Pi `/ns:*` mirrors are not part of this first general extension-loading slice. In this repository, exact `/ns:flow:*` mirrors delegate to the grouped project-local `ns flow` lifecycle commands: changes, cp, autobranch, branch-latest-commit, autoslot, submit, regenerate-pr, push, land, and pull-trunk. Arbitrary ji extension command entries are not dynamically mirrored into Pi; new exact mirrors require an explicit Pi adapter and package tests.

## ji extension API

ji extension authors import the SDK surface, including schema builder `z`, from the `@ns/kernel/sdk` subpath:

```ts
import { defineExtension, failed, ok, z } from "@ns/kernel/sdk";
import type { NsExtensionApi, NsResult } from "@ns/kernel/sdk";
```

`@ns/kernel/sdk` is the ji author SDK subpackage and the SDK layer; `@ns/kernel` is the host/kernel container that loads extensions. That `@ns/kernel/sdk` subpath is the public author API for ji extensions. The complete, authoritative reference for every export — `defineExtension()`, the command and result types, `NsExtensionApi` and its execution capabilities, schema builder `z`, and the command-evidence and text-generation helpers — lives in [`docs/sdk-reference.md`](./docs/sdk-reference.md). When the SDK re-exports lower-package types or helpers, extension authors should treat them as first-party SDK vocabulary rather than importing lower packages directly.

ji command entries own their prompts, validation, repair policy, and exact external commands. They should not import internal ji implementation modules.

Single-file ji extension modules such as `.ns/extensions/<name>.ts` are leaf authoring surfaces, not shared libraries. Workspace packages must not import from them. If package code needs behavior first proven inside a single-file extension, move or copy the reusable contract into a package-owned module and expose it deliberately through `@ns/kernel/sdk` or another documented package export; do not create a package → extension dependency.

The command-first promotion rule is evidence driven: copy or localize behavior while one command is proving a seam, extract shared helpers inside the owning `.ns/extensions/` package only when that keeps project-local authoring readable, and promote a helper into `@ns/kernel/sdk` only after multiple command slices prove the shape or a single-command necessity is explicitly documented. Promotion should deepen the kernel boundary; it should not merely make one command easier by exposing implementation internals.

## Internal workspace exports and Capability APIs

The author SDK is the `@ns/kernel/sdk` subpath. Remaining `@ns/kernel` subpaths are narrow `ji.internalWorkspaceExports` for ji-owned kernel/presentation surfaces such as CLI/context/Pi text-generation integration; they are not plugin-author APIs and should not be documented as stable extension surfaces.

SDK-independent domain primitives that used to live behind `@ns/kernel/*` internal subpaths now live as precise `@ns/capability-kit/*` subpaths. Those helpers are internal workspace building blocks for first-party capability code, not public SDK author API.

Consumer capability packages use Capability APIs, not the ji SDK, for deliberate in-process dependencies. The ratified Capability API convention is `@ns/<cap>/api`; package roots and command faces are not consumer-facing domain APIs unless the owning package documents that surface explicitly.

## Flow capability-area maturity

The grouped flow extension uses a conservative maturity ladder for repeated command-author seams:

1. **Raw:** command-local logic built directly on kernel primitives such as `ctx.exec`, `ctx.textGenerator`, `ctx.stdout`, `ctx.stderr`, `ctx.confirm`, `ctx.env`, and `ctx.cwd`.
2. **Flow-shared:** repeated repo-local mechanics extracted under `ts/packages/capabilities/flow/src/shared/` in the `@ns/flow` workspace package, for example current helpers for Git mechanics, checkpoint-message/model wiring, worktree facts, text helpers, and CCC CLI delegation.
3. **Internal export / capability-building primitive:** package-owned behavior reached through documented internal workspace subpaths. ji-owned kernel/presentation seams stay under `@ns/kernel/*`; SDK-independent checkpoint/worktree/temp/text primitives live under precise `@ns/capability-kit/*` subpaths unless and until a separate decision promotes them to `@ns/kernel/sdk`.
4. **Public SDK:** a separately approved promotion into `@ns/kernel/sdk`. This remains deferred for the flow consolidation track except for already documented SDK exports.

This ladder is a readiness model, not an automatic promotion pipeline. Flow-shared helpers keep this repository's grouped `@ns/flow` command package readable; internal workspace exports support package-to-package migration; neither tier is public extension-author API.

## `cp`

Create a checkpoint commit for the current diff.

```bash
ns flow cp
ns flow cp --dry-run
```

In this repository, `ns flow cp` is discovered through the project-local flow adapter manifest at `.ns/extensions/flow`, with implementation owned by `@ns/flow/commands/cp`; it is not a universal built-in ji command.

Behavior:

- captures the current pending worktree snapshot with git fact commands;
- refuses `main` and `master` branches before generating a message or committing;
- refuses clean worktrees with `Working tree is clean; nothing to checkpoint.`;
- asks the configured text-generation model for a validated `[cp]` commit message, with one repair attempt for invalid output;
- stages all changes with `git add -A`, commits using the prepared message, reads `git log -1 --oneline`, then prints the commit summary plus checkpoint message;
- with `--dry-run`, previews the model-authored checkpoint message and branch without running `git add`, `git commit`, or `git log`.

Environment:

- `NS_CHECKPOINT_MODEL`: model reference for generated checkpoint messages.
- `NS_DEV_CHECKPOINT_MODEL`: transitional fallback for the old checkpoint model selection.

Pi exposes the same capability as `/ns:flow:cp`. Old compatibility aliases such as `/code:cp`, `/code:checkpoint`, `/ns:code:cp`, and `/ns:code:checkpoint` are not restored.

## `autobranch`

Create a Graphite branch from dirty worktree changes.

```bash
ns flow autobranch
ns flow autobranch --slug <slug>
```

In this repository, `ns flow autobranch` is discovered through the project-local flow adapter manifest at `.ns/extensions/flow`, with implementation owned by `@ns/flow/commands/autobranch`; it is not a universal built-in ji command. Hidden `ccc exec autobranch` remains for CCC/internal compatibility, but the public agent and Pi boundary is `ns flow autobranch` / `/ns:flow:autobranch`.

Behavior:

- stashes tracked and untracked changes, creates a Graphite branch with `gt create`, restores the stash, and creates a checkpoint commit;
- refuses clean worktrees with guidance to use `ns flow branch-latest-commit` for latest-commit splitting;
- derives branch slugs with the ji slug model unless `--slug` is supplied;
- generates checkpoint messages with the same `[cp]` checkpoint-message policy as `ns flow cp`.

Environment:

- `NS_SLUG_MODEL`: model reference for generated branch slugs.
- `NS_CHECKPOINT_MODEL`: model reference for generated checkpoint messages.
- `NS_DEV_CHECKPOINT_MODEL`: transitional fallback for the old checkpoint model selection.

Pi exposes the same capability as `/ns:flow:autobranch`. Flat `/ns:autobranch`, `/code:autobranch`, and `/newbr` are not restored as compatibility surfaces.

## `branch-latest-commit`

Move the latest eligible unpushed single-parent commit on a clean worktree to a new Graphite child branch.

```bash
ns flow branch-latest-commit
ns flow branch-latest-commit --slug <slug>
```

In this repository, `ns flow branch-latest-commit` is discovered through the project-local flow adapter manifest at `.ns/extensions/flow`, with implementation owned by `@ns/flow/commands/branch-latest-commit`; it is a focused public surface for the clean latest-commit split workflow.

Behavior:

- requires a clean worktree and refuses pending changes with guidance to use `ns flow autobranch` for dirty worktree changes;
- moves the latest eligible unpushed single-parent commit onto a new Graphite child branch using the existing recovery branch, source reset, `gt create`, child hard reset, HEAD verification, and cleanup transaction;
- derives branch slugs with the ji slug model unless `--slug` is supplied;
- stays local-only: it does not push, publish, submit, or update PRs.

When the latest commit belongs on its own Graphite child branch, agents should use `ns flow branch-latest-commit --slug <slug>` instead of manually running `git reset HEAD^` plus `gt create`.

Pi exposes the same capability as `/ns:flow:branch-latest-commit`.

Environment:

- `NS_SLUG_MODEL`: model reference for generated branch slugs.

## `changes`

Summarize outstanding worktree changes without committing.

```bash
ns flow changes
```

Behavior:

- captures the current pending worktree snapshot with read-only git commands;
- prints `Working tree is clean; no outstanding changes.` for clean worktrees;
- for dirty worktrees, asks the configured text-generation model for 1–4 reviewer-facing bullets, then prints the bullets and raw porcelain status lines;
- does not stage, commit, stash, switch branches, run Graphite, or call GitHub.

Environment:

- `NS_CHANGES_MODEL`: model reference for generated changes summaries.
- `PI_DRAFT_MODEL`: transitional fallback for the old Pi changes-summary model selection.

Pi exposes the same capability as `/ns:flow:changes`; `/code:changes` is not retained as a compatibility alias.

## `submit`

Checkpoint outstanding changes, then submit the current Graphite branch and downstack ancestors.

```bash
ns flow submit [--no-restack] [--verbose]
```

Behavior:

- checkpoints pending worktree changes before submission using the same `[cp]` checkpoint-message policy as `ns flow cp`;
- preflights Graphite submit readiness with `gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web --dry-run`;
- runs `gt restack --downstack --no-interactive` automatically when Graphite requires a restack, unless `--no-restack` is set;
- prepares initial PR metadata for new single-commit branches in the current branch's downstack submit scope before submission when possible;
- submits with `gt submit --no-edit --publish --no-stack --no-ai --no-interactive --no-view --no-web`, verifies the current PR, and generates or validates managed PR descriptions through `gh pr view`, `gh pr diff`, `git patch-id --stable`, and `gh pr edit`;
- writes raw submit-failure transcripts and asks the configured model for concise failure summaries when submission, restack, verification, checkpoint, or PR-description phases fail;
- with `--verbose`, streams raw Graphite/subprocess stdout and stderr in addition to concise progress.

Environment:

- `NS_CHECKPOINT_MODEL`: model reference for generated checkpoint messages.
- `NS_DEV_CHECKPOINT_MODEL`: transitional fallback for the old checkpoint model selection.
- `NS_DEV_PR_DESCRIPTION_MODEL`: model reference for generated PR descriptions.
- `NS_DEV_PR_DESCRIPTION_PROMPT`: optional custom PR-description prompt file.
- `NS_SUBMIT_FAILURE_MODEL`: model reference for generated submit-failure summaries.
- `NS_SUBMIT_FAILURE_LOG_DIR`: optional directory for raw submit-failure transcripts.

Pi exposes the same capability as `/ns:flow:submit`. `/dev:submit`, `/submit`, and other legacy submit aliases are not restored.

## `regenerate-pr`

Regenerate the current branch PR title and ji-managed generated body region.

```bash
ns flow regenerate-pr [--force]
```

Behavior:

- resolves the current branch PR through `gh pr view --json number,url,title,body,headRefName,baseRefName`;
- computes the same stable patch id as `gh pr diff <number> | git patch-id --stable`;
- asks the configured PR-description model for a fresh title and body even when `ns flow submit` would skip the PR as unchanged;
- replaces or inserts only the ji-managed generated body region and preserves human PR body text outside that region;
- asks for confirmation immediately before `gh pr edit`; if confirmation is declined or unavailable, GitHub is not edited;
- accepts `--force` as a compatibility no-op that does not bypass confirmation.

Environment matches PR description generation for `ns flow submit`:

- `NS_DEV_PR_DESCRIPTION_MODEL`: model reference for generated PR descriptions.
- `NS_DEV_PR_DESCRIPTION_PROMPT`: optional custom PR-description prompt file.

Pi exposes the same capability as `/ns:flow:regenerate-pr`. `ns pr-regen`, `/ns:pr-regen`, and `/code:pr-regen` are not retained as compatibility surfaces.

## Future extension classification

Use these cut lines when deciding where a lifecycle workflow belongs:

- **Kernel service:** discovery, loading, precedence, command presentation, execution/context primitives, and small author helpers with proven reuse or explicit necessity.
- **Project-local extension:** repo-specific workflow policy, prompts, external command choreography, and command names that should travel with this checkout but not every ji installation.
- **Future bundled extension:** reusable first-party workflow behavior whose portable contract has been proven outside a single repository; still out of scope for the current command-first migration.
- **Internal workspace export:** package-to-package sharing during migration, not an author API and not a reason for `.ns/extensions/*.ts` files to import implementation modules.

## Testing future command migrations

Future ji command slices should update tests and docs with the command surface change:

- ji CLI scenario tests should cover the user-facing surface being introduced, such as `ns flow <name>` for this repository's grouped flow commands or `ns <name>` for a flat extension entry.
- Pi registration and parity tests should cover the exact mirror, such as `/ns:flow:<name>` for grouped flow commands, when a command is exposed in Pi.
- Source searches should prove stale old command names and `/code:<name>` surfaces were deleted or are mentioned only as explicitly labeled migration-away context.
