# @nseng-ai/ns

The `ns` CLI, distributed as a single self-contained npm package. Installing it gives you
the `ns` binary — the shared command surface that you and your coding agents use to run
multi-session, multi-branch software work in a git-native way.

`@nseng-ai/ns` ships **bare core**: repository activation (`ns init`) and extension
management (`ns extension …`). Extensions such as Objectives are installed on top as ns
extensions — see [Add Objectives](#add-objectives).

## Prerequisites

- **Node.js 24.12 or later.** The published package is a self-contained bundle — no build
  step and no other runtime dependencies.
- **git.** Project activation and project-scoped workflows are git-native: durable state
  lives in your repository as plain files and refs, not in a hidden database. User-scoped
  extension commands and installed command surfaces can run outside a repository.
- **A coding-agent harness** for the full workflow: Claude Code, Codex, or Pi. The CLI
  works standalone, but Objectives are designed to be driven by agents.

## Install

Global:

```bash
npm install -g @nseng-ai/ns
```

Or run without installing:

```bash
npx @nseng-ai/ns --help
```

## Verify

```bash
ns --help
ns extension list
```

A fresh install is bare core: it does **not** include `ns objective`. That command surface
arrives when you install the Objectives extension (below).

## Activate ns in a repository

From your repository root:

```bash
ns init --supported-harness claude-code   # or: codex, pi
```

`ns init` writes the repository's supported harnesses to `ns.toml`, generates a
harness-neutral agent-instruction block, creates declared consumer directories, and
provisions core harness artifacts. The selection is explicit on the first run; repeat
`--supported-harness` to declare more than one:

```toml
supported_harnesses = ["claude-code", "codex"]
```

`supported_harnesses` declares the agent harnesses this repository supports. ns uses the
list to provision and reconcile extension-provided skills and other agent-facing artifacts
in each harness's project directory. It does not restrict which tools contributors may use.
`ns init` writes files but never commits — review and commit the changes yourself.

## Add Objectives

Objectives — durable, checked-in planning records for work that outlives a single agent
session — are the `@nseng-ai/objectives` extension:

```bash
ns extension install npm:@nseng-ai/objectives
```

This records the extension in `ns.toml`, activates it for the repository's supported
harnesses, adds the `ns objective` CLI, and provisions the ten Objective skills into each
supported harness's skill root (for example, `.claude/skills/` for Claude Code). See
[`@nseng-ai/objectives`](../../incubating/extensions/objectives/README.md) for the full lifecycle.

Once installed, drive an Objective through its lifecycle with your agent:

- **Create** — "Create an objective for migrating our API layer to typed handlers."
- **Advance** — "What's next on the api-typed-handlers objective?"
- **Update** — "Update the objective with what we landed."
- **Close** — "Close the objective."

Inspect records deterministically from the terminal:

```bash
ns objective list
ns objective show <slug>
```

## Choose extension scope

Use **user-scoped availability and artifacts** when you want an extension's commands and
point definitions available across local repositories and its bundled skills provisioned
into configured user harness roots. Use **project-scoped activation** when a repository also
needs the extension's repository-specific instructions, consumer directories, point
installations, hooks, prompts, models, settings, or project harness artifacts. These phrases
describe the effect of the selected scope, not separate extension types or lifecycle states.

Project scope is the default for `ns extension install|list|update|uninstall`: it records
the extension in the repository and reconciles its declared activation metadata. Use
`--scope user` (`-s`) for machine-wide declarations whose contributions are gated by an
explicit Active harness — the invocation's `NS_HARNESS` must name a canonical harness
(`claude-code`, `codex`, `pi`) listed in the user config's top-level `supported_harnesses`
array, or every user contribution stays hidden fail-closed (ADR 0055):

```bash
ns extension install npm:@acme/my-extension --scope user
ns extension list --scope user
ns extension update npm:@acme/my-extension --scope user
ns extension uninstall npm:@acme/my-extension --scope user
```

User declarations and their top-level `supported_harnesses` live in
`$XDG_CONFIG_HOME/ns/ns.toml` (default `$HOME/.config/ns/ns.toml`). Install, update, and
uninstall use that configured set to reconcile bundled skills into each harness's user root;
editing the set alone does not immediately reconcile existing declarations. This lifecycle
provisioning is independent of whether the current invocation's Active harness enables the
User command/point layer.

Explicit `npm:` sources are installed with lifecycle scripts
disabled into isolated private projects under
`$XDG_DATA_HOME/ns/extensions/npm/<package-name>/` (default
`$HOME/.local/share/ns/extensions/npm/<package-name>/`). Unprefixed sources are local
package directories: ns records a lexical absolute path and uses the checkout in place.
If that checkout moves, reinstall from its new path or uninstall the old declaration; list
and update report the stale source without disabling unrelated commands.

Admission is all-or-nothing: invalid command metadata, a reserved Built-in path, an
unsatisfied package requirement, or another package's command-shape collision makes the
complete package unavailable. Install acquires npm bytes, then checks the proposed complete
User catalog before changing config and rolls newly acquired bytes back if descriptor
loading, admission, or config mutation fails. List retains rejected declarations as
`unavailable`; update refuses unavailable packages; uninstall remains available for recovery.

An unversioned `npm:<name>` declaration floats and refreshes on explicit update. A pinned
`npm:<name>@<version>` update only ensures/restores the declared version. Repeating an
install ensures missing bytes but does not refresh an existing floating package. npm
uninstall removes only the package's lifecycle-owned private project (and an empty npm
scope directory); local source bytes and sibling packages are preserved. If declaration
removal succeeds but cleanup fails, command availability is already removed and rerunning
uninstall retries cleanup.

User scope never performs Project activation or writes extension contributions into a
repository. Repository-specific instructions, consumer directories, point installations,
hooks, prompts, models, and extension settings remain dormant; only bundled skills are
reconciled into configured **user** harness roots. A project may declare the same package
for project-scoped activation; that project declaration replaces the user declaration as a
whole package rather than mixing versions. For different packages that contribute the same
command path, project declarations take precedence over user declarations. Collisions
within one scope are errors, and built-in host commands remain reserved at both scopes.
Installing from this repository with `just install-ns` still installs only the
source-backed ns executable shim and never edits user extension configuration.

> **Trust warning:** `--ignore-scripts` disables npm lifecycle scripts, but descriptors and
> selected commands are executable extension code. Install only extensions you trust.

## SDK subpaths

The package also owns the public SDK subpaths for checkout-free consumers, for example
`@nseng-ai/ns/sdk` and `@nseng-ai/ns/sdk/*`. The standalone workspace `@nseng-ai/sdk`
package remains private and is folded into these `@nseng-ai/ns` subpaths at
package-preparation time.

## Package internals

The source workspace manifest intentionally has no executable, because `bin/ns.js` does not
exist in a source checkout. The package preparation step adds `bin.ns = bin/ns.js` to the
generated publish manifest only, and copies the prebuilt JavaScript there; developer
source-checkout shims stay separate from this npm package boundary. Maintainer release
qualification runs through the package's
`publish:dry-run`, `pack:local`, and `smoke:checkout-free` scripts (`pnpm --dir ts --filter
@nseng-ai/ns run …`); actual publication is a separate authorized step.
