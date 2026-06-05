# Conflict resolution by thesis reapplication

A way to land a branch whose history can no longer be replayed. Instead of moving
the commits — rebasing, restacking, resolving conflicts — you **abandon the commits
as implementation and re-apply their intent** against the current baseline. The
output is a fresh change that accomplishes the branch's goals, built on code that
actually exists today.

> **Reach for this only when the cheaper tools are provably dead.** If a plain
> `git rebase` replays cleanly, rebase. If a [`gt restack`](pi/README.md) would
> replay with resolvable conflicts, use the `code-gt-restack-resolve` skill. If you
> have a normal in-progress rebase that hit conflicts, use the
> `code-resolve-merge-conflicts` skill. Thesis reapplication is the **third option**,
> for when those fail not because of a hard conflict but because the world the
> commits were written against no longer exists — the lineage forked and was later
> rewritten into entirely new commits. Replaying the old commits onto the new world
> re-triggers the same conflicts every time; that is the signal you are in this case.

## When to use / when not

The trigger: the branch you want to land was built on a stack that has since been
**rewritten** — its parent commits were replaced with new SHAs whose trees differ
materially. There is no shared tracked ancestor to rebase onto, so every replay
conflicts and every re-track is rejected.

Before committing to the heavy process, **qualify** it — prove the lineage actually
forked and rebase is dead:

```bash
# 1. The branch's base must NOT be an ancestor of the new baseline.
git merge-base --is-ancestor <thesis-base> <new-baseline>
#   exit 0 -> still in history; just rebase, you don't need this.
#   exit 1 -> forked; reapplication is the right tool.

# 2. The "same" logical commit on each lineage has a different tree.
[ "$(git rev-parse <stale-base>^{tree})" = "$(git rev-parse <new-baseline>^{tree})" ] \
  && echo "same tree" || echo "different tree -> rewritten"

# 3. (Graphite) the tracker refuses to re-parent it.
gt track --parent <new-baseline> <branch>   # ERROR: parent not in history
```

If check 1 exits `0`, stop — a normal rebase is all you need. Use this process only
when the base is forked (exit `1`), the trees differ, and re-tracking is rejected.

**Don't use it** for ordinary conflicts, for a branch that merely needs restacking,
or when a single find-and-replace on the current code would accomplish the same goal
more cheaply than reconstructing intent.

## The process

Six phases. The judgment lives in extracting the thesis and mapping it to the
baseline; the rest is mechanical.

### 1. Qualify

Run the diagnostics above. Record the fork point (`git merge-base <stale> <real>`)
so you know how far back the lineages diverged. Do not proceed until rebase/restack
is confirmed dead — otherwise you are doing expensive work a cheap tool would finish.

### 2. Gather materials

- **Each source branch tip and the base its unique diff was written against** —
  `<tip>` plus the recorded parent (`<tip>~1`, or the Graphite-recorded parent for
  the descendant branch in a stack).
- **The new baseline** — the live, correctly-tracked branch the work should sit on.
  Re-read its SHA at session start; stacks move, and a baseline that "needs restack"
  will move again once you restack it.
- **Attached planned-branch plans on every branch you target.** For each source
  branch whose intent may be re-applied, and for each target/baseline branch you
  may land on, inspect Branch Memory namespace `planned-branch` before reading the
  diffs:

  ```bash
  brmem list --namespace planned-branch --branch <branch>
  brmem get <key> --namespace planned-branch --branch <branch>
  ```

  If you are currently on the branch, `planned-branch exec load-plan [key-or-slug]
  --format json` is the higher-level loader. Treat an attached plan as authored
  intent, not incidental notes.
- **The PR for each source branch** (`gh pr view <n>`). The PR title and body are
  usually the cleanest statement of intent after any attached planned-branch plan
  — read them _before_ the diffs.
- **Backups.** Snapshot every source tip before touching anything:
  `git update-ref refs/backup/<branch>-prefix <tip>`. This is mandatory — retirement
  (phase 6) deletes these branches, and the backup ref is the only undo.

