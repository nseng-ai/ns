# Graphite slicing-mechanics survey

Research artifact for the **Graphite slicing-mechanics survey** roadmap row of the
`stack-smush` Objective. Establishes what `gt` and `@nseng-ai/capability-kit/graphite`
primitives support for Stack Smush packaging: slicing a linear commit run into a
stack, concatenation-rebase joins, `gt fold`, mid-stack span squash, absorbing edits
into a live stack, and what Flow autobranch/submit already provide.

- Date: 2026-07-10
- `gt --version`: **1.8.6**
- Method: scratch git repositories under the session scratchpad (outside the repo
  worktree), local-only `git`/`gt` operations; no command contacted a remote, no PRs
  were created. Remote-dependent behavior (PR fate under fold, review threads, CI) is
  taken from `gt --help` text and repo source only, and is explicitly marked as
  documented-but-not-observed.

**Evidence key** — every claim carries one of:

- **[observed]** — reproduced in a scratch repo; the command sequence is shown.
- **[source]** — read from repo source at the cited path.
- **[doc]** — from `gt <cmd> --help` output; not empirically verified here.

Scratch-repo setup common to all experiments [observed]:

```sh
git init -b main && git commit -m base   # one trunk commit
gt init --trunk main --no-interactive    # works offline, no auth prompt
```

## 1. Splitting a linear run into a stack

**`gt split` is not usable by agents for commit slicing.** [observed] `gt split
--by-commit --no-interactive` fails with `ERROR: Cannot perform interactive operation
in non-interactive mode.` after printing its commit-selection prompt preamble. [doc]
`gt split --help` states all forms "must be run interactively except for `--by-file`".

**`gt split --by-file` runs non-interactively but destroys commit granularity.**
[observed] On a 2-commit branch `mixed` (each commit touching both `.json` and `.ts`
files), `gt split --by-file "*.json" --no-interactive` produced a two-branch stack
(`mixed_split` parent with all `.json` changes, `mixed` child with all `.ts` changes)
where **each branch has exactly one commit** reusing the first commit's message — the
second commit's message ("m2") vanished. It re-partitions content by pathspec, not
history by boundary. Unusable for slicing a narrated commit run.

**The working primitive is `git branch <name> <sha>` + `gt track <name> --parent
<parent> --no-interactive`, applied at each slice boundary.** [observed] On a branch
`run` with 6 commits `c1..c6` off `main`, already tracked with parent `main`:

```sh
git branch slice-a "$(git rev-parse run~4)"        # boundary after c2
git branch slice-b "$(git rev-parse run~1)"        # boundary after c5
gt track slice-a --parent main    --no-interactive # "includes 2 commits"
gt track slice-b --parent slice-a --no-interactive # "includes 3 commits"
gt track run     --parent slice-b --no-interactive # reparent tip; "includes 1 commit"
```

Result [observed]: `gt log short` shows `main ← slice-a ← slice-b ← run`; every SHA is
unchanged (no rebase occurred — the branches literally point into the existing run);
`gt restack --no-interactive` reports all three branches "does not need to be
restacked". Re-running `gt track` on an already-tracked branch reparents it in place —
that is how the run tip moved from parent `main` to parent `slice-b`.

**Consequences for packaging.** Slicing is pure metadata: pick boundary SHAs, create
branches at them, track child-onto-parent bottom-up. It is cheap, conflict-free by
construction, and fully non-interactive — an ideal deterministic CLI push-down. Note
`gt create` is not involved: [doc] `gt create` commits staged worktree changes onto a
new branch; it cannot bind a branch to an existing commit. `RealGraphiteBranchGateway`
in `ts/packages/capability-kit/src/graphite/branch.ts` already wraps exactly this
`gt track <branch> --parent <parent> --no-interactive` invocation (`trackBranch`), so
the kit-level adapter for the core slicing move exists today [source].

## 2. Concatenation-rebase joins of disjoint subagent branches

Two equivalent mechanisms, both observed to work:

