---
name: code-smush
disable-model-invocation: true
description: Use when the user explicitly asks to smush, package, or repackage a stack — slicing a commit run into Decision PRs and Span PRs with explicit span squash. Opt-in and experimental; local-only (never submits, never contacts a remote, never mutates PRs). Proposes the full Slice Map and waits for go-ahead before any mutation.
---

# code-smush

Packaging — colloquially **smush** — is the opt-in, LM-driven, local operation that
classifies and slices an existing Graphite stack into **Decision PR** and **Span PR**
form, then explicitly performs **Span Squash**. It produces a self-describing local
stack for the user to submit; smush itself never submits. Repackaging is the same
operation re-run over the already-packaged stack. Smush constructs the packaged
stack in one of two modes — **parallel** (new branches alongside an untouched input
stack; the default whenever PRs may exist) or **in-place** (destructive reshaping of
the input branches) — see Packaging modes below.

Smush is **experimental** and **manually invoked only**. No other workflow — Flow,
CCC, the default agent workflow — may invoke it implicitly. Do not run it because a
stack "looks like it needs packaging"; run it because the user asked.

## Vocabulary

- **Commit Run** — a linear, merge-free commit sequence `trunk..tip` on one feature
  branch. The branch is the run; there is no run identity beyond it.
- **Packaging (smush)** — this operation: classify, slice, span-squash.
- **Decision PR** — a slice encoding one high-impact choice plus the commits needed
  to judge it in isolation.
- **Span PR** — a slice holding a maximal stretch of consequence-executing commits
  between decisions.
- **Slice Map** — the derived view of cut points, classification, and rationale.
  Never stored; re-derived from branch structure, branch names, and commit messages
  on every run.
- **Span Squash** — the explicit post-slicing step that collapses a Span PR's
  interior commits into one, preserving rationale and a narration digest.

## Safety contract (hard rules)

1. **Local-only, always — by allowlist, not denylist.** Never run `gt submit`,
   `git push`, `git fetch`, `gh` commands, or anything that contacts GitHub or any
   remote. Never create, update, close, or otherwise mutate a pull request.
   Submission belongs to the user, afterward, outside this skill. Treat every `gt`
   verb outside the commands this document names as remote-capable until proven
   otherwise — in particular, do **not** run `gt branch info` or other `gt` PR/read
   verbs to inspect PR state; several refresh PR metadata from the remote. PR
   associations come only from Graphite's local cache (or from the user); stale or
   absent cache state is reported as *unknown*, never refreshed to improve the
   proposal.
2. **Never close PRs — not even indirectly.** `gt fold` is always used WITHOUT
   `--close`. Branches folded away that had open PRs become orphaned
   close-candidate PRs: report them loudly (a clearly marked section in the final
   report) and leave every decision about them to the user.
3. **Propose before mutation — gate weight follows destructiveness.** Render the
   full proposed Slice Map (format below) and wait for the user's explicit
   go-ahead. Silence, ambiguity, or a partial answer is not consent. This proposal
   readback is the human's Slice Map view. Destructive operations — `gt fold`,
   `gt rename`, squash/modify/delete of pre-existing branches — always require
   ratification of the exact map they mutate. Parallel pointer construction (new
   refs plus `gt track` on new branches only) still needs a go-ahead, but is cheap
   and fully reversible: building a candidate parallel stack, inspecting it, and
   discarding it is a legitimate iteration loop while the user is actively
   reshaping — prefer that loop over repeated rounds of prose re-ratification.
4. **Backup before mutation.** Create timestamped local backup branches for the run
   tip and every branch the operation will move, fold, rename, or rewrite.
5. **No durable state.** Classification and per-cut rationale live only in branch
   names and commit messages. Write no state files, no map files, no markers or
   trailers. Any JSON passed between steps is transient process input; nothing of
   it survives the run. Re-derive everything from the stack every time.
6. **Read-side discipline.** Read stack topology with `ns slot gt exec
   stack-branches --format json` and `ns slot gt exec stack-map-branches --format
   json`; never parse `gt log` output.
