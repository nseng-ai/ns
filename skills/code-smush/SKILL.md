---
name: code-smush
disable-model-invocation: true
description: Smush — locally repackage a Graphite stack into Decision PRs and Span PRs. Opt-in, experimental, local-only.
---

# code-smush

Packaging — colloquially **smush** — classifies and slices an existing Graphite
stack into **Decision PR** and **Span PR** form, then explicitly performs **Span
Squash**. It produces a self-describing local stack; submission is user-owned,
afterward, outside this skill. Which construction path applies — in-place
reshaping or replacement-stack construction — is a deterministic rule (see
Packaging rule), never a user choice.

Smush is **experimental** and runs only on explicit user invocation. No other
workflow — Flow, CCC, the default agent workflow — may fire it implicitly, and a
stack "looking like it needs packaging" is not an invocation.

## Current Slots prerequisite

This workflow currently requires `@nseng-ai/slots` installed and enabled because Slot-aware quiescence, stack-map safety, structured topology, and backup helpers live under `ns slot gt exec`. If that capability is unavailable, stop before any packaging mutation. The current placement of generic helpers such as `stack-branches`, `descendants-report`, and `backup-refs` does not decide their permanent semantic ownership; that migration is tracked separately.

## Vocabulary

- **Commit Run** — a linear, merge-free commit sequence `trunk..tip` on one feature
  branch. The branch is the run; there is no run identity beyond it.
- **Packaging (smush)** — this operation: classify, slice, span-squash.
- **Decision PR** — a slice encoding one high-impact choice plus the commits needed
  to judge it in isolation.
- **Span PR** — a slice holding a maximal stretch of consequence-executing commits
  between decisions.
- **Slice Map** — the derived view of cut points, classification, and rationale.
- **Span Squash** — the explicit post-slicing step that collapses a Span PR's
  interior commits into one, preserving rationale and a narration digest.
- **Packaging event** — an immutable Objective Semantic Update recording the stack
  produced by one packaging generation: historical evidence, never the source of
  current topology.

## Safety contract (hard rules)

1. **Local-only, by allowlist.** Smush never contacts GitHub or any remote: no
   `gt submit`, no `git push`/`git fetch`, no `gh`. Its `gt` surface is exactly
   the verbs this skill names — `track`, `rename`, `restack`, `modify`,
   `squash`, plus recovery's `absorb` and `untrack` — because several unlisted
   `gt` read verbs (`gt branch info` among them) refresh PR metadata from the
   remote. Read stack topology with `ns slot gt exec stack-branches --format
   json` and `ns slot gt exec stack-map-branches --format json`, per the
   display-output rule in `docs/conventions/graphite-dependency-boundary.md`.
   PR associations come only from Graphite's local cache or from the user;
   stale or absent cache state is reported as *unknown*, never refreshed.
2. **PRs stay the user's.** Smush never creates, updates, closes, or otherwise
   mutates a pull request. On repackaging the close-candidate set is
   deterministic — the **entire old stack** — and is reported loudly in its own
   clearly marked section of the final report; every closure decision belongs
   to the user.
3. **Propose before mutation — gate weight follows destructiveness.** Render
   the full proposed Slice Map (Phase 2 format) and wait for explicit
   ratification; silence, ambiguity, or a partial answer is not consent.
   Destructive operations — `gt rename`, squash/modify/delete of pre-existing
   branches — always require ratification of the exact map they mutate.
   Replacement construction (new refs plus `gt track` on new branches only)
   still needs a go-ahead, but building, inspecting, and discarding a candidate
   replacement stack is a legitimate iteration loop while the user is actively
   reshaping — prefer that loop over repeated rounds of prose re-ratification.
4. **Backup before mutation.** Create timestamped local backup branches for the
   run tip and every branch the operation will move, rename, or rewrite
   (Phase 3).
5. **No durable packaging state.** Classification, current topology, and per-cut
   rationale live only in branch names and commit messages; any JSON passed
   between steps is transient process input. The one durable artifact is the
   immutable packaging-event Semantic Update under the owning Objective —
   repackaging appends a distinct event for every generation, and the current
   stack is always re-derived from Git/Graphite, never from a prior event.
6. **Objective-bound by default.** Every successful run records and commits one
   packaging event (Phase 7). The only alternative is an unbound override the
   user explicitly confirms before mutation; missing context or a binding
   failure never implies bypass.
7. **No new CLI.** V1 is wholly LM-driven prose over the raw commands in this
   skill. Shared `slot gt` exec primitives that also serve other skills
   (`stack-branches`, `stack-map-branches`, `backup-refs`) are in bounds;
   packaging-specific push-down commands are deliberately parked (see Known
   limits in `references/recovery-and-feedback.md`).

