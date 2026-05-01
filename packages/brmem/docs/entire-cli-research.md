# Research Note: Git-Internals Techniques in the Entire CLI

**Author:** Nick Schrock (with Claude)
**Date:** 2026-04-30
**Subject repo:** `github.com/entireio/cli` (`/Users/schrockn/code/githubs/entireio/cli`)
**Audience:** brmem maintainers and anyone building tools that store data out-of-band in git

## Why this document exists

`brmem` and Entire CLI both store metadata in git refs out-of-band from the
working branch. They've made different design choices and have invested in
different parts of the problem. Entire is a much larger, more mature codebase
(Go, ~7 supported AI agents, cloud integration, signing, partial clones). It
has accumulated a body of "tribal knowledge" about git internals, hook
plumbing, and library pitfalls that is worth harvesting even though we are
not building the same product.

This document captures Entire's architecture, the specific git techniques
they use, the libraries they rely on (and avoid), and what is transferable
to brmem.

---

## 1. What Entire is, in one paragraph

Entire is a git-native session/lineage recorder for AI coding agents. It
hooks into both the agent's lifecycle (UserPromptSubmit, Stop, etc.) and
git's hooks (`prepare-commit-msg`, `post-commit`, `post-rewrite`,
`pre-push`), and records the full prompt/response transcript, files
touched, and token usage for every agent turn. The captured data is stored
on hidden git refs alongside the user's commits, linked by a 12-hex-char
checkpoint ID written into the user's commit message as a trailer
(`Entire-Checkpoint: a3b2c4d5e6f7`). The user's branch stays clean; all
detail lives on parallel refs that travel through the same `git
push`/`fetch`/`clone` plumbing as the code.

The product is ambitious; the parts of it that are interesting _to us_ are
the storage layer and the hook integration. The rest (cloud dispatch,
multi-agent translation, signing UX) is incidental for our purposes.

---

## 2. Storage architecture

Entire uses a three-tier storage model. Each tier serves a different
purpose; understanding the split is important because it informs which of
their techniques map onto our model and which don't.

### Tier 1: Live session state — filesystem

Path: `.git/entire-sessions/<session-id>.json`

Resolved via **`git rev-parse --git-common-dir`** (not `--git-dir`), so it
is shared across linked worktrees. This is the "live cursor" — base
commit, files touched so far, mid-turn checkpoint IDs, phase
(`ACTIVE`/`IDLE`/`ENDED`). Mutates frequently; lives outside refs because
it changes too often and is per-machine state.

**Lesson for brmem:** if we ever add per-machine sidecar state (caches,
locks, namespace indexes), put it under `git common-dir`, not `git dir`.
Refs under `refs/` are already shared across worktrees, so our current
ref-only model is naturally worktree-correct.

### Tier 2: Temporary checkpoints — shadow branches

Ref pattern: `refs/heads/entire/<HEAD-commit[:7]>-<worktreeHash[:6]>`

One shadow branch per `(base commit × git worktree)` pair. Each commit on
this branch is a **full worktree snapshot** plus an overlay directory
`.entire/metadata/<session-id>/` containing `full.jsonl` (transcript),
`prompt.txt`, and `tasks/<tool-use-id>/` for subagent traces. Multiple
concurrent sessions in the same directory interleave on the same shadow
branch; their metadata directories don't collide because they're keyed on
session ID.

The shadow branch is short-lived: it accumulates checkpoints during a
session and is **deleted** after condensation into Tier 3 on user commit.

**Notable techniques on this tier:**

- The branch name embeds `worktreeHash[:6]` so two worktrees rooted at the
  same base commit get distinct shadow branches and don't conflict.
- If the base commit changes without a user commit (the
  `stash → pull → apply` scenario), the shadow branch is **renamed** from
  `entire/<old-hash>-<wt>` to `entire/<new-hash>-<wt>`. This preserves
  in-progress checkpoints across remote-history changes.
- "Orphaned" shadow branches (branch exists but no session state file) are
  auto-reset on next session start, so a deleted state file doesn't cause
  the shadow ref to grow forever.

**Relevance to brmem:** low — we don't snapshot the working tree. But the
_pattern_ of "ref name encodes the context it's valid for, and migrate it
when the context changes" is generalizable. If we ever add per-commit
memory, we'd want similar migration logic.

