# Objective Mutation Contract

Single source of truth for what objective operations may mutate, how shared
rewrite logic works, and how `update` and `reconcile` differ.

## Data model

- **Canonical objective**: shared ground truth for a slug. In the current
  implementation this is stored in `brmem` on branch `master`.
- **Branch snapshot**: local working copy/checkpoint for a slug on a working
  branch.

Only `body.md` is required. `roadmap.md` and `notes.md` appear when useful.

## Operation table

| Operation             | Canonical objective                       | Current branch snapshot        | Other branch snapshots |
| --------------------- | ----------------------------------------- | ------------------------------ | ---------------------- |
| `objective-create`    | Writes initial `body.md` and roadmap      | Never                          | Never                  |
| `objective-next`      | Reads only                                | Reads only                     | Reads only             |
| `objective-current`   | Reads only                                | Reads only                     | Reads only             |
| `objective-digest`    | Reads only                                | Reads only                     | Reads only             |
| `objective-claim`     | May read as source                        | Writes verbatim copy to target | May read as source     |
| `objective-update`    | Never                                     | Rewrites from branch work      | Never                  |
| `objective-reconcile` | Rewrites from landed branch + PR evidence | Reads only as evidence         | Reads only as evidence |

Carry-forward is exclusively `objective-claim`'s job. It copies one
source snapshot exactly; it never merges or summarizes.

## Shared conservative rewrite rules

`objective-update` and `objective-reconcile` share these file
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

| Mode                   | Skill                 | Target              | Evidence                                                  | No-op rule                                      |
| ---------------------- | --------------------- | ------------------- | --------------------------------------------------------- | ----------------------------------------------- |
| Branch snapshot update | `objective-update`    | Current branch      | Branch commits since snapshot freshness                   | Snapshot covers every `trunk..HEAD` content PID |
| Canonical reconcile    | `objective-reconcile` | Canonical objective | Landed branch snapshots plus associated PR state/metadata | No landed branch/PR evidence to fold in         |

### Branch snapshot update

`update` refreshes the current branch snapshot from work committed on the
same branch. It is for stacked PRs: use it when another branch will claim
from the current branch before the current branch lands. For a simple
single-PR path, merge the PR and run `objective-reconcile` on `master`
instead. `update` aborts on `master` in the current implementation because
`master` is the canonical storage branch.

Evidence:

- files currently attached under `<slug>/` on the branch
- the machine-owned `<slug>/.absorbed.jsonl` marker recording which patch IDs
  the snapshot has absorbed
- all commits on `master..HEAD` and their `git patch-id` values

Freshness rule:

- Freshness is patch-id based. The snapshot is fresh when every non-null
  content `patch-id` in `master..HEAD` is present in the
  `<slug>/.absorbed.jsonl` marker. Commits with `None` patch IDs (merges,
  empty commits) are ignored for freshness; commit SHA, subject, and author
  time are diagnostic only.
- If `master..HEAD` is empty, the snapshot is fresh by definition; print the
  in-sync message and do not write.
- A malformed `.absorbed.jsonl` marker renders the snapshot stale.
- Do not use timestamps (snapshot file `head_date`, commit author time, or
  committer time) as a reason to skip evidence triage. Author times survive
  some rebases but `git commit --amend --reset-author` can move them, and
  cherry-picks routinely preserve old author times; only the patch-id
  marker is authoritative.

### Canonical reconcile

`reconcile` refreshes the canonical objective. It is grounded by landed
branch snapshots carrying the same slug and by the merged PRs associated with
those branches. Open PRs and unmerged branches remain branch-local state; a
higher-level view may combine canonical state with those snapshots without
mutating canonical state.

Preferred evidence adapter:

```bash
objective tree <slug> --format json
```

Use the tree output to identify:

- branch snapshots carrying `<slug>/`
- whether the canonical record is present
- whether each branch is live or stale/orphaned
- PR number, URL, title, state, and lookup errors for each branch

Then load the relevant merged PR-backed branch snapshot files with `brmem get`
and, when PR metadata is needed to interpret the snapshot, inspect the
associated PR:

```bash
gh pr view <number-or-branch> \
  --json number,title,url,headRefName,baseRefName,state,mergedAt,commits,body
```

Use PR state as an inclusion gate:

- **merged PR**: eligible evidence for canonical rewrites.
- **open PR**: do not fold into canonical state. Leave it in the branch
  snapshot for higher-level views.
- **closed unmerged PR**: do not fold into canonical state.
- **no PR**: local-only evidence; do not fold into canonical state.
- **PR lookup error**: do not abort reconciliation; report the evidence gap.
- **orphaned branch snapshot**: do not fold into canonical state unless it is
  tied to landed work.

`reconcile` never writes to branch snapshots and never copies a branch
snapshot verbatim onto canonical state. Text from eligible landed branch
snapshots and PR metadata are evidence for a conservative rewrite, not source
content to paste wholesale.

## Common rewrite workflow

Both rewrite modes follow the same shape:

1. Confirm repository, branch, and explicit slug.
2. Confirm the target exists (`update`: branch snapshot; `reconcile`:
   canonical objective).
3. Capture old brmem commit SHAs for files that may be rewritten.
4. Load target files.
5. Collect mode-specific evidence.
6. Apply the shared conservative rewrite rules.
7. `brmem put` only files that changed. "No rewrite" — every post-snapshot
   commit is already documented — is a valid step-7 outcome.
8. Report files touched, old SHA to new SHA, evidence consulted, and recovery
   commands.

## Other operation rules

### `objective-next`

`next` writes nothing. It resolves the best source for a slug, reports status,
flags stale non-canonical branch snapshots, and suggests a next-slice slug.
It does not inspect source code to audit progress.

### `objective-current`

`current` writes nothing. It renders a current-branch stack map from
deterministic branch facts: claimed objective, PR, branch snapshot freshness,
brmem entries, downstack ancestry, and immediate upstack children. It does not
summarize objective prose or compute workstream progress.

### `objective-digest`

`digest` writes nothing. It renders an objective dossier from canonical and
branch snapshots plus deterministic git/PR facts supplied by its CLI.

### `objective-claim`

`claim` writes an exact copy of every file under `<slug>/` from a resolved
source onto a target branch. It never edits the files while attaching them.

Source resolution:

1. explicit local file or branch, if supplied
2. nearest ancestor branch snapshot carrying the slug
3. canonical objective

### `objective-create`

`create` drafts the canonical objective. It writes `body.md`, optionally
`roadmap.md`, and never writes `notes.md`.

## Anti-patterns

- Letting `update` edit canonical state.
- Letting `reconcile` write back to branch snapshots.
- Copying a branch snapshot verbatim onto canonical state.
- Incorporating open PR or unmerged branch information into canonical state.
- Letting ordinary update/reconcile runs rename sections or rebuild a
  snapshot wholesale.
- Treating a closed-unmerged PR or orphaned snapshot as authoritative on its
  own.
- Storing progress history in `Status:`.
- Repeating roadmap progress in `Description`.
- Adding manual-only or observation-only roadmap bullets.
