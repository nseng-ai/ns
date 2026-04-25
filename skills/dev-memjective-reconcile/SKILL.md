---
name: dev-memjective-reconcile
description: "Reconcile a memjective by consuming pending entries from `memjective exec compute-pending-entries`, identifying merged PR observations whose source snapshots have not been incorporated into the root docs, conservatively rewriting the master-branch snapshot, and persisting an incorporation entry via `memjective exec init` / `memjective exec record-entry`. Use after one or more PRs in a memjective stack land on master and the root docs need to catch up. See `dev-memjective` for the subsystem overview."
allowed-tools:
  - "Bash(memjective exec compute-pending-entries *)"
  - "Bash(memjective check *)"
  - "Bash(memjective exec init *)"
  - "Bash(memjective exec record-entry *)"
  - "Bash(brmem get *)"
  - "Bash(brmem put *)"
  - "Bash(brmem check *)"
  - "Bash(brmem list *)"
  - "Bash(mktemp)"
  - "Bash(diff *)"
  - "Read"
  - "Write"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-reconcile

LM-led reconciliation of a memjective's root (master-branch) snapshot.

> For shared concepts — vocabulary (`snapshot`, `master-branch snapshot`,
> `per-branch snapshot`), the storage model, the one-memjective-per-branch
> invariant, carry-forward semantics, the lifecycle, and the per-file
> mutation contract — see `../dev-memjective/SKILL.md`.

## Goal

For one memjective slug, identify merged PR observations whose source
snapshots carry findings the master-branch snapshot does not yet reflect,
read the source docs and the root docs, conservatively rewrite the root
docs in place per the per-file mutation contract, persist the rewrite
with `brmem put`, and record an incorporation entry in
`memjective-state/master:<slug>/state.json` via `memjective exec
record-entry`. After this skill runs cleanly, a re-run is a no-op:
each reconciled PR drops out of `pending_entries`.

## Where this skill fits

- `memjective exec compute-pending-entries` (Python) collects
  deterministic evidence and bucketizes it into `pending_entries`,
  `blocked_entries`, `ignored_entries`, and structured `errors`. It
  makes no semantic decisions. (`memjective check` remains available
  for ad-hoc debugging of the underlying fact bundle.)
- `dev-memjective-reconcile` (this skill) decides, with the LM and the
  user, whether a merged PR's source snapshot moved the root docs and
  performs that conservative rewrite.
- `dev-memjective-update`'s master-reconcile variant rewrites master
  using **all** sibling-branch snapshots as evidence and is invoked by
  `dev-memjective-next` on master. This skill is narrower — it acts on
  one merged PR at a time and is anchored to the `memjective check`
  fact bundle, not a full sibling sweep.

When the user wants a comprehensive master rewrite from every sibling,
direct them to `dev-memjective-next` on master (which dispatches the
`update` master-reconcile variant). When the user wants per-merged-PR
incorporation grounded in stored state, run this skill.

## Inputs

- **Slug** — the memjective slug. If omitted, the LM should resolve the
  same way `memjective exec compute-pending-entries` does (auto-resolve
  when exactly one memjective is on the current branch). Pass the slug
  explicitly to `memjective exec compute-pending-entries` either way;
  this skill never short-circuits the fact-bundle step.

## Workflow

### 1. Run `memjective exec compute-pending-entries`

```bash
memjective exec compute-pending-entries <slug> --format json
```

Capture the JSON bundle. Fail fast if the command exits non-zero or the
output is not valid JSON — that means the standalone CLI is broken in
this environment, and downstream steps cannot trust their inputs.

### 2. Stop on structural errors

Inspect `data.errors` from the bundle. Stop and report (do **not**
rewrite root docs) when any error has a `kind` of:

- `missing_root_memjective` — root docs do not exist on master. The
  user must run `dev-memjective-create` first; reconcile has nothing
  to merge into.
- `invalid_state` — the stored state blob is corrupt. The user needs
  to inspect or reset `memjective-state/master:<slug>/state.json`
  before reconcile can reason about prior incorporations.
- `branch_pr_identity_conflict` — two branches claim the same PR
  number. The fact bundle is ambiguous; report the error payload and
  let the user resolve by deleting the stale snapshot.