## Packaging rule

Which construction path applies is deterministic — derived from the Phase 0 facts,
never chosen by the user:

- **Initial packaging (in place).** A fresh run — one linear branch off trunk,
  never previously packaged, with no PR association (known or possible) anywhere
  in scope — is reshaped in place: slice refs at boundary SHAs, reparent the run
  tip, rename the tip to its grammar name. This is the only path that uses
  `gt rename` (mechanics in Phase 4).
- **Replacement construction (everything else).** Input that was previously
  packaged, has been submitted, has any PR-associated or unknown-PR-state branch,
  or is an accreted multi-branch stack gets its packaged stack built alongside it:
  new refs at boundary SHAs from the same underlying commits, `gt track --parent`
  on the new branches only, Span Squash only on new branches. The input stack —
  its branches, Graphite metadata, and PR associations — is untouched, and the
  entire old stack becomes the close-candidate set (Safety rule 2).

Replacement stacks coexist with their input, so their branch names carry a
**generation token**: a `-st<num>` suffix on the `<run>` segment, starting at
`st2` for the first replacement (initial packaging is implicitly generation 1 and
carries no token). Choose the lowest number not already used by a local branch —
LBYL against existing local branches before proposing:

```
retry-budgets-st2--01s-gateway-scaffolding
```

## Input contract

Smush accepts any existing stack. Best case is a contract-conforming Commit Run:
one linear, merge-free branch off trunk, narrated commit messages (choices written
as "chose X over Y because Z"), tip green. Accreted multi-branch stacks (e.g.
autobranch checkpoints), feedback-laden stacks, and previously packaged stacks are
valid degraded input — degradation lowers classification quality, not eligibility —
and are routed by the Packaging rule (see Repackaging).

Classification signal is narrative prose only: there are no structured markers,
and producers do not self-classify. Packaging judges from the commit messages and
holds override authority — it may promote a commit the author treated as minor
into a Decision PR, or demote one into a span.

## Branch-name grammar

Classification must be mechanically parseable from branch names alone. Every slice
branch produced by smush — including the stack tip — uses this grammar:

```
<run>--<NN><c>-<slug>
```

- `<run>` — the run branch's name at packaging time (greedy; may itself contain
  hyphens or slashes). On a replacement stack it ends in the `-st<num>` generation
  token (see Packaging rule); the greedy match absorbs it, so the regex below is
  unchanged.
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

- Every slice branch, including the tip slice, carries a grammar name. How the
  tip gets it differs by construction path (Phase 4): replacement tips are new
  refs named at creation; a fresh run's tip is renamed in place.
- LBYL: before mutating, check every proposed name against existing local branches
  and refuse collisions.
- A branch matching the grammar declares its classification and order; a
  non-matching branch in a packaged stack is a parse gap to report, never to
  guess silently.

## Procedure

### Phase 0 — Preconditions (read-only, LBYL)

1. Confirm explicit user invocation and identify the run branch (default: current
   branch) and trunk.
2. Resolve exactly one owning Objective before classification or proposal work:
   - Use a slug or `.ns/objectives/<slug>/` path only when the invocation or
     current live exchange explicitly selects it as this run's owner — a merely
     mentioned Objective is not a selection. Ownership is never inferred from
     branch, stack, PR, changed-path, or package names, nor from hidden
     attachments or metadata.
   - Otherwise run `ns objective list --format md` and ask the user to select one
     active Objective, even when only one candidate exists.
   - Verify the selection with
     `ns objective exec read-objective <slug> --format md`. If it is missing or
     closed, stop and ask for another active Objective.
   - Keep the selected slug/path fixed for the run. Changing it requires a
     refreshed proposal and readback.
3. The only alternative is an **unbound override** explicitly confirmed by the user
   before mutation. Failure or refusal to select is not confirmation, and bypass
   creates no hidden deferred-binding record. Carry the override through the
   proposal and final report.
4. `git status --porcelain` must be empty. If dirty, stop and ask the user to
   checkpoint, stash, or use another worktree.
5. `ns slot gt exec quiescence --scope downstack --format json` — the stack scope
   must be safe to mutate; otherwise stop and report.
6. `ns slot gt exec stack-map-branches --format json` — if any in-scope branch
   reports `needsRestack` or metadata warnings, stop and report; restacking is not
   part of the mutation the user is approving.
7. Linearity: `git rev-list --merges <trunk>..<tip>` must be empty, and the
   packaging scope must be a single linear chain (no forks branching off in-scope
   commits per the stack graph). A non-linear scope is not packageable; report it.
8. Note pre-existing PR associations of in-scope branches from Graphite metadata or
   from the user — sourced per Safety rule 1. These drive the Packaging rule (any
   PR-associated or unknown-PR-state branch forces replacement construction) and
   the close-candidate list; when unknowable offline, say so in the proposal.

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
   consequence — it belongs in a span.