### Tier 3: Committed checkpoints — single orphan branch

Ref: `refs/heads/entire/checkpoints/v1`

A single orphan branch. The tree at HEAD contains _all_ checkpoints ever
made, sharded by ID:

```
<id[:2]>/<id[2:]>/
├── metadata.json        # CheckpointSummary (aggregated stats)
├── 0/                   # First session in this checkpoint
│   ├── metadata.json
│   ├── full.jsonl       # transcript
│   ├── prompt.txt
│   └── content_hash.txt
├── 1/                   # Second concurrent session, if any
│   └── ...
```

The 256-way sharding is to avoid pathological directory listings as
checkpoints accumulate.

Each commit on this branch has subject `Checkpoint: <id>` and corresponds
to one user-commit's worth of metadata being added.

**Linkage to user commits:** the user's commit message gets a single
trailer:

```
Entire-Checkpoint: a3b2c4d5e6f7
```

added by the `prepare-commit-msg` hook. Bidirectional lookup:

- _commit → metadata_: parse the trailer, read the path
  `<id[:2]>/<id[2:]>/` from the tree at `entire/checkpoints/v1`.
- _metadata → commit(s)_: `git log --grep='Entire-Checkpoint: <id>' --all`.

**This is the most interesting pattern for us.** It is a clean
alternative to brmem's "one ref per `(namespace, branch)`" model, with
different tradeoffs:

|                          | brmem (one ref per slot)         | Entire (one orphan branch + content addressing) |
| ------------------------ | -------------------------------- | ----------------------------------------------- |
| Mutability               | Mutable per slot (puts/deletes)  | Append-only                                     |
| Survives branch delete   | No — ref is keyed on branch name | Yes — records keyed on random ID                |
| Linkage to commits       | Implicit (branch name)           | Explicit (commit trailer)                       |
| Number of refs to manage | One per `(ns, branch)`           | Exactly one                                     |
| Fetch / push             | Need ref glob `refs/brmem/*`     | Single ref                                      |
| Discovery                | `for-each-ref` glob              | `git log` on the orphan branch                  |
| Sharding                 | N/A (one ref per slot)           | Required; uses `<id[:2]>/<id[2:]>/`             |

Both are legitimate. brmem's model is better for _mutable, branch-scoped_
memory; Entire's is better for _append-only, commit-linked_ records. If
brmem ever wants to add a second storage mode for things like
"lessons-learned that should outlive the branch," we should adopt
Entire's pattern rather than stretching our current one.

---

## 3. Specific git techniques worth stealing

### 3.1 `pre-push` hook to ship metadata refs alongside code

When the user runs `git push`, Entire's `pre-push` hook (in
`manual_commit_hooks.go`) opportunistically pushes
`refs/heads/entire/checkpoints/v1` to the same remote. The push is
**best-effort** — failures are logged but don't block the user's code
push. Critical for UX: a server that doesn't allow the metadata refs
shouldn't break the developer's workflow.

There's a separate `checkpoint_remote` config and `ENTIRE_CHECKPOINT_TOKEN`
env var, so metadata can target a _different_ remote than `origin` (e.g. a
dedicated lineage server).

**For brmem:** this is the single highest-value adoption. Today, brmem
memory is local-only — a teammate who pulls a branch gets the code but not
the memory. A pre-push hook installed by `brmem init` (or a manual `brmem
push` command) would fix this:

```bash
# .git/hooks/pre-push
git push "$1" 'refs/brmem/*:refs/brmem/*' || true
```

Ship it as a Python entry point so we get config + error handling, but the
core is that one line.

### 3.2 Partial-clone filters on metadata fetches

Changelog entry: _"Filtered fetches for checkpoint refs to reduce clone/fetch size."_

When metadata blobs get large (transcripts, large notes), unconditional
fetch of every blob on every pull is painful. Entire uses
`--filter=blob:none` on metadata-only fetches:

```bash
git fetch --filter=blob:none origin 'refs/heads/entire/checkpoints/v1'
```

This pulls down commit and tree objects but leaves blobs as "promised" —
they're fetched lazily when an operation actually reads them. The server
must support partial clone (GitHub, GitLab, Gitea all do), and the local
repo needs `remote.<name>.promisor=true` configured. The first time you
run any partial-fetch against a remote, git auto-configures it.

