---
name: dev-memjective-reconcile
description: Command
allowed-tools:
  - "Bash(git rev-parse *)"
  - "Bash(git for-each-ref *)"
  - "Bash(git ls-tree *)"
  - "Bash(git log *)"
  - "Bash(brmem check *)"
  - "Bash(brmem get *)"
  - "Bash(brmem list *)"
  - "Bash(brmem put *)"
  - "Read"
metadata:
  internal: true
---

<!-- INTERNAL SKILL: twerk-only. Local-first memjective subsystem on top of brmem. -->

# dev-memjective-reconcile

Master-snapshot rewrite primitive for the memjective subsystem.
`reconcile` runs **only on master** and folds evidence from sibling-branch
snapshots — other refs under `refs/brmem/ns/memjectives/*` carrying the
same slug — into a conservative rewrite of the master-branch snapshot.

> For shared concepts — vocabulary (`snapshot`, `master-branch snapshot`,
> `per-branch snapshot`), the storage model, the document anatomy, the
> lifecycle, and the per-operation mutation contract — see
> `../dev-memjective/SKILL.md` and
> `../dev-memjective/references/mutation-contract.md`. This skill does not
> redefine those concepts; it documents the workflow that implements
> `reconcile`'s row of the mutation contract.

## Goal

On master, enumerate sibling-branch snapshots carrying `<slug>/`, read
each sibling's `body.md` / `roadmap.md` / `notes.md` as evidence, and
rewrite the master-branch snapshot's same files conservatively per the
per-file mutation contract. Report the per-file old → new SHAs on master
plus the per-sibling evidence consulted.

`reconcile` is the **only** rewrite path for the master-branch snapshot.
Initial master writes go through `dev-memjective-create`; slice-branch
rewrites go through `dev-memjective-update`. `reconcile` never carries
forward verbatim and never writes to a sibling ref.

## Arguments

