---
name: dev-memjective-reconcile
description: "Reconcile a memjective by consuming the fact bundle from `memjective check`, identifying merged PR observations whose source snapshots have not been incorporated into the root docs, conservatively rewriting the master-branch snapshot, and persisting an incorporation entry via `memjective exec init` / `memjective exec record-entry`. Use after one or more PRs in a memjective stack land on master and the root docs need to catch up. See `dev-memjective` for the subsystem overview."
allowed-tools:
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
`matching_stored_entry_ids` is non-empty for every reconciled PR, so the
candidate filter in Step 3 skips it.

## Where this skill fits

- `memjective check` (Python) collects deterministic evidence — branch
  snapshots, PR observations, stored state, typed diagnostics. It makes
  no semantic decisions.
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
  same way `memjective check` does (auto-resolve when exactly one
  memjective is on the current branch). Pass the slug explicitly to
  `memjective check` either way; this skill never short-circuits the
  fact-bundle step.

## Workflow

### 1. Run `memjective check`

```bash
memjective check <slug> --format json
```

Capture the JSON bundle. Fail fast if the command exits non-zero or the
output is not valid JSON — that means the standalone CLI is broken in
this environment, and downstream steps cannot trust their inputs.

### 2. Stop on root or state diagnostics

Inspect `data.diagnostics` and `data.state` from the bundle.

Stop and report (do **not** rewrite root docs) when any of these are
present:

- `missing_root_memjective` diagnostic — root docs do not exist on
  master. The user must run `dev-memjective-create` first; reconcile
  has nothing to merge into.
- `data.state.status == "invalid"` (also surfaces as `invalid_state`
  in `diagnostics`) — the stored state blob is corrupt. The user
  needs to inspect or reset
  `memjective-state/master:<slug>/state.json` before reconcile can
  reason about prior incorporations.
- `branch_pr_identity_conflict` diagnostic — two branches claim the
  same PR number. The fact bundle is ambiguous; report the diagnostic
  payload and let the user resolve by deleting the stale snapshot.

These are hard stops. Do not attempt partial reconciliation.

### 3. Pick the candidate merged PR observations

From `data.branches`, select branches where:

- `pr.lookup_status == "found"`, AND
- `pr.state == "MERGED"`, AND
- `matching_stored_entry_ids == []` (no stored entry already records
  this PR), AND
- `source.stale` is informational only — a stale source branch with
  surviving snapshot is still a valid evidence source, since the
  snapshot ref outlives the branch.

Skip branches with `pr.state` of `OPEN` (work in progress),
`CLOSED` (semantic decision — surface to the user with a one-liner so
they can choose to act in a separate session, but do not rewrite root
docs from a closed unmerged PR in this skill), or `lookup_status` of
`missing` / `error` (no PR identity to anchor against).

If no candidates remain, report "no pending incorporations" with a
short summary of what was scanned and stop.

### 4. Process candidates one at a time

Reconcile is per-PR: each candidate gets its own evidence read,
rewrite, persist, and report cycle. Do not batch rewrites across
multiple PRs — that obscures which PR contributed which edit and
makes the eventual state record harder to reason about.

For each candidate, in `pr.number` ascending order:

#### 4a. Read the source memjective docs

Use the `source` locator from the branch entry:

```bash
brmem get <source.path>/body.md \
  --namespace <source.namespace> \
  --branch <source.branch> > /tmp/<slug>-source-body.md
brmem get <source.path>/roadmap.md \
  --namespace <source.namespace> \
  --branch <source.branch> > /tmp/<slug>-source-roadmap.md  # if present
brmem get <source.path>/notes.md \
  --namespace <source.namespace> \
  --branch <source.branch> > /tmp/<slug>-source-notes.md    # if present
```

`brmem get` exits non-zero when the key is absent. Optional files
(`roadmap.md`, `notes.md`) may legitimately be missing — treat that
as "this PR did not touch that file on its source branch", not as a
blocker.

Capture the source `head_sha` for each file via:

```bash
brmem check <source.path>/<file> \
  --namespace <source.namespace> \
  --branch <source.branch> --format json
```

These SHAs become part of the entry reported in Step 8.

#### 4b. Read the root memjective docs

Use the `root` locator from the bundle:

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