### 3. Extract the thesis

The thesis is the **intent**, decoupled from any specific hunk. The diffs are
_evidence_ of intent, not the artifact to salvage.

- **Read intent in source order:** attached planned-branch plan, then PR
  description, then commit messages, then the diff. Earlier sources are authored
  intent; the diff is reverse-engineering and the last resort.
- **Dedupe across branches.** If several branches express overlapping intent, collapse
  them into one thesis — but run `git diff <branchA> <branchB>` first to surface what
  is _unique_ to each, so a lesser branch's contribution (often docs or objective
  tracking) is not lost when you merge them down.
- **Tag every piece core vs. incidental.** Some hunks rode along — an unrelated doc
  tweak, a drive-by fix — without being part of the intent. Tag those now; they become
  explicit keep/drop decisions surfaced early, not surprises at the end.
- **Write a residue-grep acceptance set.** State the literal patterns that must _not_
  exist once the thesis is fully applied (and any that must). The PR's own
  validation/evidence section usually hands you these. You will reuse this set three
  times: as the already-done probe (phase 4), the completion check, and the regression
  guard (phase 5).

The output of this phase is a short list of goals plus that acceptance set — written
down, baseline-agnostic.

### 4. Map the thesis to the baseline

The highest-leverage step. For every path the thesis touches, classify it against the
current baseline:

```bash
for f in <touched paths>; do
  git diff --quiet <thesis-base> <new-baseline> -- "$f" \
    && echo "LIFT      $f" \
    || echo "RE-DERIVE $f"
done
```

- **LIFT** — byte-identical at the baseline, so the thesis's exact transformation
  reproduces verbatim. In practice most files land here; copy the change across as-is.
- **RE-DERIVE** — the file diverged; the baseline restructured it. Re-apply the
  _intent_ against the new content, not the old hunk.
- **ALREADY-DONE** — run the acceptance greps against the baseline. Anything the new
  world already satisfies drops out of scope. **Verify these carefully** — a false
  "already done" silently drops a goal (see failure modes).

This converts a terrifying "everything conflicts" into "only these N files need
judgment," and tells you exactly where to spend it.

### 5. Plan and execute two workstreams

Keep them separate — they carry different risk and deserve different gates.

**Reapplication** (idempotent, low risk):

1. Create a fresh branch off the baseline (restack the baseline first if it was stale).
2. Apply the LIFT files, then the RE-DERIVE files.
3. Run the build / test / format gate.
4. Prove the acceptance greps pass — zero residue of the patterns from phase 3.

**Retirement** (outward-facing, irreversible — gate on explicit sign-off):

5. Close the source PRs, pointing each at the new PR.
6. Delete or untrack the stale branches. The phase-2 backups are the undo.

Retirement is usually what satisfies the _other_ acceptance test — clean tracking
state, e.g. a `gt ls` with no divergence warning. Treat it as a deliberate, approved
step, not a cleanup afterthought.

## Two failure modes

Reapplication fails in exactly two directions; name them and guard both.

- **Under-apply** — a goal silently dropped, almost always via a false "already done"
  finding. _Guard:_ bias the already-done probe toward _not_ done; confirm every
  negative finding ("nothing matches") with an independent method and a count, because
  a bad negative is the dangerous one — it removes scope without a trace. The
  acceptance greps are the backstop.
- **Over-apply** — re-introducing something the baseline already has, or carrying an
  incidental contaminant. _Guard:_ the divergence map (skip already-satisfied files)
  and the core/incidental tagging from phase 3.

## Why it works

A rewritten stack breaks the assumption every replay tool depends on: that the old
commits and the new base share enough history to three-way merge. They do not. But
the _change the author wanted_ is small and well-specified — and most of the files it
touched did not actually move on the new baseline. The divergence map proves that,
turning the problem from "reconcile two incompatible histories" into "re-type a handful
of edits and copy the rest." You stop fighting Git's history model and re-state the
intent directly.
