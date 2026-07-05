# Flow command dependencies

Per-command runtime dependencies for the `flow` extension. Use this to understand
what each command actually requires at runtime — and therefore which commands a user
could adopt without the full ns/Graphite/slots stack.

> **Package vs. command dependencies.** The extension manifest
> (`.ns/extensions/flow/`) is thin: each command is a one-line re-export of the
> `/flow` workspace package (`ts/packages/capabilities/flow/`). That package's
> `package.json` declares the *union* of every command's dependencies
> (`@nseng-ai/graphite`, `@nseng-ai/slot`, `@nseng-ai/github`, …), so adopting the package pulls
> everything. The table below is what each command exercises **at runtime**.

## Dependency axes

| Axis        | Meaning                                                                                                                           |
| ----------- | --------------------------------------------------------------------------------------------------------------------------------- |
| **git**     | Plain `git`. Universal baseline — every command needs it.                                                                         |
| **gt**      | The Graphite binary. Branch/stack creation, submit, land, trunk resolution.                                                       |
| **gh**      | The GitHub CLI binary. Reading/merging/updating PRs.                                                                              |
| **sqlite3** | `sqlite3` plus a Graphite-initialized repo DB. Only the metadata reader.                                                          |
| **LLM**     | Model access via `@nseng-ai/capability-kit/text-generation` (model-ref env vars). Commit messages, branch slugs, PR descriptions. |
| **Slots**   | The managed worktree slots subsystem.                                                                                             |

How `gt`/`gh` is reached varies: some commands shell out directly (`exec("gt", …)`),
some go through the `@nseng-ai/graphite` / `@nseng-ai/github` libraries (which themselves spawn
the binaries), and `exec-read-graphite-branch-metadata` bypasses `gt` entirely to read
the Graphite **SQLite DB** with `sqlite3`.

## Per-command matrix

| Command                                | git | gt  | gh  | sqlite3 | LLM | Slots | Notes                                                                                                 |
| -------------------------------------- | :-: | :-: | :-: | :-----: | :-: | :---: | ----------------------------------------------------------------------------------------------------- |
| **push**                               |  ✓  |  –  |  –  |    –    |  –  |   –   | Plain `git push` only; does not update Graphite metadata and is not for Graphite-tracked PR branches. |
| **changes**                            |  ✓  |  –  |  –  |    –    | ✓¹  |   –   | Read-only git snapshot + model summary.                                                               |
| **cp**                                 |  ✓  |  –  |  –  |    –    | ✓²  |   –   | Checkpoint commit.                                                                                    |
| **autobranch**                         |  ✓  |  ✓  |  –  |    –    | ✓³  |   –   | Direct `exec("gt", …)` (create/track).                                                                |
| **branch-latest-commit**               |  ✓  |  ✓  |  –  |    –    | ✓³  |   –   | Direct `exec("gt", …)` (create/children).                                                             |
| **autoslot**                           |  ✓  |  ✓  |  –  |    –    | ✓³  |   ✓   | autobranch + `@nseng-ai/slot/api` (move into slot).                                                   |
| **regenerate-pr**                      |  ✓  |  –  |  ✓  |    –    |  ✓  |   –   | `@nseng-ai/github/cli`; **no gt**.                                                                    |
| **submit**                             |  ✓  |  ✓  |  ✓  |    –    |  ✓  |   –   | `@nseng-ai/graphite/branch` (gt submit) + gh PR metadata.                                             |
| **land**                               |  ✓  |  ✓  |  ✓  |    –    |  –  |  ✓⁴   | `@nseng-ai/graphite` + `gh pr view/merge`; slots optional.                                            |
| **pull-trunk**                         |  ✓  |  ✓  |  –  |    –    |  –  |   –   | `@nseng-ai/graphite/branch` (resolve trunk + refresh).                                                |
| **exec-read-graphite-branch-metadata** |  –  |  –  |  –  |    ✓    |  –  |   –   | Reads Graphite DB via `sqlite3`, **not** `gt`.                                                        |

1. `changes` calls the model only when the worktree is dirty; a clean worktree
   short-circuits with no LLM call.
2. `cp` uses the model to draft the checkpoint commit message.
3. `autobranch` / `branch-latest-commit` / `autoslot` use the model to generate the
   **branch slug**; skippable when a slug is supplied explicitly.
4. `land`'s slot dependency is **conditional and opt-in** (`--free`). It detects
   managed slots by path regex (`ns/slots/repos/.../worktrees/slot-*`) and shells out
   to `ns slot free` — it does **not** import `@nseng-ai/slot`. Land works fully without
   slots; it just keeps the branch/worktree.

## Independence tiers

Grouped by how much of the stack a command needs, for adoptability planning.

- **Tier 0 — git only:** `push`. Drop-in anywhere.
- **Tier 1 — git + LLM:** `changes`, `cp`. No Graphite/GitHub/slots. Both degrade
  without model access (no summary / no auto-message), so a `--message` / fallback
  path makes them fully model-optional.
- **Tier 2 — git + gt (+ optional LLM for naming):** `autobranch`,
  `branch-latest-commit`, `pull-trunk`. Require Graphite installed and the repo
  gt-tracked.
- **Tier 3 — git + gt + gh (PR-facing):** `submit`, `land` (LLM-free), and
  `regenerate-pr` (gh + LLM but **no gt**).
- **Tier 4 — slots-coupled:** `autoslot` is the only command with a *hard* slot
  dependency.
- **Internal:** `exec-read-graphite-branch-metadata` depends on `sqlite3` + a
  Graphite-initialized repo DB; it is a flow-internal helper, not a standalone command.

No flow command depends on branch-context or brmem.