Capture each root file's current `head_sha` via `brmem check` so the
report can show before/after pairs.

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
    "namespace": "<source.namespace>",
    "branch": "<source.branch>",
    "path": "<source.path>",
    "files": {
      "body.md":    "<source body head_sha>",
      "roadmap.md": "<source roadmap head_sha or null>",
      "notes.md":   "<source notes head_sha or null>"
    }
  },
  "root_before": {
    "namespace": "<root.namespace>",
    "branch":    "<root.branch>",
    "path":      "<root.path>",
    "files": {
      "body.md":    "<root body head_sha before>",
      "roadmap.md": "<root roadmap head_sha before or null>",
      "notes.md":   "<root notes head_sha before or null>"
    }
  },
  "root_after": {
    "namespace": "<root.namespace>",
    "branch":    "<root.branch>",
    "path":      "<root.path>",
    "files": {
      "body.md":    "<root body head_sha after>",
      "roadmap.md": "<root roadmap head_sha after or null>",
      "notes.md":   "<root notes head_sha after or null>"
    }
  }
}
```

Use `incorporated_no_doc_change` as the `resolution` when the LM
decided no root edit was warranted; in that case `root_after` equals
`root_before` field-for-field.

If `data.state.status == "absent"` from the original `memjective check`
bundle, initialize the state blob first:

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

Capture the returned `commit_sha` and `action` (`created`, `updated`,
or `promoted`) for the final report.

### 5. Re-run `memjective check`

After persisting all candidate rewrites and recording their entries,
re-run:

```bash
memjective check <slug> --format json
```

Diff the new fact bundle against the original. The expected delta is
that each reconciled candidate's `matching_stored_entry_ids` now
contains the recorded entry id (e.g. `["pr-221"]`) and the root
snapshots have moved — the user can inspect with `memjective show
<slug>` if they want a rendered preview. Diagnostics should not
regress (no new `missing_root_memjective`, `invalid_state`, or
`branch_pr_identity_conflict`); call out any that did.

### 6. Final report

Summarize:

- **Slug** and the candidate count scanned, processed, and skipped
  (with reasons for each skip).
- **Per-PR record** — for each processed candidate, the entry from
  Step 4f, the per-file old → new SHA pairs on root, and a one-line
  summary of the rewrite's intent.
- **Recorded state entries** — for each processed candidate, the
  `commit_sha` and `action` returned by `memjective exec record-entry`
  (and, on first call this run, the `commit_sha` returned by
  `memjective exec init` if it created the state blob).
- **Re-check delta** — any new diagnostics, plus a one-liner
  confirming the original blocking diagnostics are still absent and
  that the reconciled PRs now show non-empty
  `matching_stored_entry_ids`.
- **Recovery hint** for each rewritten root file:

  ```text
  brmem get <root.path>/<file> --namespace <root.namespace> --at <old-sha>
  ```

## Edge cases

- **No merged PRs visible** — report "no pending incorporations" and
  stop. This is the steady state after a successful reconcile.
- **A candidate's source branch has been deleted but the snapshot
  ref survives** — `source.stale: true`. The snapshot is still
  authoritative evidence; proceed normally and call out the stale
  source in the report so the user knows the working branch is
  gone.
- **Candidate `roadmap.md` / `notes.md` is absent on the source** —
  treat as "no contribution from that file" rather than an error.
  `body.md` is required on every snapshot per the subsystem invariant;
  if it is missing, abort that candidate with a clear error and let
  the user inspect via `memjective show`.
- **State is loaded but `matching_stored_entry_ids` is non-empty for
  a candidate** — that PR has already been recorded; do not reprocess
  it. This is the idempotency guard for the steelthread.
- **PR lookup error on a non-candidate branch** — surface the
  `pr_lookup_error` diagnostic in the report but proceed with the
  candidates that did resolve. One broken `gh` lookup must not block
  unrelated reconciles.
- **Closed unmerged PR with a visible source** — report it under
  "skipped — closed unmerged" and stop. Whether to record a
  `skipped` entry is a semantic decision deferred to the user; this
  skill never auto-records skips.
- **Stored entry without a visible source** — surface the
  `stored_entry_without_visible_source` diagnostic. Do not delete or
  rewrite stored entries from this skill — orphaned entries are
  Slice 4+/state-management territory.

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
  `memjective check`. The locator is the contract; bypassing it
  drifts the skill from the fact bundle.
- Acting on `branch_pr_identity_conflict`, `invalid_state`, or
  `missing_root_memjective` diagnostics. Reconcile stops on those —
  the user resolves them out-of-band before re-running.
- Using this skill for a comprehensive master rewrite from every
  sibling branch. That is `dev-memjective-update`'s master-reconcile
  variant via `dev-memjective-next` on master.

## Status

End-to-end as of the minimal-state-writes slice: read fact bundle →
rewrite root docs → record incorporation entry via `memjective exec
init` + `memjective exec record-entry`.

Deferred to later slices:

- **Provenance hardening** — root-before / root-after `tree_sha`,
  merge commit OID, and strict matching of `root_before` / `root_after`
  against pending-entry evidence. The current writer accepts the
  Step 4f shape opaquely under `source` / `root_before` / `root_after`;
  it does not yet validate provenance.
