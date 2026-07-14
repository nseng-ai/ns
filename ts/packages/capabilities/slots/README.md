# @nseng-ai/slots

`@nseng-ai/slots` owns Slot domain logic, operations, the Slot Capability API, and the bundled ns extension contribution for `ns slot ...`. The supported command-line surface is **only** through the ns binary:

```bash
ns slot list
ns slot checkout feature-x
ns slot gt exec stack-branches --format json
```

The package does not expose or install a top-level `slot` executable. The ns SDK discovers Slot through the generic extension descriptor rather than importing Slot directly. First-party users that need in-process access should use curated exports such as `@nseng-ai/slots/api` rather than parsing command output.

## Installation

Install the ns tool shim with the repository tool installation flow, then invoke Slot commands as `ns slot ...`. There is no `just install-slot` recipe and no supported `$HOME/.local/bin/slot` shim.

## Core commands

- `ns slot init --size N` creates `slot-01` through `slot-N` as detached worktrees at trunk.
- `ns slot checkout BRANCH` checks a branch out into the lowest-numbered clean detached managed slot.
- `ns slot checkout --new NEW [BASE]` creates and checks out a new branch.
- `ns slot checkout --current` moves the current branch into a managed slot.
- `ns slot list` renders the pool from `git worktree list`.
- `ns slot goto`, `ns slot claim`, `ns slot free`, `ns slot gc`, and `ns slot resize` provide the remaining slot lifecycle operations.
- `ns slot foreach -- git clean -fd` runs a command in every managed slot worktree (sequentially, in slot-number order). It aborts when any slot has a git operation in progress, and prompts for confirmation unless `--yes` is passed. Pass the command after `--`; flag-bearing commands (e.g. `-fd`) require the `--` separator.
- `ns slot provision apply` and `ns slot provision import` copy declared gitignored files between the per-repo provision store and slot worktrees (see "Provisioned files").
- `ns slot gt ...` contains Graphite-aware slot navigation and hidden agent exec helpers.

A full pool fails with `pool_full`; run `ns slot free` or `ns slot resize` first.

## Provisioned files

Slot worktrees share git history but not gitignored files, so files a worktree needs to function — `.env.local` secrets, tool link files like `.vercel/project.json` — never travel with a branch. Provisioned files close that gap.

Declare the repo-relative file paths in `ns.toml` (the git-native contract):

```toml
[slots]
provision = [".env.local", "ts/packages/capabilities/vercel/.env.local"]
```

Entries must be exact repo-relative file paths: no absolute paths, no `..`/`.` segments, no trailing slashes, no glob characters, no duplicates. A missing `ns.toml` or `[slots]` table simply means nothing is declared.

File content lives outside git in a per-repo, machine-local store under the slots state root: `<slotsRoot>/repos/<repoName>/provision/default/<repo-relative-path>` (directories created `0700`; file modes preserved on copy). Content flows one way, store → worktree; nothing ever copies back automatically.

- `ns slot provision import [PATH...]` is the deliberate promotion step: it copies declared files from the current worktree into the store. With no arguments it imports every declared file present in the worktree (missing files are notices, not failures); an explicit path that is not declared fails with `not-declared`.
- `ns slot init`, `ns slot resize`, `ns slot checkout`, and `ns slot claim` fill gaps after placement: each declared file is copied into the slot only if absent. Existing files are never touched, and provisioning problems become notices — placement never fails because of provisioning.
- `ns slot provision apply` fills gaps across all managed slots on demand and reports worktree copies that differ from the store (exit 1 while any remain). `--force` is the only overwrite path: it replaces differing copies and resets their file mode.

Output names paths only; provisioned file contents never appear in command output.

## Shell integration

Slot navigation remains discoverable from the Slot command tree:

```bash
ns slot shell show --shell zsh
ns slot shell install --shell zsh
ns slot shell install --shell bash
```

`ns slot shell` installs the canonical ns shell wrapper. The wrapper defines `ns()`, uses `NS_CD_DIRECTIVE_FILE`, invokes `command ns "$@"`, and lets successful human-output navigation commands such as `ns slot checkout`, `ns slot goto`, `ns slot gt up`, and `ns slot gt down` move the parent shell.

`--no-clipboard` skips clipboard writes only; it does not disable an active parent-shell `cd`.

During the extension-contract transition, the Slot ns extension uses the current `@nseng-ai/sdk` command metadata. Some legacy short option aliases, hidden-help details, and machine-output cd-directive behavior may differ from the old Clinkr-mounted command group until the generic extension contract grows those features.

## Completion

Standalone Slot completion is not supported. Use ns-level shell completion when available; do not install completion for a `slot` command.
