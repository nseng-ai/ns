# @nseng-ai/ns

The `ns` CLI, distributed as a single self-contained npm package. Installing it gives you
the `ns` binary — the shared command surface that you and your coding agents use to run
multi-session, multi-branch software work in a git-native way.

`@nseng-ai/ns` ships **bare core**: repository activation (`ns init`) and extension
management (`ns extension …`). Extensions such as Objectives are installed on top as ns
extensions — see [Add Objectives](#add-objectives). ns can invoke installed skills, but it
does not manage them.

## Prerequisites

- **Node.js 24.12 or later.** The published package is a self-contained bundle — no build
  step and no other runtime dependencies.
- **git.** Project activation and project-scoped workflows are git-native: durable state
  lives in your repository as plain files and refs, not in a hidden database. User-scoped
  extension commands can run outside a repository.
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
arrives when you install the Objectives extension.

## Activate ns in a repository

From your repository root:

```bash
ns init
```

`ns init` needs no harness argument and saves no harness selection. It creates `ns.toml`,
generates repository-neutral agent instructions, and creates consumer directories declared
by active project extensions. The checked-in result can be used by any caller that
understands those instructions. Initialization does not provision skills or other extension
artifacts into `.claude`, `.agents`, `.pi`, or user-level harness roots.

`ns init` writes files but never commits — review and commit the changes yourself.

## Add Objectives

Objectives — durable, checked-in planning records for work that outlives a single agent
session — are the `@nseng-ai/objectives` extension:

```bash
ns extension install npm:@nseng-ai/objectives
```

This records the extension in `ns.toml`, applies its repository activation metadata, and
adds the `ns objective` CLI. Extension installation does not copy Objective skills into a harness. Install a
first-party ns skill separately with the direct `npx skills` workflow when you want one:

```bash
npx skills add nseng-ai/ns --skill objective --full-depth
```

`npx skills` owns skill acquisition, installation, updates, removal, and
`skills-lock.json`. Repository files own first-party skill sources and topology, checked-in
Harness Overlays, and invocation metadata. There is no `ns skills`, top-level `ns update`,
or `ns skill-exposure` command.

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

Use **user scope** when you want an extension's commands and Point definitions available
across local repositories. These contributions are caller-independent: Pi, Claude Code,
Codex, and direct terminal invocations resolve the same admitted User catalog without a
caller-specific environment variable or persisted harness selection.

Use **project scope** when a repository also needs an extension's activation instructions,
consumer directories, Point definitions, or project settings. Project scope is the default
for `ns extension install|list|update|uninstall`; use `--scope user` (`-s`) for machine-wide
declarations:

```bash
ns extension install npm:@acme/my-extension --scope user
ns extension list --scope user
ns extension update npm:@acme/my-extension --scope user
ns extension uninstall npm:@acme/my-extension --scope user
```

User declarations live in `$XDG_CONFIG_HOME/ns/ns.toml` (default
`$HOME/.config/ns/ns.toml`). Explicit `npm:` sources are installed with lifecycle scripts
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
`npm:<name>@<version>` update only ensures or restores the declared version. Repeating an
install ensures missing bytes but does not refresh an existing floating package. npm
uninstall removes only the package's lifecycle-owned private project (and an empty npm
scope directory); local source bytes and sibling packages are preserved. If declaration
removal succeeds but cleanup fails, command availability is already removed and rerunning
uninstall retries cleanup.

User scope never activates repository instructions, consumer directories, hooks, prompt
installations, models, or extension-specific project settings. User Point definitions can
participate in the Point catalog, but Point installations remain Project-owned. A project
may declare the same package for project-scoped activation; that declaration replaces the
User declaration as a whole package rather than mixing versions. For different packages
that contribute the same command path or Point ID, Project declarations take precedence
over User declarations. Collisions within one scope are errors, and built-in host commands
remain reserved at both scopes.

No extension scope automatically installs or removes harness skills. Skill lifecycle and
lock state are owned by direct `npx skills` commands; ns workflows may invoke those commands
but do not manage skills. Installing from this repository with `just install-ns` still
installs only the source-backed ns executable shim and never edits user extension
configuration.

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
qualification runs through the package's `publish:dry-run`, `pack:local`, and
`smoke:checkout-free` scripts (`pnpm --dir ts --filter @nseng-ai/ns run …`); actual
publication is a separate authorized step.