7. **No new CLI.** V1 is wholly LM-driven prose over the raw commands in this
   document. Do not build or reach for packaging-specific push-down commands.

## Packaging modes

- **Parallel (default).** Build the packaged stack as new branches alongside the
  input stack: new refs at boundary SHAs, `gt track --parent` on the new branches
  only, Span Squash only on new branches. The input stack — its branches, Graphite
  metadata, and PR associations — is untouched. No orphaned PRs, no rename gap (the
  new tip takes a grammar name), and a discarded candidate costs nothing: delete
  the new branches and re-propose. Use this mode whenever any in-scope branch has,
  or may have, a PR association — including whenever PR state is unknowable
  offline.
- **In-place (explicit, destructive).** Normalize with `gt fold --stack --keep`
  (never `--close`) and reshape the input branches themselves. On submitted stacks
  this produces orphaned close-candidate PRs and forbids renaming the
  PR-associated tip. Use only when the user explicitly wants the old stack
  replaced, under the full ratification gate.

In parallel mode, prefer a `<run>` segment that cannot collide with the input
stack's own name when both stacks must coexist ambiguously (e.g. append `-smush`);
reusing the input run name is acceptable when the user will discard one of the two.
State the chosen run name in the proposal.

## Input contract

Smush accepts **any existing stack**:

- **Best case** — a contract-conforming Commit Run: one linear, merge-free branch
  off trunk, narrated commit messages (choices written as "chose X over Y because
  Z"), tip green.
- **Valid degraded input** — accreted multi-branch stacks (e.g. autobranch
  checkpoints), feedback-laden stacks, and previously packaged stacks. Degraded
  input lowers classification quality, not eligibility. Multi-branch input is first
  normalized to a single run branch (see Repackaging), then packaged.

Classification signal is narrative prose only. There are no structured markers, and
producers do not self-classify; packaging judges from the commit messages and holds
override authority — it may promote a commit the author treated as minor into a
Decision PR, or demote one into a span.

## Branch-name grammar

Classification must be mechanically parseable from branch names alone. Every slice
branch produced by smush — including the stack tip — uses this grammar:

```
<run>--<NN><c>-<slug>
```

- `<run>` — the run branch's name at packaging time (greedy; may itself contain
  hyphens or slashes).
- `--` — literal double-hyphen separator. The slug must not contain `--`, so the
  last grammar-conforming `--` in the name is the separator.
- `<NN>` — two-digit, zero-padded, 1-based slice index counting **from trunk**
  (lexical sort equals stack order; runs of 100+ slices are out of scope).
- `<c>` — classification: `d` for a Decision PR, `s` for a Span PR.
- `<slug>` — lowercase kebab-case summary of the slice.

Parse regex:

```
^(?<run>.+)--(?<index>[0-9]{2})(?<class>[ds])-(?<slug>[a-z0-9][a-z0-9-]*)$
```

Examples for a run branch `retry-budgets` sliced into three:

```
retry-budgets--01s-gateway-scaffolding
retry-budgets--02d-per-call-budgets
retry-budgets--03s-callsite-propagation
```

Rules:

- The tip slice carries a grammar name too: after reparenting, rename the run
  branch with `gt rename <new-name> --no-interactive`. `gt rename` updates
  Graphite metadata but removes any open-PR association — so never rename a branch
  that has an open PR (never pass `-f`). On repackaging a submitted stack, keep the
  PR-associated name for that branch and report the naming gap loudly instead.
- LBYL: before mutating, check every proposed name against existing local branches
  and refuse collisions.
- A branch matching the grammar declares its classification and order; a
  non-matching branch in a packaged stack is a parse gap to report, not to guess
  silently.

## Procedure

### Phase 0 — Preconditions (read-only, LBYL)

1. Confirm explicit user invocation and identify the run branch (default: current
   branch) and trunk.
2. `git status --porcelain` must be empty. If dirty, stop and ask the user to
   checkpoint, stash, or use another worktree.