**(a) `gt move --onto` (Graphite-native).** [observed] With disjoint branches `subA`
(2 commits in `dirA/`) and `subB` (2 commits in `dirB/`) both tracked with parent
`main`: from `subB`, `gt move --onto subA --no-interactive` printed `Restacked subB on
subA` and produced the linear run `a1, a2, b1, b2` with Graphite metadata already
correct (`main ← subA ← subB`). Join order is simply the order of `gt move` calls.

**(b) raw `git rebase --onto` + `gt track` (git-native).** [observed] For a third
disjoint branch `subD`: `git rebase --onto subB main subD` appended `d1, d2` as a
contiguous block on top; the branch is untracked by Graphite until
`gt track subD --parent subB --no-interactive`, which then shows the correct stack.
Equivalent end state; useful when the subagent branch was never gt-tracked.

**Join conflict = falsified disjointness, with clean recovery.** [observed] A branch
`subC` editing the same file as `subA` (`dirA/a1.txt`), moved onto the run via
`gt move --onto subB --no-interactive`, exits 1 with `Hit conflict restacking subC on
subB`, leaves a standard git rebase in progress, and prints Graphite's
`gt add` / `gt continue` / `gt abort` recovery instructions. `git rebase --abort`
restored `subC` fully intact (original commit still present). This matches the
resolved subagent run-building contract exactly: the conflict is detected at join
time, is non-destructive, and forces serialization of that piece.

**Collapsing the joined chain into one run branch.** [observed] After (a), from
`subB`: `gt fold --keep --no-interactive` printed `Folded subB into subA`, deleted
`subA`, kept the name `subB`, and preserved **all four individual commits with
unchanged SHAs** — fold is a branch-pointer/metadata operation when the child is
already restacked on its parent; it does not squash. `gt fold --stack --keep` (see §3)
does the same for a whole chain in one command.

## 3. `gt fold` on branches — including PR fate

**Local semantics.** [observed] `gt fold` merges the current branch's commits into its
parent branch (individual commits preserved, not squashed), deletes one of the two
branch names (`--keep`/`-k` keeps the current branch's name instead of the parent's),
reparents descendants, and restacks. [observed] `gt fold --stack --keep` from a stack
tip (`main ← slice-a ← slice-b ← run`) printed `Folded run into slice-b. / Folded run
into slice-a.` and left a single branch `run` containing the entire commit sequence
with unchanged SHAs, tracked with parent `main`. This is the **inverse of slicing**,
which makes repackaging structurally simple: collapse with `fold --stack`, re-slice
with §1 mechanics.

**PR fate.** [doc] `gt fold --help`: "This command does not perform any action on
GitHub or the remote repository. If the branch has an open pull request, you can use
`--close` to close the pull request." So with `--close` the folded branch's PR is
closed; without it the PR is left open on GitHub while its local branch no longer
exists. Not observed here (no remote allowed).

**Open questions (documented-but-not-observed; need a live-remote prototype):**

