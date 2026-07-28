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
ns init --harness claude-code   # or: codex, pi
```

`ns init` writes `ns.toml`, generates a harness-neutral agent-instruction block, creates
the declared consumer directories, and provisions the core harness artifacts. The harness
is explicit on the first run and persisted to `ns.toml`; pass `--harness` more than once to
support multiple harnesses. `ns init` writes files but never commits — review and commit
the changes yourself.

## Configure repository trunk discovery

Workflows that need the repository's trunk identity use Git's locally cached remote refs.
By default, ns selects remote `origin` and reads its cached symbolic HEAD at
`refs/remotes/origin/HEAD`. You can override either part in repository-root `ns.toml`:

```toml
[git]
remote = "upstream"
trunk = "main"
```

`git.remote` defaults to `origin`. `git.trunk` is optional and takes precedence over the
selected remote's cached HEAD. It must be a plain Git branch name, not a remote-qualified
name (`origin/main`), full ref, tag, commit SHA, or revision expression.

Resolution is local and offline: ns does not contact the server, and a cached remote HEAD
can be absent or stale. A successful resolution verifies that both the local branch
`refs/heads/<branch>` and selected remote-tracking branch
`refs/remotes/<remote>/<branch>` exist, but it does not prove that either ref is current on
the server. ns never guesses `main` or `master`.

If discovery fails:

- fetch or create the missing local and remote-tracking trunk refs;
- set `git.trunk` explicitly when the remote's default branch is not represented locally;
- refresh a missing, stale, or dangling cached remote HEAD with
  `git remote set-head <remote> --auto`; an ordinary `git fetch` does not necessarily
  refresh this symbolic ref; or
- correct invalid `[git]` values or unreadable/invalid `ns.toml`.

This policy controls repository trunk identity only. Workflows whose trunk value is part
of Graphite stack topology or configuration continue to use Graphite's trunk.

## Add Objectives

Objectives — durable, checked-in planning records for work that outlives a single agent
session — are the `@nseng-ai/objectives` extension:

```bash
ns extension install npm:@nseng-ai/objectives
```

This records the extension in `ns.toml`, activates it for your configured harness, adds the
`ns objective` CLI, and provisions the ten Objective skills into your harness's skill root
(`.claude/skills/` for Claude Code). See
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