- `missing_brmem_snapshot_for_merged_pr` — a merged PR's branch is
  in the tree but its `<slug>/` subtree is missing. The writer
  cannot anchor an incorporation entry without a source snapshot;
  surface the error and stop.

These are hard stops. Do not attempt partial reconciliation.

### 3. Iterate `data.pending_entries`

Each pending entry is a merged PR with no matching stored entry and a
durable source snapshot. The bucketizer has already filtered out open
PRs, closed unmerged PRs, branches with no PR, and PRs already
recorded — that work no longer happens in the skill.

If `data.pending_entries` is empty, report "no pending incorporations"
with a short summary of what was scanned (counts of `blocked_entries`,
`ignored_entries`, and any non-blocking errors) and stop.

### 4. Process pending entries one at a time

Reconcile is per-PR: each pending entry gets its own evidence read,
rewrite, persist, and report cycle. Do not batch rewrites across
multiple PRs — that obscures which PR contributed which edit and
makes the eventual state record harder to reason about.

For each entry in `data.pending_entries`, in `candidate_entry.pr_number`
ascending order:

#### 4a. Read the source memjective docs

Use `entry.recommended_reads[0]` as the source locator (this carries
`namespace`, `branch`, `path`, and the durable `tree_sha`):

```bash
brmem get <recommended_reads[0].path>/body.md \
  --namespace <recommended_reads[0].namespace> \
  --branch <recommended_reads[0].branch> > /tmp/<slug>-source-body.md
brmem get <recommended_reads[0].path>/roadmap.md \
  --namespace <recommended_reads[0].namespace> \
  --branch <recommended_reads[0].branch> > /tmp/<slug>-source-roadmap.md  # if present
brmem get <recommended_reads[0].path>/notes.md \
  --namespace <recommended_reads[0].namespace> \
  --branch <recommended_reads[0].branch> > /tmp/<slug>-source-notes.md    # if present
```

`brmem get` exits non-zero when the key is absent. Optional files
(`roadmap.md`, `notes.md`) may legitimately be missing — treat that
as "this PR did not touch that file on its source branch", not as a
blocker.

Record `recommended_reads[0].tree_sha` as the durable provenance hash
for the entry's `source` block. This is the tree-level SHA over the
entire `<slug>/` subtree on the source branch — it changes when any
file under `<slug>/` changes and is unaffected by sibling slugs. Per-file
`head_sha` capture is no longer required; the tree SHA is the
single provenance value the writer carries (PR 6 will validate it).

#### 4b. Read the root memjective docs

Use `data.root` as the root locator (this carries `namespace`, `branch`,
`path`, and the root `tree_sha`):

```bash
brmem get <root.path>/body.md \
  --namespace <root.namespace> \
  --branch <root.branch> > /tmp/<slug>-root-body.md
brmem get <root.path>/roadmap.md \
  --namespace <root.namespace> \
  --branch <root.branch> > /tmp/<slug>-root-roadmap.md   # if present
brmem get <root.path>/notes.md \
  --namespace <root.namespace> \
  --branch <root.branch> > /tmp/<slug>-root-notes.md     # if present
```

Record the root `tree_sha` from `data.root.tree_sha` as the
`root_before` provenance hash. After the rewrite, capture the new
root `tree_sha` from a re-run of `compute-pending-entries` (Step 5)
or from `brmem check` on the rewritten root and use it as
`root_after`.

#### 4c. Decide whether the source moved the root

Compare each source file against its root counterpart. The questions
the LM answers:

- **`body.md`** — did the source flip a `Status` line, check off a
  `Completion Criteria` bullet, or refine `Description` / `Goals` /
  `How to Make Progress` in a way that should hold on root? Most
  `body.md` deltas should be carried; a few (e.g. transient
  experiment notes) should not.
- **`roadmap.md`** — which slices are checked on the source but
  unchecked on root? Did the source split or reorder remaining
  items? Carry forward checked items and structural splits; do not
  copy verbatim.
- **`notes.md`** — does the source have durable findings the root
  lacks? Append them to the root `notes.md` with a marker like
  `<!-- from PR #<number>, source <source.branch> -->`.