- Whether `--close` closes the PR immediately (despite "does not perform any action on
  GitHub" for the base command) or defers to the next `gt submit`.
- What an orphaned open PR (fold without `--close`) looks like after the surviving
  branch is resubmitted — and whether review threads on the folded PR are reachable
  from anywhere useful afterward.
- Review-thread and CI fate generally: nothing in `gt --help`, the repo's Graphite
  materials, or `ts/packages/capabilities/flow` source describes migration of review
  threads or check state when branches fold; the safe working assumption is that
  threads stay on the (closed/orphaned) PR and CI state is per-head-SHA, so folded
  content re-runs CI on the surviving PR. The repackaging-under-change prototype row
  is where this must be observed for real. Prior art: the repo's own
  `skills/code-gt-linearize-descendants/SKILL.md` treats PR closing as report-only
  ("Never close GitHub PRs automatically; only report close candidates") [source].

## 4. Explicit mid-stack span squash

**`gt squash` does exactly what the "explicit post-stack-creation span squash"
decision needs.** [observed] On the sliced stack from §1, from the 3-commit span
branch: `gt squash -m "span: c3-c5 squashed" --no-interactive` squashed the branch to
one commit and printed `Restacked run on slice-b` — the upstack branch was rebased
automatically, and tip content was verified intact (all files present). Flags:
`-m`/`--no-edit` make it fully non-interactive [observed]; exit 0.

[source] Flow already ships a whole-stack variant: the Pi command `gt:squash-stack`
(`ts/packages/capabilities/flow/src/pi/stack-squash.ts`) walks every downstack branch
from the tip (branch list via `ns slot gt exec stack-branches --downstack --format
json`, implemented in
`ts/packages/capabilities/slots/src/lifecycle/operations/gt/exec/stack-branches.ts`)
and runs `gt squash --no-edit --no-interactive` per branch, tolerating the "Only one
commit in branch, nothing to squash." case. Span squash for packaging is the
*selective* version of this existing pattern: same command, applied to span branches
only, with `-m` supplying a narrated span message.

## 5. Absorbing edits into a live stack

**`gt absorb` routes staged hunks to the correct downstack commit and restacks.**
[observed] From the stack tip with staged edits touching `f1.txt` (introduced in
slice-a's first commit) and `f4.txt` (inside slice-b's squashed span commit):
`gt absorb --dry-run --no-interactive` printed, per hunk, the target branch and the
exact target commit; `gt absorb --force --no-interactive` amended both commits
(`slice-a updated (1 change applied) / slice-b updated (1 change applied) / run
restacked`) and left the worktree clean. The staged changes were split across two
different branches in one invocation. [doc] Hunks with no deterministic target commit
are left unabsorbed, and `--all` excludes untracked files "as file creations would
never be absorbed" — so absorb handles *edits to existing span/decision content*, not
new-file feedback.

**`gt modify --into` appends feedback commits to a mid-stack branch without switching
branches.** [observed] From the tip: `gt modify -c -m "fix: address review feedback on
span" --into slice-b --no-interactive` committed the staged new file onto `slice-b`
(verified: `slice-b` tip became the new commit) and printed `Restacked run on
slice-b`, with HEAD still on `run` throughout. `gt modify` on the current branch
amends (default) or appends (`-c`), restacking descendants [doc; the `--into` variant
observed]. Together, absorb (edits) + modify `--into` (new files/commits) cover the
"absorb review feedback into a packaged stack" mechanics without manual rebasing.

## 6. What Flow and `@nseng-ai/capability-kit/graphite` already provide

All [source]; paths relative to the repo root.

**`@nseng-ai/capability-kit/graphite`** (`ts/packages/capability-kit/src/graphite/`,
identity in `index.ts`; boundary rules in its `CONTEXT.md` — all direct `gt`
invocation belongs in this package):

- `branch.ts` — `runGraphiteCommand(runner, {cwd, args, timeoutMs, ...})`: the
  generic neutral `gt` executor (30s default timeout) every Flow gt call routes
  through; `RealGraphiteBranchGateway.trackBranch` (`gt track <branch> --parent
  <parent> --no-interactive`) and `checkBranchTracked` (`gt info`). The slicing
  primitive of §1 is therefore already a gateway method.
- `stack.ts` — `RealGraphiteStackGateway`: `parentOf`/`childrenOf`/`trunk` via `gt`,
  plus `stack()` and `stackGraph()` read directly from the Graphite **metadata
  sqlite DB** (`metadata.ts`: ancestor/descendant walks, fork detection, trunk-marker
  status, corruption diagnostics). Packaging can get full stack topology without
  parsing `gt log`.
- No fold, squash, split, move, or absorb adapters exist in the kit today; those
  would go through `runGraphiteCommand`.

**Flow autobranch** (`ts/packages/capabilities/flow/src/autobranch/`,
command `ts/packages/capabilities/flow/src/ns/commands/autobranch.ts`): turns a
*dirty worktree* into a new child branch — stash → `gt create <name>
--no-interactive --no-ai` → stash pop → checkpoint commit
(`dirty-transaction.ts`), with LM-generated slug and checkpoint message. A sibling
command `ns flow branch-latest-commit` moves the latest unpushed commit to a new
child branch. Autobranch is a *run-building* input (it accretes single-checkpoint
branches); it does not slice existing history.

**Flow submit** (`ts/packages/capabilities/flow/src/submit/`): pre-submit hooks,
checkpoint, then `gt submit --no-edit --publish --no-stack --no-ai --no-interactive
--no-view --no-web` (`submit-command-spec.ts`) — i.e. **current branch plus
downstack**, which is exactly the right scope for submitting a freshly packaged stack
from its tip; a `--stack --update-only` mode exists for stack-wide updates. It also
owns PR-description generation and PR metadata prewrite. `submit-failure-catalog.ts`
documents that `gt submit` **silently skips empty branches** (exit 0 + "part of the
submit scope … is empty") — packaging must never produce an empty slice branch, or
submit-side verification will flag it.

**Existing squash/linearize surfaces:** the Pi `gt:squash-stack` command (§4) and the
`skills/code-gt-linearize-descendants` skill (propose-then-mutate reshaping of
descendants, backup refs, never auto-closing PRs) are prior art for supervised stack
mutation, but neither slices by commit boundary nor classifies decision/span.

**Gaps for a packaging skill:**

1. **No slice operation anywhere.** Nothing in gt (non-interactively), the kit, or
   Flow turns boundary SHAs into a tracked stack. Needed push-down: a deterministic
   command taking ordered `(sha, branch-name, parent)` boundaries and running the §1
   `git branch` + `gt track` sequence bottom-up, with LBYL checks (linear merge-free
   `trunk..tip`, boundaries in order, no empty slices).
2. **No concatenation-join command.** `gt move --onto` / `git rebase --onto` +
   `gt track` work (§2) but need a push-down that applies a declared join order and
   stops cleanly on conflict (reporting which disjointness claim failed).
3. **No selective span-squash.** `gt:squash-stack` squashes every branch; packaging
   needs per-branch squash driven by the slice map (`gt squash -m` per span branch —
   trivially scriptable per §4).
4. **No PR-fate story for re-slicing.** Fold/re-slice PR, review-thread, and CI
   behavior is the un-observed remote half (§3) and is what the
   repackaging-under-change prototype row must establish.
5. **No decision/span labeling.** PR `decision`/`span` labels + body rationale
   (resolved review-policy row) have no existing writer; submit's PR metadata
   prewrite is adjacent machinery but does not do labels today.

## Findings: the "Graphite can express packaging" assumption

**Verdict: supported for all local packaging mechanics; the remote/PR half is
untested and remains the risk.**

Supported, observed end-to-end in scratch repos on gt 1.8.6:

- **Slice**: linear run → tracked stack with zero rebasing via `git branch` +
  `gt track --parent` (§1); reversible via `gt fold --stack --keep` (§3), so
  *repackaging = collapse + re-slice* is structurally cheap locally.
- **Join**: disjoint subagent branches concatenate onto one run via `gt move --onto`
  or `git rebase --onto` + `gt track`, in a deliberate order, with join conflicts
  surfacing non-destructively as falsified-disjointness (§2).
- **Span squash**: explicit, non-interactive, auto-restacking `gt squash -m` (§4).
- **Absorb feedback**: `gt absorb` targets the right commits across multiple stack
  branches in one shot; `gt modify --into` appends to mid-stack branches from the tip
  (§5).

Partially supported / open (documented-but-not-observed; owned by the
packaging-mechanics-design and repackaging prototype rows):

- PR fate under `gt fold` (`--close` vs. orphaned open PR), review-thread
  reachability, and CI state across fold/re-slice (§3).
- Whether re-slicing a *submitted* stack (branches with PRs) behaves as cleanly as
  the local metadata mechanics suggest — branch identity churn is where PR/review/CI
  thrash would appear.

One hard negative to design around: **`gt split` cannot be used by agents** — the
by-commit form is interactive-only and the non-interactive `--by-file` form rewrites
history by pathspec, discarding commit messages (§1). The slicing push-down in the
gaps list is therefore mandatory, not an optimization.