`reconcile` requires the **memjective slug** as an explicit positional
argument, parsed from the invoking prompt (e.g., _"run dev-memjective-reconcile
for `widget-rewrite`"_). The slug is always explicit — many-to-many is
allowed in the storage model, so master can carry multiple distinct
slugs, and `reconcile` does not auto-pick.

If the invoking prompt does not contain a slug, abort and ask the user
which memjective to reconcile.

## Core rules

- **Master only.** `reconcile` aborts off master with a pointer to
  `dev-memjective-update`. Slice-branch rewrites use the branch's own
  commit log and live in a separate skill.
- **Sibling snapshots are read-only evidence.** `reconcile` reads
  sibling files to ground its rewrite; it never writes back to any
  sibling ref.
- **Rewrite obeys the per-file mutation contract.** Sibling evidence
  informs _which_ roadmap items to check, _what_ durable findings to
  append to `notes.md`, and _whether_ a completion criterion in
  `body.md` has landed — it does not unlock wholesale regeneration.
  See `../dev-memjective/references/mutation-contract.md`
  ("Rules for `dev-memjective-reconcile`") for the full contract.
- **Enumeration is in-repo only.** `git for-each-ref
  refs/brmem/ns/memjectives/` plus local `brmem` reads. No `gh`, no
  `git fetch`, no network dependency.
- **Orphaned refs are valid evidence but labeled.** A ref whose branch
  is deleted still holds a readable snapshot. Treat its content as
  evidence; label it `orphaned-ref` in the report; prefer corroboration
  from a live sibling or a merged PR before acting on its signal alone.
- **Verbatim copy is forbidden.** Carry-forward (single-source exact
  copy) is `dev-memjective-claim`'s job, not `reconcile`'s. The
  reconcile fuses evidence across siblings into a conservative
  rewrite — never a copy.
- **No freshness check / no no-op-when-in-sync short-circuit.**
  Sibling snapshot changes do not bump master's HEAD, so the
  freshness shortcut that `update` uses does not apply.
  `reconcile` always does the work.

## Workflow

### 1. Pre-flight: confirm repo + abort if not on master

```bash
git rev-parse --show-toplevel
git rev-parse --abbrev-ref HEAD
```

Call the current branch `<branch>`. Abort if:

- not in a git repo,
- the current branch is detached (`HEAD`),
- the invoking prompt did not name a memjective slug (see **Arguments**).

If `<branch>` is **not** `master`, abort with exit code 1 and print:

> `dev-memjective-reconcile` runs on master only. Use
> `dev-memjective-update <slug>` to record progress on a slice branch.

Slice-branch rewrites use the branch's own commit log as evidence and
live in a separate skill. Do not proceed past this guard off master.

### 2. Pre-flight: master snapshot for `<slug>` must exist

```bash
brmem check <slug>/body.md --namespace memjectives --branch master
```

If the master snapshot lacks `<slug>/body.md`, abort with exit code 1
and point the user at `dev-memjective-create`:

> No master snapshot for `<slug>`. Run `dev-memjective-create` to seed
> it before reconciling.

`reconcile` rewrites an existing master snapshot; it does not seed
one. The initial draft is always `create`'s job.

### 3. Capture master's prior file commits and load the active files

Capture the current commit of each existing file under `<slug>/` on
master for the report:

```bash
brmem check <slug>/body.md --namespace memjectives --branch master
brmem check <slug>/roadmap.md --namespace memjectives --branch master   # if present
brmem check <slug>/notes.md --namespace memjectives --branch master     # if present
```

Then load each present file:

```bash
brmem get <slug>/body.md --namespace memjectives --branch master \
  > /tmp/<slug>-master-body.md
brmem get <slug>/roadmap.md --namespace memjectives --branch master \
  > /tmp/<slug>-master-roadmap.md   # if present
brmem get <slug>/notes.md --namespace memjectives --branch master \
  > /tmp/<slug>-master-notes.md     # if present
```

### 4. Enumerate sibling-branch snapshots

```bash
git for-each-ref --format='%(refname)' refs/brmem/ns/memjectives/
```

For each ref, extract `<encoded-branch>` (the trailing path segment)
and decode `---` → `/`. Then:

- **Drop the `master` entry** — that is the target, not a sibling.
- For each remaining ref, run `git ls-tree -r <refname>` and keep only
  refs whose tree contains paths starting with `<slug>/`. Drop refs
  that do not carry the requested slug.
- Label the survivors:
  - **`live`** if the branch still exists:
    ```bash
    git rev-parse --verify --quiet refs/heads/<sibling>
    ```
  - **`orphaned-ref`** if the branch has been deleted but the snapshot
    ref remains.

### 5. Read each sibling's files as evidence

For each surviving sibling, read every present file under `<slug>/`
using `brmem get` (read-only — no `gh`, no `git fetch`, purely
in-repo):

```bash
brmem get <slug>/body.md --namespace memjectives --branch <sibling> \
  > /tmp/<slug>-<sibling>-body.md
brmem get <slug>/roadmap.md --namespace memjectives --branch <sibling> \
  > /tmp/<slug>-<sibling>-roadmap.md   # if present
brmem get <slug>/notes.md --namespace memjectives --branch <sibling> \
  > /tmp/<slug>-<sibling>-notes.md     # if present
```

Also record per-file metadata for the report:

```bash
brmem check <slug>/<file> --namespace memjectives --branch <sibling> --format json
```

Extract `.data.head_sha` and `.data.head_date`. Take the **maximum**
`head_date` across each sibling's present files as that sibling's
freshness stamp.

### 6. Rewrite master conservatively, per file

Apply the per-file mutation contract from
`../dev-memjective/references/mutation-contract.md`. Sibling evidence
is the grounding; the per-file rules are the same as `update`'s. For
checkbox flips in `body.md`'s Completion Criteria and `roadmap.md`,
prefer signals corroborated by more than one sibling when available,
and treat orphaned-ref-only signals as weaker than live-sibling
signals.

**`body.md`** — the stable spine; touch sparingly:

- Preserve the title unless the user explicitly asked to rename it.
- Update `Status` if sibling evidence supports a categorical move
  (`in progress` → `done`, etc.).
- Mark completed `Completion Criteria` items and keep them visible.
- Update `Description` or `Goals` only for small clarifications
  grounded in sibling text.
- Update `How to Make Progress` only when sibling notes show the
  recipe genuinely changed.

**`roadmap.md`** — where most of the motion happens:

- Check items completed across siblings.
- Split a roadmap entry when sibling evidence shows the work landed in
  more granular pieces than originally planned.
- Append nearby follow-ups discovered during slice work (visible in
  sibling `roadmap.md` or `notes.md`).
- Never delete history — keep completed items visible.
- Never add manual-only or observation-only bullets (e.g., "live
  testing session", "manual smoke-test").

**`notes.md`** — append-only with obsolete annotations:

- Append durable findings observed in sibling `notes.md` that are not
  yet on master.
- Annotate obsolete notes in place (e.g.,
  `~~…~~ — superseded by slice 3`) rather than deleting them.
- Create `notes.md` for the first time when sibling evidence shows a
  durable finding worth recording and master had no notes file before.

**Verbatim copy is forbidden.** Sibling text is evidence, not source.
The reconcile fuses evidence across siblings into a conservative
rewrite. Single-source exact copy is `dev-memjective-claim`'s job.

### 7. Persist the updated files

Write each file that you changed to a temp file, then store it back to
the master-branch snapshot:

```bash
brmem put <slug>/body.md --namespace memjectives --branch master --file <temp-body>
# If roadmap.md changed:
brmem put <slug>/roadmap.md --namespace memjectives --branch master --file <temp-roadmap>
# If notes.md changed (including a first-time append):
brmem put <slug>/notes.md --namespace memjectives --branch master --file <temp-notes>
```

Capture the new commit SHAs. Skip `brmem put` for any file that did
not change in this session.

### 8. Report

Summarize:

- memjective slug
- target — `master`.
- files touched on master (`body.md`, `roadmap.md`, `notes.md`) and a
  one-line note for each — e.g., "body.md: 2 criteria checked from
  sibling evidence", "roadmap.md: Slice 2 items checked",
  "notes.md: appended threading gotcha".
- per-file old commit SHA → new commit SHA on master.
- **Sibling evidence consulted** — for each sibling (in newest-first
  order by max `head_date`), report:
  - `<sibling>` — liveness (`live` / `orphaned-ref`),
  - newest `head_date`,
  - per-file verdict (`same` / `modified` / `sibling-only`),
  - one-line contribution (e.g., "checked Slice 1 items 1–3 in
    roadmap", "notes: threading gotcha carried forward").
- recovery hint:

```text
Recover a prior master file with:
brmem get <slug>/<file> --namespace memjectives --branch master --at <old-sha>
```

## Edge cases

- **Off master** → abort with the off-master pointer (§1). Use
  `dev-memjective-update <slug>` on a slice branch instead.
- **No master snapshot for the slug** → abort (§2) and direct the
  user at `dev-memjective-create`.
- **No sibling snapshots carry the slug** → there is nothing to fold
  in. Report this and exit without writing — there is no evidence to
  ground a conservative rewrite. (This is not the same as
  `update`'s no-op-when-in-sync; it is "no evidence available".)
- **Sibling ref exists but its branch has been deleted** → treat the
  ref as valid evidence; label it `orphaned-ref` in the report.
  Prefer corroboration from a live sibling or a merged PR before
  acting on its signal alone.
- **Master also carries other slugs** → fine. Many-to-many is allowed;
  `reconcile` operates on the explicit slug only.
- **Sibling text contradicts master without clear corroboration** →
  prefer the conservative move (do not check off, do not delete) and
  surface the conflict in the report so the user can resolve it
  directly.

## Anti-patterns

- **Running `reconcile` off master.** Slice-branch rewrites go through
  `dev-memjective-update`. `reconcile` aborts off master on purpose.
- **Copying a sibling snapshot verbatim onto master.** Verbatim
  carry-forward is `dev-memjective-claim`'s job; sibling text is
  evidence, not source.
- **Writing back to a sibling ref.** `reconcile` only writes to
  master.
- **Pulling sibling text by way of `git fetch` or `gh`.** Enumeration
  is in-repo only — siblings are local refs under
  `refs/brmem/ns/memjectives/`.
- **Treating an orphaned-ref's signal as authoritative on its own.**
  Always prefer corroboration from a live sibling or a merged PR
  before acting on it.
- **Regenerating master files from scratch from sibling evidence.**
  The rewrite is conservative — small clarifications, status moves,
  checkbox flips, appended notes. Never wholesale regeneration.
- **Renaming sections or restructuring files** during a `reconcile`
  run. Section names are stable.
- **Skipping the off-master abort** to "just reconcile real quick on a
  slice branch." Use `update` on a slice branch.
- **Adding a freshness check** to short-circuit master writes. Sibling
  snapshot changes do not bump master's HEAD, so the freshness
  shortcut does not apply.