If the LM concludes nothing should change on root for this PR, that
is a valid outcome. Skip directly to Step 8 with `resolution:
"incorporated_no_doc_change"` and a brief reason.

The conservative-rewrite contract is the same one
`dev-memjective-update` enforces — see
`../dev-memjective/references/mutation-contract.md`. The evidence
source differs (a single PR's source snapshot vs. a sibling sweep)
but the per-file rules are identical.

#### 4d. Show the diff and confirm with the user

Before any `brmem put`, show a unified diff of every root file the
rewrite would change:

```bash
diff -u /tmp/<slug>-root-<file>{,.proposed}
```

Pause for user confirmation. Reconcile must not auto-write root docs
on the LM's say-so alone — root is the authoritative master-branch
snapshot, and an incorrect rewrite is harder to undo than a missed
incorporation.

#### 4e. Persist updated root docs

After confirmation, write each changed file back to root:

```bash
brmem put <root.path>/body.md \
  --namespace <root.namespace> \
  --branch <root.branch> \
  --file /tmp/<slug>-root-body.proposed
# repeat for roadmap.md / notes.md if changed
```

Capture the new `head_sha` for each persisted file.

Skip `brmem put` for any file whose proposed content is byte-identical
to its current root content.

#### 4f. Record the state entry

Compose the entry payload below, then persist it via the writer CLI.
Do not edit `memjective-state/master:<slug>/state.json` by hand — the
writer enforces the schema, regression guard, and unique-PR-number
invariant.

```json
{
  "id": "pr-<number>",
  "resolution": "incorporated",
  "summary": "<one-line LM summary of what the source taught root>",
  "pr": {
    "number": <number>,
    "url": "<url>",
    "title": "<title>",
    "head_ref_name": "<head_ref_name>",
    "base_ref_name": "<base_ref_name>",
    "state": "MERGED"
  },
  "source": {
    "namespace": "<recommended_reads[0].namespace>",
    "branch":    "<recommended_reads[0].branch>",
    "path":      "<recommended_reads[0].path>",
    "tree_sha":  "<recommended_reads[0].tree_sha>"
  },
  "root_before": {
    "namespace": "<root.namespace>",
    "branch":    "<root.branch>",
    "path":      "<root.path>",
    "tree_sha":  "<root tree_sha before>"
  },
  "root_after": {
    "namespace": "<root.namespace>",
    "branch":    "<root.branch>",
    "path":      "<root.path>",
    "tree_sha":  "<root tree_sha after>"
  }
}
```

Use `incorporated_no_doc_change` as the `resolution` when the LM
decided no root edit was warranted; in that case `root_after.tree_sha`
equals `root_before.tree_sha`.

If `data.state.status` was `absent` (from a parallel `memjective check`
or because no entries are recorded yet), initialize the state blob
first:

```bash
memjective exec init <slug>
```

`init` is idempotent — if state already exists for the slug it returns
ok with `created: false`. Then persist the entry:

```bash
memjective exec record-entry <slug> --json '<payload>'
# or, if the payload is on disk:
memjective exec record-entry <slug> --file /tmp/<slug>-pr-<number>-entry.json
```

The writer treats the `source` / `root_before` / `root_after` blocks
opaquely in this slice — the `tree_sha` value is recorded but not yet
validated. A later slice will use these fields to enforce non-stale
incorporation.

Capture the returned `commit_sha` and `action` (`created`, `updated`,
or `promoted`) for the final report.

### 5. Re-run `memjective exec compute-pending-entries`

After persisting all candidate rewrites and recording their entries,
re-run:

```bash
memjective exec compute-pending-entries <slug> --format json
```

Diff the new bundle against the original. The expected delta is that
each reconciled PR has dropped out of `data.pending_entries` and the
root `tree_sha` has advanced — the user can inspect with `memjective
show <slug>` if they want a rendered preview. Errors should not
regress (no new `missing_root_memjective`, `invalid_state`,
`branch_pr_identity_conflict`, or
`missing_brmem_snapshot_for_merged_pr`); call out any that did.

### 6. Final report

Summarize:

- **Slug** and the count of pending entries scanned, processed, and
  blocked / ignored (with reasons for each).
- **Per-PR record** — for each processed pending entry, the entry from
  Step 4f, the root `tree_sha` before/after, and a one-line summary of
  the rewrite's intent.
- **Recorded state entries** — for each processed candidate, the
  `commit_sha` and `action` returned by `memjective exec record-entry`
  (and, on first call this run, the `commit_sha` returned by
  `memjective exec init` if it created the state blob).
- **Re-check delta** — any new errors, plus a one-liner confirming the
  original blocking errors are still absent and that the reconciled
  PRs no longer appear in `data.pending_entries`.
- **Recovery hint** for each rewritten root file:

  ```text
  brmem get <root.path>/<file> --namespace <root.namespace> --at <old-sha>
  ```

## Edge cases

- **No pending entries** — `data.pending_entries == []`. Report "no
  pending incorporations" and stop. This is the steady state after a
  successful reconcile.
- **A pending entry's source branch has been deleted but the snapshot
  ref survives** — the entry's `recommended_reads[0].tree_sha` is still
  populated. The snapshot is still authoritative evidence; proceed
  normally and call out the stale source in the report so the user
  knows the working branch is gone.
- **Pending entry's `roadmap.md` / `notes.md` is absent on the source** —
  treat as "no contribution from that file" rather than an error.
  `body.md` is required on every snapshot per the subsystem invariant;
  if it is missing, abort that entry with a clear error and let the
  user inspect via `memjective show`.
- **PR lookup error on a non-candidate branch** — surface the
  `pr_lookup_error` error in the report but proceed with the pending
  entries that did resolve. One broken `gh` lookup must not block
  unrelated reconciles.
- **Closed unmerged PR** — surfaces in `data.blocked_entries` with
  `action: "decide_skip"`. Report it under "blocked — closed unmerged"
  and stop on that PR. Whether to record a `skipped` entry is a
  semantic decision deferred to the user; this skill never auto-records
  skips.
- **Stored entry without a visible source** — not surfaced by
  `compute-pending-entries`. Run `memjective check` for ad-hoc
  debugging if the user reports orphaned entries; do not delete or
  rewrite stored entries from this skill.

## Anti-patterns

- Auto-writing root docs without a user confirmation. Root is the
  authoritative shared state; reconcile must not rewrite it on the
  LM's say-so alone.
- Synthesizing a `state.json` write by hand. Always go through
  `memjective exec init` and `memjective exec record-entry`; the
  writer enforces schema, regression guard, and the unique-PR-number
  invariant.
- Copying source files verbatim onto root. Carry-forward (`copy
  source onto root`) is `dev-memjective-next`'s primitive, not
  reconcile's. Reconcile applies the per-file mutation contract.
- Batching rewrites across multiple PRs in a single `brmem put`
  per file. Per-PR cycles keep the state-entry contribution
  attributable; merged rewrites obscure which PR taught which edit.
- Reading the master-branch snapshot directly off `master` via `git`
  primitives instead of through the `root` locator returned by
  `memjective exec compute-pending-entries`. The locator is the
  contract; bypassing it drifts the skill from the fact bundle.
- Acting on `branch_pr_identity_conflict`, `invalid_state`,
  `missing_root_memjective`, or `missing_brmem_snapshot_for_merged_pr`
  errors. Reconcile stops on those — the user resolves them
  out-of-band before re-running.
- Using this skill for a comprehensive master rewrite from every
  sibling branch. That is `dev-memjective-update`'s master-reconcile
  variant via `dev-memjective-next` on master.

## Status

End-to-end as of the snapshot-provenance slice: iterate
`pending_entries` from `memjective exec compute-pending-entries` →
rewrite root docs → record incorporation entry (with
`source.tree_sha`, `root_before.tree_sha`, `root_after.tree_sha`)
via `memjective exec init` + `memjective exec record-entry`.

Deferred to later slices:

- **Provenance validation** — strict matching of `root_before` /
  `root_after` `tree_sha`, plus `merged_at` / `merge_commit_oid`
  staleness checks. The current writer accepts the Step 4f shape
  opaquely; it does not yet validate provenance.
