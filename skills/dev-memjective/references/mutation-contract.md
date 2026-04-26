# Memjective Mutation Contract

Single source of truth for what memjective operations may mutate, how shared
rewrite logic works, and how `update` and `reconcile` differ.

## Data model

- **Canonical memjective**: shared ground truth for a slug. In the current
  implementation this is stored in `brmem` on branch `master`.
- **Branch snapshot**: local working copy/checkpoint for a slug on a working
  branch.

Only `body.md` is required. `roadmap.md` and `notes.md` appear when useful.

## Operation table

| Operation                  | Canonical memjective                 | Current branch snapshot        | Other branch snapshots |
| -------------------------- | ------------------------------------ | ------------------------------ | ---------------------- |
| `dev-memjective-create`    | Writes initial `body.md` and roadmap | Never                          | Never                  |
| `dev-memjective-next`      | Reads only                           | Reads only                     | Reads only             |
| `dev-memjective-claim`     | May read as source                   | Writes verbatim copy to target | May read as source     |
| `dev-memjective-update`    | Never                                | Rewrites from branch work      | Never                  |
| `dev-memjective-reconcile` | Rewrites from branch + PR evidence   | Reads only as evidence         | Reads only as evidence |

Carry-forward is exclusively `dev-memjective-claim`'s job. It copies one
source snapshot exactly; it never merges or summarizes.

## Shared conservative rewrite rules

`dev-memjective-update` and `dev-memjective-reconcile` share these file
editing rules. The evidence source differs by mode, but the allowed edits are
the same.

### `body.md`

| Section              | Allowed                                               | Forbidden                                            |
| -------------------- | ----------------------------------------------------- | ---------------------------------------------------- |
| Title                | Leave as-is                                           | Rename unless the user explicitly asks               |
| Status               | Move categorically (`in progress`, `blocked`, `done`) | Turn into a progress log                             |
| Description          | Small factual clarifications                          | Restate per-PR progress every slice                  |
| Goals                | Small clarifications only                             | Turn into a checklist or second roadmap              |
| Completion Criteria  | Check items; add brief evidence notes                 | Delete criteria; casually rewrite criteria; renumber |
| How to Make Progress | Edit when the actual recipe changed                   | Edit merely because a roadmap item finished          |

`body.md` should be the quietest file. Most progress lands in `roadmap.md`
and `notes.md`.

### `roadmap.md`

Allowed:

- check completed items
- keep completed items visible
- add nearby follow-ups discovered during slice work
- split an item when work landed in more granular pieces than expected
- reorder remaining items when the actual slice order changed

Forbidden:

- erase completed items or progress history
- wholesale reshuffle without clear evidence
- add manual-only or observation-only bullets such as "live testing session"
  or "manual smoke-test"

Every roadmap bullet must describe codified work that lands in a PR: code,
tests, docs, config, or deliberate deletion.

### `notes.md`

Allowed:

- append durable findings, constraints, collisions, and pointers
- annotate obsolete notes in place
- create `notes.md` when durable findings first appear

Forbidden:

- silently delete notes
- strip context just because a branch or PR is done

## Rewrite modes

| Mode                   | Skill                      | Target               | Evidence                                           | No-op rule                       |
| ---------------------- | -------------------------- | -------------------- | -------------------------------------------------- | -------------------------------- |
| Branch snapshot update | `dev-memjective-update`    | Current branch       | Branch commits since snapshot freshness            | Snapshot fresh relative to HEAD  |
| Canonical reconcile    | `dev-memjective-reconcile` | Canonical memjective | Branch snapshots plus associated PR state/metadata | No branch/PR evidence to fold in |

### Branch snapshot update

`update` refreshes the current branch snapshot from work that landed on the
same branch. It aborts on `master` in the current implementation because
`master` is the canonical storage branch.

Evidence:

- files currently attached under `<slug>/` on the branch
- `head_date` metadata for those files
- commits newer than the snapshot, usually from `git log`

Freshness rule:

- If the maximum `head_date` across attached files is at-or-after branch
  HEAD's commit time, print the in-sync message and do not write.

### Canonical reconcile

`reconcile` refreshes the canonical memjective. It is grounded by branch
snapshots carrying the same slug and by the PRs associated with those
branches.

Preferred evidence adapter:

```bash
memjective tree <slug> --format json
```

Use the tree output to identify:

- branch snapshots carrying `<slug>/`
- whether the canonical seed is present
- whether each branch is live or stale/orphaned
- PR number, URL, title, state, and lookup errors for each branch

Then load the relevant branch snapshot files with `brmem get` and, when PR
metadata is needed to interpret the snapshot, inspect the associated PR:

```bash
gh pr view <number-or-branch> \
  --json number,title,url,headRefName,baseRefName,state,mergedAt,commits,body
```

Use PR state as evidence weight:

- **merged PR**: strongest signal that checked roadmap items and completion
  criteria should be folded into canonical state.
- **open PR**: useful for in-flight findings and likely follow-ups, but avoid
  marking canonical completion unless already true on the target branch.
- **closed unmerged PR**: weak evidence; preserve durable findings only when
  still relevant and label uncertainty in the report.
- **no PR**: local-only evidence; treat conservatively.
- **PR lookup error**: do not abort reconciliation; report the evidence gap.
- **orphaned branch snapshot**: valid but weak evidence; prefer corroboration
  from a live branch or merged PR.

`reconcile` never writes to branch snapshots and never copies a branch
snapshot verbatim onto canonical state. Branch text and PR metadata are
evidence for a conservative rewrite, not source content to paste wholesale.

## Common rewrite workflow

Both rewrite modes follow the same shape:

1. Confirm repository, branch, and explicit slug.
2. Confirm the target exists (`update`: branch snapshot; `reconcile`:
   canonical memjective).
3. Capture old brmem commit SHAs for files that may be rewritten.
4. Load target files.
5. Collect mode-specific evidence.
6. Apply the shared conservative rewrite rules.
7. `brmem put` only files that changed.
8. Report files touched, old SHA to new SHA, evidence consulted, and recovery
   commands.

## Other operation rules

### `dev-memjective-next`

`next` writes nothing. It resolves the best source for a slug, reports status,
flags stale non-canonical branch snapshots, and suggests a next-slice slug.
It does not inspect source code to audit progress.

### `dev-memjective-claim`

`claim` writes an exact copy of every file under `<slug>/` from a resolved
source onto a target branch. It never edits the files while attaching them.

Source resolution:

1. explicit local file or branch, if supplied
2. nearest ancestor branch snapshot carrying the slug
3. canonical memjective

### `dev-memjective-create`

`create` drafts the canonical memjective. It writes `body.md`, optionally
`roadmap.md`, and never writes `notes.md`.

## Anti-patterns

- Letting `update` edit canonical state.
- Letting `reconcile` write back to branch snapshots.
- Copying a branch snapshot verbatim onto canonical state.
- Letting ordinary update/reconcile runs rename sections or rebuild a
  snapshot wholesale.
- Treating a closed-unmerged PR or orphaned snapshot as authoritative on its
  own.
- Storing progress history in `Status:`.
- Repeating roadmap progress in `Description`.
- Adding manual-only or observation-only roadmap bullets.