**For brmem:** any future `brmem pull`/`brmem sync` command should use
`--filter=blob:none`. Listing keys (`brmem list`) only needs trees;
content is only fetched when `brmem get` actually reads a key. Big lever
for scale.

### 3.3 In-memory tree building (avoid the temp-index dance)

brmem's `_build_tree_from_entries` uses a temporary `GIT_INDEX_FILE`,
calls `git update-index --add --cacheinfo` per entry, then `git
write-tree`. This is the _correct_ way to do it via subprocess, and it
handles nested paths automatically. But it's also 2 + N subprocesses per
put.

Entire builds trees and commits directly in-memory using **go-git's
plumbing API** (`go-git/go-git/v5/plumbing/object`):

```go
tb := plumbing.NewTreeBuilder(...)
tb.Insert(...)
tree := tb.Build()
commit := object.Commit{TreeHash: tree.Hash(), ParentHashes: ...}
storer.SetEncodedObject(commit.Encode(...))
```

No subprocess, no temp files, no index. Microseconds per operation
instead of milliseconds.

**Python equivalent: `pygit2` (libgit2 binding).** Sketch:

```python
import pygit2

def put_pygit2(repo: pygit2.Repository, ref: str, key: str, content: str) -> str:
    blob_oid = repo.create_blob(content.encode("utf-8"))

    # Inherit existing tree if the ref exists
    try:
        parent_commit = repo.revparse_single(ref)
        builder = repo.TreeBuilder(parent_commit.tree)
        parents = [parent_commit.id]
    except KeyError:
        builder = repo.TreeBuilder()
        parents = []

    # pygit2's TreeBuilder is single-level. For nested keys, we still
    # need to recurse — but it's all in-process, no subprocesses.
    insert_nested(repo, builder, key, blob_oid)
    tree_oid = builder.write()

    sig = pygit2.Signature("brmem", "brmem@local")
    commit_oid = repo.create_commit(
        ref, sig, sig, f"brmem put {key}", tree_oid, parents
    )
    return str(commit_oid)
```

Two caveats:

1. **`pygit2.TreeBuilder` is single-level** — unlike `git write-tree` over
   an index, it doesn't auto-construct subtrees from `a/b/c.md` paths.
   You'd write a small helper that walks the path components and builds
   subtrees recursively. ~30 lines of code.

2. **Don't replace the subprocess gateway — add a second one.** The
   subprocess implementation is debuggable and portable; the pygit2 one is
   fast. Make the gateway interface the seam, choose at construction time.

A third option, **`dulwich`** (pure Python, no native dep), is also viable
and easier to install but slower than pygit2. Probably the right choice
for brmem given we're already pure Python.

### 3.4 Commit trailers as a linkage primitive

The `Entire-Checkpoint:` trailer is parsed and written using git's
built-in `interpret-trailers`:

```bash
# Write
git interpret-trailers --in-place --trailer "Entire-Checkpoint: $ID" "$COMMIT_MSG_FILE"

# Read
git log --format=%B HEAD | git interpret-trailers --parse
```

`interpret-trailers` handles all the edge cases: existing trailer blocks,
sign-off lines, formatting. It's a stable feature available since git
2.13.

**Use cases for brmem:**

- If we add a "memory-of-this-commit" feature (lessons learned tied to a
  specific commit, not just a branch), use a trailer to link.
- For `brmem-branch-create`, we could write `Brmem-Plan: <key>` into the
  first commit on the new branch so the plan is discoverable from `git
  log` even years later.

The pattern is: **stable identifier in the trailer, full data in the ref
content**. The trailer never holds payload.

### 3.5 `post-rewrite` hook for amend/rebase/reset

When the user runs `git commit --amend`, `git rebase`, or `git reset
--soft/--hard`, git fires the `post-rewrite` hook with old-SHA → new-SHA
mappings on stdin. Entire uses this to remap session linkage so
`Entire-Checkpoint:` trailers continue to point at valid metadata even
after history is rewritten.

**For brmem:** less directly relevant because we key on branch name, not
commit SHA. But two cases would benefit from `post-rewrite` awareness:

