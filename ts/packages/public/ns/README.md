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
- **git.** ns is git-native: durable state lives in your repository as plain files and
  refs, not in a hidden database. You run `ns` inside a git repository.
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

## User-scoped extension commands

A local extension can be declared once for machine-wide command availability without activating repository files:

```bash
ns extension install /absolute/path/to/my-extension --scope user
ns extension list --scope user
ns extension update /absolute/path/to/my-extension --scope user
ns extension uninstall /absolute/path/to/my-extension --scope user
```

User declarations live at `$XDG_CONFIG_HOME/ns/ns.toml` (falling back to `$HOME/.config/ns/ns.toml`). Admission is all-or-nothing: invalid command metadata, a reserved Built-in path, an unsatisfied package requirement, or another package's command-shape collision makes the complete package unavailable. Install checks the proposed complete User catalog before changing config; list retains rejected declarations as `unavailable`; update refuses unavailable packages; uninstall remains available for recovery. User scope never writes project activation files. User-managed npm acquisition is not implemented yet.

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