3. `ns slot gt exec quiescence --scope downstack --format json` — the stack scope
   must be safe to mutate; otherwise stop and report.
4. `ns slot gt exec stack-map-branches --format json` — if any in-scope branch
   reports `needsRestack` or metadata warnings, stop and report; restacking is not
   part of the mutation the user is approving.
5. Linearity: `git rev-list --merges <trunk>..<tip>` must be empty, and the
   packaging scope must be a single linear chain (no forks branching off in-scope
   commits per the stack graph). A non-linear scope is not packageable; report it.
6. Note pre-existing PR associations of in-scope branches from Graphite metadata or
   from the user — without contacting the remote. These feed the orphaned-PR report
   and the rename rule; when unknowable offline, say so in the proposal.

### Phase 1 — Decisions first, then commits (read-only)

Classify **outside-in from decisions**, never inside-out from commit subjects.

1. Elicit the reviewability objective before proposing anything. The default:
   **each high-leverage decision gets a minimal Decision PR; everything else —
   implementation, fallout, incidental cleanup — goes to consequence Span PRs.**
   If the user asks for a different shape ("condensed", "fewer PRs"), state the
   tradeoff against decision isolation and confirm which objective wins before
   drafting a map.
2. Read the run's history: `git log --reverse "<trunk>..<tip>"` (subjects and full
   bodies). Decision signal is narrated prose: explicit "chose X over Y because Z"
   paragraphs, interface/dependency/design-fork choices, narrated reversals.
3. Build a **Decision Inventory** before choosing any cut point. For each candidate
   decision: the choice in one sentence, its minimal evidence commit, why it is
   high-leverage, and which later commits are its consequences.
4. Run a **coupling pass** over the inventory. Test each pair: *could a reviewer
   reasonably accept A while rejecting B?* If no, A and B are one decision group
   and one Decision PR. If yes, they stay separate Decision PRs even when adjacent
   — correlated-but-separable decisions are independently rejectable.
5. Apply the **demotion rule**: a commit with a decision-sounding subject whose
   substantive choice was already ratified by an earlier decision group is a
   consequence — it belongs in a span. Packaging holds override authority in both
   directions (promote minor-looking commits, demote decision-sounding ones).
6. Only then map the decision groups onto the commit order as an **ordered
   partition**: each Decision PR is one decision group's minimal evidence plus the
   commits needed to judge it in isolation; Span PRs are the maximal stretches
   between. Packaging can merge commits into a span but can never split a commit
   (`gt split` is unusable non-interactively; cuts land on commit boundaries only).
7. Draft per-cut rationale: why each boundary is where it is, and why each slice is
   classified as it is. This prose will live in commit messages, nowhere else.

**Feasibility invariant.** Any grouping that respects commit order is expressible
with pure branch pointers. Infeasibility arises only when a desired decision
boundary falls *inside* a single commit, or the grouping requires reordering
commits. Never claim history rewriting is needed without first checking whether
reclassification (demotion/promotion) achieves the target shape at existing
boundaries. When a decision commit's fatness genuinely caps slice quality, say so
and report it as commit-narration feedback — packaging cannot fix coarse commits.

### Phase 2 — Propose the Slice Map and wait

Render the full proposal, slices bottom-up (trunk-adjacent first). Lead with the
Decision Inventory and coupling conclusions, then the packaging mode (parallel or
in-place) and the mapping from existing branches/PRs to proposed slices:

- proposed branch name (grammar above) and classification;
- boundary SHA and parent;
- the commits inside the slice (count plus subjects);
- rationale excerpt for the cut and classification;
- planned Span Squash targets (every span slice) and what each squash message will
  preserve;
- backup branch names to be created;
- on repackaging: branches to fold, and the orphaned close-candidate PRs that will
  result;
- any preconditions found in Phase 0 worth the user's eyes (unknown PR state, parse
  gaps, red tip).

Then **stop and wait for explicit go-ahead**. Rework the proposal on any
disagreement — this conversation is also how the user reshapes an
already-packaged stack (repackaging re-run), so treat "move the cut below X",
"promote that span", "merge spans 2 and 3" as ordinary proposal inputs.