1. **Squash rebase that drops trailers:** if we ever use trailer-based
   linkage (3.4), a squash rebase will drop trailers from intermediate
   commits. We'd want to detect this and either re-apply the trailer to
   the squashed commit or warn.

2. **Branch rename via `git branch -m`:** there's no specific git hook for
   this. The pragmatic options are (a) ship a `brmem rename --from --to`
   wrapper and document it as the supported way, or (b) reaper logic that
   prunes brmem refs whose branch no longer exists locally _and_ on the
   configured remote. Entire does the latter via retention-based cleanup
   in `entire clean`.

### 3.6 Pitfalls with library `Reset`/`Checkout`

A surprising amount of Entire's design is shaped by a single bug they hit:
**go-git v5's `worktree.Reset(HardReset)` and `worktree.Checkout()` delete
gitignored directories.** They have regression tests for it
(`hard_reset_test.go`) and shell out to `git reset --hard` instead of
using the library for any worktree-touching operation.

Quote from their `CLAUDE.md`:

> **Do NOT use go-git v5 for `checkout` or `reset --hard` operations.**
>
> go-git v5 has a bug where `worktree.Reset()` with `git.HardReset` and
> `worktree.Checkout()` incorrectly delete untracked directories even when
> they're listed in `.gitignore`.

**For brmem:** we don't (and shouldn't) touch the working tree, so this is
a non-issue _today_. But if we ever add a "rewind to this snapshot"
feature: prefer the git CLI for any operation that mutates the working
tree, and reserve plumbing libraries (pygit2/dulwich) for object-database
work only.

### 3.7 Path resolution: repo root vs. cwd

Entire has bugfixes specifically for the case where an agent runs from a
subdirectory. Quote:

> Git commands like `git status` and `worktree.Status()` return paths
> relative to the **repository root**, not the current working directory.
> When an agent runs from a subdirectory, using `os.Getwd()` to construct
> absolute paths will produce incorrect results for files in sibling
> directories.

The fix is to use `git rev-parse --show-toplevel` (or its library
equivalent) and resolve paths relative to that, not `cwd`.

**For brmem:** any future feature that lists or filters paths from
`git`-derived data (e.g. "list memories tied to files I changed") needs
to be repo-root-relative, not cwd-relative.

### 3.8 Worktree-specific ref naming

Entire's shadow branches are named `entire/<commit[:7]>-<worktreeHash[:6]>`
specifically so two checkouts of the same base commit in different
worktrees don't collide on the same ref.

