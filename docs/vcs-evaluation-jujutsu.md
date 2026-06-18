# Evaluating Jujutsu (jj) for Local Use

**Explored:** 2026-06-14.
**Why it exists:** records a session that asked whether the Jujutsu (jj) VCS could be used
locally in this repo without disrupting the existing Graphite (`gt`) + GitHub workflow that
collaborators depend on. It maps every place the repo's tooling touches git internals,
separates collaborator-facing risk from local-tooling risk, and lands on a recommendation —
so the question is settled with evidence instead of being re-derived each time someone asks.
**Staleness warning:** jj and especially its git-colocation behavior move fast. Treat the
specifics here (workspace maturity, colocated-secondary-workspace behavior) as a snapshot,
not a contract; re-check against the current jj release before acting.

## Summary

jj layers on top of git: in *colocated* mode it keeps a fully functional `.git` directory,
writes real git objects, and exports bookmarks to `refs/heads/*` on every command, so the
`git` CLI keeps working. Because the repo's tooling shells out through the git CLI, most
integration points keep working unchanged.

The collaborator / GitHub impact is therefore near-zero — GitHub only ever sees ordinary git
commits, branches, and PRs. The only hard problem is *local*: `gt` and jj both want to own
commit rewriting and stack topology, and co-owning the same stack is not worth the
reconciliation cost. Recommendation: do not build gt/jj coexistence into asdl tooling. jj is
fine as an optional personal tool on non-`gt` branches. Revisit only as a full `gt`
replacement.

## Framing: two points of view

### Collaborator / GitHub POV — near-zero impact

Collaborators only see what is pushed to GitHub, and jj pushes real git objects: "GitHub
never knows you aren't using git." The only behavior delta is force-push churn — jj's natural
workflow is amend-in-place, so updating a PR force-pushes the branch. But `gt` already
force-pushes on every submit/restack, so collaborators are already living with that; there is
no net change. One hygiene note: configure jj with the real git author identity so commits
look normal.

Nothing needs to be built for collaborator safety.

### Local tooling POV — where the work and risk live

A common overstatement is that "jj replaces git's ref storage." That is false for **colocated**
mode, which is the only mode that matters here. Colocated jj writes real git refs and leaves
the `git` CLI fully functional; the repo's gateways drive git through that CLI. So the audit
below is narrower than a "jj rewrites everything" framing would suggest.

## Integration-point map

Four points, in increasing order of difficulty.

### 1. Branch Memory (`refs/brmem/*`) — safe, no work

Branch Memory stores snapshots under `refs/brmem/base/*` and `refs/brmem/ns/<namespace>/*`
(implemented by `ts/packages/brmem`). jj only syncs *bookmarks* (`refs/heads/*` ↔
`refs/remotes/*`) and deliberately ignores other ref namespaces, and brmem reads/writes those
refs through the git CLI, which works in a colocated repo. brmem is the cleanest part of the
system with respect to jj — precisely because it lives entirely outside jj's world. (See "On
making subsystems jj-native" for why it should *stay* there.)

### 2. `GitGateway` via the git CLI — one real fix, one inert probe

Almost everything works unchanged (`for-each-ref`, `rev-parse`, `merge-base`, `log`,
`patch-id`, `ls-tree`, `status --porcelain`) because colocated git is intact. Two exceptions:

- **`get_current_branch()`** = `git symbolic-ref --short HEAD`
  (`packages/asdl-core/src/asdl_core/git/real_git_gateway.py:211`) is the load-bearing
  breakage. In jj you frequently sit on an *anonymous* change with no bookmark, and jj leaves
  git `HEAD` detached; `symbolic-ref` then errors, violating the tooling's assumption that you
  are always on a named branch.
- **In-progress-op detection** reads `.git/worktrees/<id>/rebase-merge`, `rebase-apply`, and
  `BISECT_START` (`real_git_gateway.py:47-118`). jj rebases internally and never writes those
  files, so these probes go inert (silently report "nothing in progress"). That is not
  dangerous, but any safety check relying on them is blind during a jj operation.

`.graphite_metadata.db` reading is unaffected — it is a path relative to git-common-dir, which
colocated jj preserves.

### 3. Graphite coexistence — the hard problem

`gt` tracks `parent_branch_name` / `children` / commit SHAs in `.graphite_metadata.db`
(`packages/asdl-core/src/asdl_core/gt/metadata_reader.py`, read via `gt/real_gateway.py`). The
moment you jj-amend/rebase/squash, the underlying commits are rewritten out from under `gt`,
its metadata goes stale, and `gt restack` / `gt submit` start making wrong decisions. `gt` and
jj both want to own commit rewriting and stack topology, and they don't know about each other.
You cannot have both actively driving the same branches. This is a workflow conflict, not a
code patch.