6. Only then map the decision groups onto the commit order as an **ordered
   partition**: each Decision PR is one decision group's minimal evidence plus the
   commits needed to judge it in isolation; Span PRs are the maximal stretches
   between. Packaging can merge commits into a span but can never split a commit
   (`gt split` is unusable non-interactively; cuts land on commit boundaries only).
7. Draft per-cut rationale: why each boundary is where it is, and why each slice is
   classified as it is. This prose will live in commit messages, nowhere else.

The phase is complete when every commit in `trunk..tip` belongs to exactly one
slice and every cut and classification has drafted rationale.

**Feasibility invariant.** Any grouping that respects commit order is expressible
with pure branch pointers. Infeasibility arises only when a desired decision
boundary falls *inside* a single commit, or the grouping requires reordering
commits. Never claim history rewriting is needed without first checking whether
reclassification (demotion/promotion) achieves the target shape at existing
boundaries. When a decision commit's fatness genuinely caps slice quality, say so
and report it as commit-narration feedback — packaging cannot fix coarse commits.

### Phase 2 — Propose the Slice Map and wait

Render the full proposal, slices bottom-up (trunk-adjacent first). Lead with the
Decision Inventory and coupling conclusions, then the construction path the
Packaging rule selects and the mapping from existing branches/PRs to proposed
slices:

- exactly one binding line: `Owning Objective: <slug> (<path>)`, or
  `UNBOUND OVERRIDE: explicitly confirmed`;
- for a bound run, notice that the packaging event will be committed into the
  resulting stack tip (kept as a supporting commit on a Decision tip; absorbed
  into the final Span Squash and its narration digest on a Span tip);
- proposed branch name (grammar above) and classification;
- boundary SHA and parent;
- the commits inside the slice (count plus subjects);
- rationale excerpt for the cut and classification;
- planned Span Squash targets (every span slice) and what each squash message will
  preserve;
- branches to be backed up (backup ref names are stamped at creation);
- on repackaging: the replacement run name (with its `st<num>` generation token)
  and the complete close-candidate list — every old branch, with PR numbers where
  known;
- any preconditions found in Phase 0 worth the user's eyes (unknown PR state, parse
  gaps, red tip).

Then **stop and wait for explicit ratification**. Ratification covers the
displayed Objective or unbound override as well as the Slice Map. Rework the
proposal on any disagreement or later Objective change — this conversation is also
how the user reshapes an already-packaged stack (repackaging re-run), so treat
"move the cut below X", "promote that span", "merge spans 2 and 3" as ordinary
proposal inputs.

### Phase 3 — Backup refs

After ratification, with a clean status, back up every affected branch (run tip
always; every branch that will be renamed or squashed) in one call:

```bash
ns slot gt exec backup-refs --label smush --branch <branch> [--branch <branch> ...] --format json
```

One `--branch` per affected branch. The command stamps the run (UTC), encodes
`/` in branch names as `__`, and refuses missing branches or backup-name
collisions without creating anything. Record `data.prefix` (`backup/smush-<stamp>/`)
for the final report; on a non-zero exit, stop and report — mutation waits for
backups.

### Phase 4 — Slice

Slicing is pure branch metadata — no rebase, no SHA changes.

**Replacement construction** leaves the input stack's branches and metadata
untouched: create every slice branch (including the tip slice, which freely takes
its grammar name) as a new ref at its boundary SHA in the same underlying commit
history, then `gt track` them bottom-up.

**Initial packaging of a fresh run** reshapes in place:

```bash
git branch <slice-01-name> <boundary-sha-1>
git branch <slice-02-name> <boundary-sha-2>
gt track <slice-01-name> --parent <trunk>         --no-interactive
gt track <slice-02-name> --parent <slice-01-name> --no-interactive
gt track <run>           --parent <slice-02-name> --no-interactive   # reparent tip
gt rename <tip-slice-name> --no-interactive                          # from the run branch
```

Track bottom-up. Re-running `gt track` on a tracked branch reparents it in place;
that is how the run tip moves onto the last interior slice. `gt rename` removes
any open-PR association — safe only because this path requires a PR-free run;
never pass `-f`. Verify: every slice non-empty (`git rev-list --count
<parent>..<slice>` > 0 — submit silently skips empty branches, so an empty slice
is a defect), boundaries in order, `gt restack --no-interactive` reports nothing
to restack.

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
classification rationale is durable — quote and condense the prose that is there,
rather than inventing a decision it does not support.

Squashing changes commit SHAs but not slice-tip trees, so Phase 5 greenness carries
over; spot-check the stack tip with the validation entrypoint after the last
squash.