### Phase 3 — Backup refs

After go-ahead, with a clean status:

```bash
stamp=$(date +%Y%m%d%H%M%S)
git branch "backup/smush-$stamp/<safe-branch-name>" "<branch>"
```

Create one backup per affected branch (run tip always; every branch that will be
folded, renamed, or squashed). Encode `/` in branch names as `__`. Record the
backup prefix for the final report.

### Phase 4 — Slice

Slicing is pure branch metadata — no rebase, no SHA changes. In **parallel mode**
there is no reparenting, renaming, or folding of the input stack: create every
slice branch (including the tip slice, which freely takes its grammar name) as a
new ref at its boundary SHA, `gt track` them bottom-up, and leave the input
stack's branches and metadata untouched. The in-place recipe:

```bash
git branch <slice-01-name> <boundary-sha-1>
git branch <slice-02-name> <boundary-sha-2>
gt track <slice-01-name> --parent <trunk>         --no-interactive
gt track <slice-02-name> --parent <slice-01-name> --no-interactive
gt track <run>           --parent <slice-02-name> --no-interactive   # reparent tip
gt rename <tip-slice-name> --no-interactive                          # from the run branch; skip if it has an open PR
```

Track bottom-up. Re-running `gt track` on a tracked branch reparents it in place;
that is how the run tip moves onto the last interior slice. Verify: every slice
non-empty (`git rev-list --count <parent>..<slice>` > 0 — submit silently skips
empty branches, so an empty slice is a defect), boundaries in order, `gt restack
--no-interactive` reports nothing to restack.

### Phase 5 — Boundary validation

Boundary validation dominates packaging cost: each slice costs one full validation
run now and one CI run after submission, so slice count is not free — say so in
the proposal when the map is large. Boundaries may be validated concurrently in
separate temporary worktrees when resources allow.

Every slice boundary must be green. For each slice branch tip, bottom-up, validate
with the repo validation entrypoint (`just` in this repo) in a temporary worktree:

```bash
tmp=$(mktemp -d)
git worktree add --detach "$tmp" <slice-branch>
(cd "$tmp" && just)
git worktree remove --force "$tmp"
```

A red boundary is handled by escalating remedies, in order:

1. **Move the cut** — re-point the slice branch to a nearby commit that validates
   (`git branch -f <slice> <new-sha>`), keeping boundaries ordered and every slice
   non-empty. Prefer this; cuts are partly validation-driven.
2. **Fix forward into the slice** — from the stack tip, stage a minimal fix and
   append it to the red slice: `gt modify -c -m "<narrated fix message>" --into
   <slice> --no-interactive` (this restacks descendants), then re-validate.
3. **Escalate** — report the red boundary and the failed remedies; let the user
   decide.

The run tip is the final boundary and must end green.

### Phase 6 — Span Squash

Span Squash is a standard, explicit step — after slicing and boundary validation,
never at land time. A span containing a **single commit needs no squash** — verify
its message carries the span rationale and amend with `gt modify -m` if not.
Before each mutating `gt` operation, check for a stale index lock
(`git rev-parse --git-path index.lock`): stop if a live git process owns it;
remove only a verified-stale lock. For each **multi-commit span** slice (never
decision slices), from that branch:

```bash
gt squash -m "<squash message>" --no-interactive
```

`gt squash` auto-restacks upstack branches. The squash message carries the slice's
durable rationale plus a narration digest that keeps every interior commit's
subject:

```
<imperative subject for the whole span>

<rationale: why this stretch is one span and why its boundaries are where they are>

Narration digest:
- <subject of each collapsed commit, in original order>
```

Decision slices are never squashed: the decision boundary commit keeps its
why-paragraph, and its supporting commits stay judgeable in isolation. If a
decision slice's tip message lacks its why-paragraph (degraded input), amend it on
that slice with `gt modify -m "<enriched message>" --no-interactive` so
classification rationale is durable — do not invent a decision that the prose does
not support; quote and condense what is there.