### 4. Worktree slots — friction

The TypeScript `slot` CLI is built on plain `git worktree`
(`ts/packages/slot/src/inventory.ts`, plus `GitGateway.addWorktree` /
`removeWorktree` / `listWorktrees`). jj's native equivalent is the *workspace*
(`jj workspace add`). Colocated *secondary* workspaces, with `git`/`gt` run inside the slot
directory, are jj's roughest and least-mature area. Slots currently rely on each slot being a
real git worktree so that `gt`/git tooling works inside it.

## On making subsystems "jj-native"

Two follow-on findings, recorded so they aren't re-litigated.

### brmem should stay git-native

There is no perf win in making brmem jj-native, and there is a real loss. jj exposes no API
for arbitrary blob/tree/ref storage: `jj-lib` is unstable internal Rust, and there is no CLI
equivalent of `git commit-tree` / `git update-ref` for custom ref namespaces. jj's backend is
git anyway, so the bytes end up as the same git objects. Going jj-native would also *destroy*
brmem's safety property — today jj never touches `refs/brmem/*`, so there is no interaction to
get wrong. brmem's real cost is subprocess-spawn count, not git; if that ever matters, the
levers are batching the plumbing (`git fast-import`, `git cat-file --batch`,
`git hash-object --stdin-paths`) or in-process bindings (`pygit2`) — both still git-native and
still visible to colocated jj.

### jj-native slots = `jj workspace`

Conceptually a jj workspace is a *better* primitive for "parallel isolated checkouts for
concurrent agent sessions" than a git worktree: a slot becomes a *named workspace* with its own
anonymous working-copy change, so occupying a slot no longer forces a branch into existence —
you create a bookmark only when work is ready to surface to `gt`/GitHub. The mapping is direct:

| Current (`git worktree`)          | jj-native (`jj workspace`)                                 |
| --------------------------------- | ---------------------------------------------------------- |
| `git worktree list --porcelain`   | `jj workspace list` (named slots; drop path-pattern match) |
| `git worktree add [-b <branch>]`  | `jj workspace add <path> --name <slot> [-r <rev>]`         |
| `git worktree add --detach`       | `jj workspace add <path> -r <rev>` (naturally detached)    |
| `git worktree remove`             | `jj workspace forget <name>` + remove the directory        |
| `git checkout <branch>` (in slot) | `jj edit <rev>` / `jj new <bookmark>`                      |
| (stale-worktree footguns)         | `jj workspace update-stale`                                |
| rebase/bisect in-progress probing | deleted — conflicts are first-class in commits             |

That last row is a genuine simplification: a whole class of defensive `.git`-probing code
disappears. But a *pure* jj-native slots implementation is gated on the `gt` decision below and
on the immature colocated-secondary-workspace + git-inside-slot behavior.

## Why coexistence is the wrong middle

The complexity lives entirely in *co-ownership* — `gt` and jj both active on the same stack,
each rewriting commits the other tracks. The two clean endpoints have no coexistence cost at
all:

1. **Status quo** — `gt` + git, no jj. Nothing to coexist.
2. **Full replacement** — jj-native stacking + `jj-spr`, `gt` removed. Also no coexistence,
   because `gt` is gone — but a large migration touching `GtGateway`, `code-submit`,
   `objective-stack-impl`, slots, the `graphite` skill, and the AGENTS.md Graphite doctrine.

The tempting middle (jj as a local edit layer *under* an active `gt`) is exactly the
configuration that earns the "too complicated" verdict: you would be building reconciliation
machinery between two systems that each assume they own the stack.

## Recommendation

- Do not build any gt/jj coexistence into the repo's tooling — no jj `SlotsGateway`, no
  jj-aware `get_current_branch`, no jj-native brmem.
- jj is fine as a *personal* tool on scratch / non-`gt` branches, never wired into asdl tooling
  and never on a `gt`-tracked stack. This needs zero repo changes and carries no risk.
- Revisit only if jj's stacking + `jj-spr` matures to where it could *replace* `gt` outright —
  at which point it is a clean swap, not a coexistence.

Given the repo is already productively on `gt`, and jj's marginal win over a good `gt` workflow
is mostly editing ergonomics plus op-log undo, a full replacement does not clear the bar today.

## References

- jj "Working with GitHub": <https://jj-vcs.github.io/jj/latest/github/>
- jj workspaces: <https://jj-vcs.github.io/jj/latest/working-copy/#workspaces>
- jj-spr (stacked PRs against GitHub): <https://github.com/jennings/jj-spr>
- In-repo domain language: `packages/asdl-core/CONTEXT.md` (Git / Graphite),
  `ts/packages/brmem/CONTEXT.md` (Branch Memory), `ts/packages/pi-extensions/CONTEXT.md`
  (worktree-slot).