**For brmem:** less relevant because branches are inherently per-checkout
(you can't check out the same branch in two worktrees) and our refs are
keyed on branch name. We're fine. But if we ever add ref state that's
"per-worktree-of-the-same-branch," embed a worktree identifier in the
ref name. The identifier Entire uses is a hash of the worktree's path —
stable across CLI restarts within the same physical checkout.

---

## 4. Hook architecture

Entire's hook surface has two layers worth understanding even if we only
use one.

**Agent hooks** (UserPromptSubmit, Stop, PreToolUse, etc.) are
agent-specific events that get translated into a normalized event model
(`ParseHookEvent` → `Event` → `DispatchLifecycleEvent`). brmem doesn't
need this layer.

**Git hooks** (`prepare-commit-msg`, `post-commit`, `post-rewrite`,
`pre-push`) are the ones we care about. Entire's installation pattern:

- The CLI itself is the hook handler. Each installed git hook is a
  one-line shim:

  ```bash
  #!/bin/sh
  exec entire hooks git prepare-commit-msg "$@"
  ```

- This means hook logic lives in Go code (testable, debuggable) rather
  than shell scripts.
- The CLI checks for an existing hook and either chains it or refuses to
  overwrite, depending on config.
- Uninstall reverses cleanly.

**For brmem:** the same pattern applies trivially. `brmem init` should
install a `pre-push` shim that calls `brmem hooks pre-push`, and the real
logic lives in Python. Document the install/uninstall semantics
explicitly so users with existing hook chains aren't surprised.

---

## 5. Library landscape

| Library                   | Language | Used by Entire? | Suitable for brmem?                                      |
| ------------------------- | -------- | --------------- | -------------------------------------------------------- |
| `go-git/go-git`           | Go       | Yes             | N/A                                                      |
| `libgit2` / `pygit2`      | C / Py   | No (Go shop)    | **Yes** — fastest in-process plumbing                    |
| `dulwich`                 | Python   | No              | **Yes** — pure-Python, no native dep, slower than pygit2 |
| `GitPython`               | Python   | No              | Avoid for plumbing — wraps the CLI, no perf win          |
| Direct `subprocess` + git | Any      | Some            | **What brmem uses** — portable, debuggable, slow         |

Recommendation for brmem: keep the subprocess gateway as the reference
implementation and the supported install path. Add an optional
`Pygit2BranchMemoryGateway` (or `DulwichBranchMemoryGateway`) for users
who care about put/get latency or batch operations. Make the gateway
selection a single config knob.

---

## 6. Things in Entire we explicitly do _not_ want

For completeness — these are Entire features that are **not** lessons for
brmem, in case anyone is tempted:

- **Shadow branches with full worktree snapshots.** brmem is metadata, not
  rewindable state. We don't need this.
- **Subagent metadata trees** (`tasks/<tool-use-id>/`). Specific to AI
  agent observability.
- **Multi-session interleaving on a single shadow branch.** Specific to
  concurrent agent sessions in the same directory. Our slot model is
  simpler.
- **Token usage aggregation, transcript chunking, transcript signing.**
  All AI-specific.
- **The agent translation layer** (`ParseHookEvent`, agent registry,
  external-agent plugin protocol). brmem doesn't have multiple
  upstream-event-source variants to translate from.

---

## 7. Concrete recommendations for brmem, in priority order

1. **Add a `pre-push` hook** that pushes `refs/brmem/*` alongside the
   user's push. Best-effort. This is the single biggest UX upgrade —
   memory becomes shareable.

2. **Document and implement branch-rename / branch-delete reaping.**
   Either a `brmem rename --from --to` command, or a `brmem clean`
   command that prunes refs for branches that no longer exist locally
   _and_ on the configured remote. Today these orphan silently.

3. **Add `--filter=blob:none` to any future `brmem pull`/`brmem sync`.**
   Trivial change, big lever for scale.

4. **Add an optional `pygit2` (or `dulwich`) gateway alongside the
   subprocess one.** Not urgent, but the path is clear and the
   subprocess gateway becomes the slow fallback rather than the only
   implementation.

5. **Consider commit trailers for any future "memory-of-this-commit"
   feature.** Use `git interpret-trailers`. Don't invent a parsing
   convention.

6. **If a second storage model is ever needed for non-branch-scoped
   memory** (e.g., lessons learned that outlive a branch), adopt Entire's
   orphan-branch + sharded-tree + trailer-linkage pattern rather than
   stretching the current `(namespace, branch)` model.

7. **Resolve any path-derived data from `git rev-parse --show-toplevel`,
   not `os.getcwd()`,** if we ever add features that consume git's
   path-aware output.

8. **Resolve sidecar state paths from `git rev-parse --git-common-dir`,
   not `--git-dir`,** if we ever add per-machine sidecar files. (Refs are
   already common-dir-shared, so today this isn't a concern.)

---

## 8. References

- Entire CLI repo: `/Users/schrockn/code/githubs/entireio/cli`
- Entire architecture docs: `cli/docs/architecture/`
  - `sessions-and-checkpoints.md` — storage tiers and domain model
  - `checkpoint-scenarios.md` — state-machine walkthroughs
  - `agent-guide.md` and `external-agent-protocol.md` — agent layer (mostly not relevant)
- Entire `CLAUDE.md` (root) — operational notes, including the go-git
  `Reset`/`Checkout` warning and repo-root-vs-cwd guidance
- `cli/cmd/entire/cli/strategy/manual_commit_*.go` — the storage and
  hook handlers
- `cli/cmd/entire/cli/checkpoint/` — low-level `Store` interface for
  temporary and committed checkpoints
- Relevant git docs:
  - `git interpret-trailers(1)`
  - `git fetch(1)` `--filter=` flag
  - `git rev-parse(1)` `--git-common-dir`, `--show-toplevel`
  - `githooks(5)` for `pre-push`, `post-rewrite`
- libgit2 / pygit2: <https://www.pygit2.org/>
- dulwich: <https://www.dulwich.io/>