### Phase 7 — Bind the packaged tip to its Objective

Skip this phase only for a ratified unbound override. A bound run creates exactly
one immutable packaging-event Semantic Update and commits it into the packaged
stack tip.

1. Re-derive the final bottom-up branch/classification map from live topology and
   branch grammar — never from a stale proposal object — and re-read the selected
   Objective with `ns objective exec read-objective <slug> --format md`; stop if
   it is no longer active or its path is missing.
2. With a clean worktree, create a dedicated tip backup and check out the tip:

   ```bash
   ns slot gt exec backup-refs --label smush-bind --branch <packaged-tip> --format json
   git checkout <packaged-tip>
   ```

   Record the returned binding-backup prefix separately from the Phase 3
   packaging prefix.
3. Write the event file — filename convention, manifest template, and content
   rules live in `references/packaging-event.md`. LBYL-check the path and create
   only the new event; an existing event is immutable, so a collision means a new
   filename, never an overwrite or amend.
4. Stage only that path; inspect `git diff --cached --name-only` and
   `git diff --cached --check`. Run the repository validation entrypoint (`just`
   here) against this exact candidate tree; also enforce Markdown formatting and
   Objective structure when the repository gate does not already do so. Capture
   the validated tree with `git write-tree`, then commit locally with Graphite:

   ```bash
   git add -- <event-path>
   gt modify -c -m "Record <run> packaging event" --no-interactive
   ```

5. Restore the tip-slice contract:
   - **Decision tip:** retain the event as a supporting commit; a Decision slice
     is never squashed.
   - **Span tip:** run Span Squash again so the event is absorbed into the
     one-commit span. Preserve the existing span rationale and prior narration
     digest, and append the event commit subject to that digest.
6. Verify: the packaged tip's tree (`git rev-parse <tip>^{tree}`) equals the
   validated `git write-tree` value; then re-run topology, restack,
   non-empty-slice, and clean-status checks.

Any selection, creation, validation, commit, re-squash, tree-equality, or final
binding failure is a hard stop: leave the exact dirty, committed, or
partially-squashed state in place for user-directed recovery and report it per
"Objective-binding failure" in `references/recovery-and-feedback.md`. The stack is
not submission-ready until that protocol completes.

### Phase 8 — Final verification and report

1. `ns slot gt exec stack-branches --format json` — confirm the final topology
   matches the ratified Slice Map; `gt restack --no-interactive` reports nothing
   to restack.
2. `git status --porcelain` clean.
3. For bound success, report the owning Objective, packaging-event path,
   confirmation that the event is part of the packaged tip, final Slice Map, both
   backup prefixes, and validation evidence.
4. For bypass success, render this conspicuous section:

   ```text
   UNBOUND OVERRIDE
   No packaging-event Semantic Update was written.
   The later decide workflow cannot discover a canonical Objective for decision records.
   ```

5. On repackaging, render the close-candidate section per Safety rule 2 — every
   old branch, with PR numbers where known, and the explicit note that smush did
   not and will not touch those PRs.
6. On repackaging, hand off review-feedback carry-forward to the companion
   post-submit step (decide-skill family) that moves relevant feedback from the
   old PRs into the new shape — smush stays local-only and does not inspect PR
   threads. For commit-content feedback that does not move slice boundaries,
   `gt absorb` / `gt modify --into` (see `references/recovery-and-feedback.md`)
   remains the local path.
7. Close by restating that submission — and everything PR-shaped: titles, bodies,
   review policy — is the user's, outside this skill.

## Repackaging and multi-branch input

A previously packaged or submitted stack — and any accreted multi-branch stack —
takes replacement-stack construction per the Packaging rule and Phase 4. Two
deltas, then Phases 2–8 run on the new branches:

1. Derive the current Slice Map first (topology from `ns slot gt exec
   stack-branches`, classification from grammar branch names, rationale from
   boundary/squash commit messages) and show it in the Phase 2 proposal beside
   the proposed new map.
2. Slice the underlying `trunk..tip` commit sequence directly — the input's
   existing branch boundaries are classification signal, not constraints.

State the costs in the proposal so the user reshapes with open eyes: re-slicing a
previously squashed span cannot recover its interior commits (only the narration
digest survives) — an accepted cost of Span Squash; and once the user submits, a
replacement stack re-runs CI across the full new stack, so repackaging frequency
and PR count compound.

## Recovery, feedback, and limits

Branch-only material lives in `references/recovery-and-feedback.md`. Read it
when:

- a mutation went wrong or a `gt` operation failed (Recovery);
- the user wants small post-packaging edits absorbed without a full repackage
  (Absorbing feedback);
- a scoping question arises about what v1 can and cannot do (Known limits).