Squashing changes commit SHAs but not slice-tip trees, so Phase 5 greenness carries
over; spot-check the stack tip with the validation entrypoint after the last
squash.

### Phase 7 — Final verification and report

1. `ns slot gt exec stack-branches --format json` — confirm the final topology
   matches the ratified Slice Map; `gt restack --no-interactive` reports nothing to
   restack.
2. `git status --porcelain` clean.
3. Report: the final Slice Map (branch names, classification, boundary SHAs,
   commit counts), the backup branch prefix, validation results per boundary, and —
   **loudly, in its own clearly-marked section** — every orphaned close-candidate
   PR, with the explicit note that smush did not and will not touch them.
4. Remind the user that submission (and everything PR-shaped: labels, bodies,
   review policy) is theirs, outside this skill.

## Repackaging and multi-branch input

For a submitted stack, **parallel mode is the preferred repackaging path**: build
the new shape alongside the old stack and let the user retire the old PRs on their
own terms — no fold, no orphaned PRs, no rename gap. The in-place path below
remains for when the user explicitly wants the old stack itself replaced.

Repackaging in place — and normalizing any accreted multi-branch stack — is the
same operation re-run:

1. Derive the current Slice Map first (topology from `ns slot gt exec
   stack-branches`, classification from grammar branch names, rationale from
   boundary/squash commit messages) and include it in the Phase 2 proposal next to
   the proposed new map.
2. Collapse the in-scope chain to a single run branch from its tip:

   ```bash
   gt fold --stack --keep --no-interactive
   ```

   Never pass `--close`. Folding preserves commits and SHAs; branches folded away
   that had open PRs become orphaned close-candidate PRs — collect them for the
   loud report.
3. Proceed from Phase 4 over the collapsed run.

Costs to state in the proposal so the user reshapes with open eyes: pre-submit
reshapes are cheap local metadata; post-submit reshapes can break branch↔PR
association on rename and orphan PRs on fold; re-slicing a previously squashed span
cannot recover its interior commits (only the narration digest survives) — an
accepted cost of Span Squash.

## Absorbing feedback into a packaged stack

Small post-packaging edits do not require a full repackage:

- **Edits to existing content** — stage the edits at the stack tip, preview with
  `gt absorb --dry-run --no-interactive`, then `gt absorb --force
  --no-interactive`; hunks route to the commits that introduced the lines and
  descendants restack.
- **New files or discrete feedback commits** — `gt modify -c -m "<narrated
  message>" --into <slice-branch> --no-interactive` from the tip.

Both are local mutations: propose-first and backup rules apply.

## Recovery

- Slicing mistakes before squash: slice branches are pointers into unchanged
  history — delete wrong branches (`gt untrack` then `git branch -D`), re-track,
  or `git branch -f` to move a cut.
- After squash or fold mistakes: restore pointers from the `backup/smush-<stamp>/`
  branches (`git branch -f <branch> backup/smush-<stamp>/<safe-branch-name>`,
  re-run `gt track --parent` to restore metadata), then re-propose.
- A conflicted `gt` operation (should not happen — smush never reorders history):
  abort with `git rebase --abort`, report, and stop.
- A failed `gt squash` (e.g. a stale `index.lock` mid-batch): after confirming no
  live git process owns the lock, remove the stale lock and retry. If the tool
  keeps failing, the guarded equivalent — with a backup present, a clean tree, and
  the parent verified — is `git reset --soft <parent> && git commit -m "<squash
  message>"`, then `gt restack --no-interactive` and re-verification of
  descendants. Recovery-only; never the normal path.

## Known limits (v1)

- Cuts land on commit boundaries only; a too-coarse commit cannot be split.
- Post-submit PR/review-thread/CI fate under fold and re-slice is not yet
  fully observed; treat submitted-stack repackaging as the riskiest path and lean
  on the loud orphaned-PR report.
- Deterministic push-downs (slicing, selective span squash, slice-map read-side)
  are deliberately parked; do not add them from this skill.
