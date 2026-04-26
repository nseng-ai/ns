# memjective

Local-first planning docs for multi-session workstreams. One canonical record on `master`, zero or more branch-local snapshots that can drift while a slice is in flight.

A memjective is a directory of files (`body.md`, optional `roadmap.md`, optional `notes.md`) keyed by slug, stored in `brmem` rather than GitHub or the working tree. The full conceptual reference lives in [`SKILL.md`](./SKILL.md); this README walks an end-to-end example.

## The shape

The subsystem splits authority cleanly:

- **Canonical record** on `master` — the workstream's shared ground truth. Advanced only by `create` and `reconcile`.
- **Branch snapshot** on each working branch — a local checkpoint that can drift, accumulate notes, and serve as evidence later. Advanced only by `claim` and `update`.

Each operation mutates exactly one snapshot type (canonical XOR branch). Carry-forward between them is explicit — `claim` is the only primitive that copies a snapshot from one place to another, and it never edits while copying.

Two further invariants worth knowing up front:

- **Many-to-many.** A single branch may carry multiple memjective slugs in the `memjectives` namespace. Each primitive operates per-slug.
- **Slug always explicit.** Every primitive takes the slug as a required positional argument. There is no auto-pick from "the only memjective on the branch."

## The five primitives

| Skill                      | Mutates   | Job                                             |
| -------------------------- | --------- | ----------------------------------------------- |
| `dev-memjective-create`    | canonical | Seed the canonical record on `master`           |
| `dev-memjective-claim`     | branch    | Verbatim carry-forward into a branch snapshot   |
| `dev-memjective-next`      | nothing   | Read-only status peek + next-slice suggestion   |
| `dev-memjective-update`    | branch    | Refresh branch snapshot from landed branch work |
| `dev-memjective-reconcile` | canonical | Fold branch + PR evidence into canonical state  |

Full mutation contract, including the conservative per-file rewrite rules shared by `update` and `reconcile`, lives in [`references/mutation-contract.md`](./references/mutation-contract.md).

## Example workflow

A worked example: a workstream to revamp a dashboard. The slug is `dashboard-revamp`. We'll cut several PR-sized slices over multiple sessions.

### Step 0 — On `master`, draft the canonical record

```text
dev-memjective-create dashboard-revamp
```

`create` runs only against canonical storage. It writes `<slug>/body.md` (always) and `<slug>/roadmap.md` (only when the conversation already contains a concrete slice plan). It never attaches the snapshot to the current branch and never writes `notes.md`. Aborts if `dashboard-revamp/` already exists on `master`.

After this step, canonical state exists. No branch yet carries a snapshot.

### Step 1 — Cut a working branch and claim the snapshot

```text
gt create dashboard-data-layer
dev-memjective-claim dashboard-revamp
```

`claim` resolves a source (in this case canonical, since no ancestor branch carries the slug) and `brmem copy`s the entire `dashboard-revamp/` directory verbatim onto the new branch. No edits, no synthesis. Aborts if the target branch already carries this slug.

The branch now has its own working copy. It and canonical are byte-identical at this moment.

### Step 2 — Inspect and pick the next slice

```text
dev-memjective-next dashboard-revamp
```

`next` writes nothing. It loads the best matching source (current branch wins over ancestor wins over canonical), summarizes title/status/roadmap, flags stale branch snapshots, and proposes a kebab-case slug for the next PR-sized slice. Skip it if you already know what to do.

### Step 3 — Implement and ship the slice

Write code, land commits, open and merge a PR. Memjective tooling is not in the loop here.

### Step 4 — Refresh the branch snapshot

```text
dev-memjective-update dashboard-revamp
```

`update` reads the new commits as evidence and rewrites the branch snapshot conservatively: checks completed roadmap items, appends durable findings to `notes.md`, moves `Status:` only on a categorical change. It writes only files whose content actually changed and reports old→new brmem SHAs for recovery.

`update` aborts on `master` and points to `reconcile`. It is a no-op when the snapshot's max `head_date` is at-or-after branch HEAD's commit time.

Repeat steps 1–4 for additional slices: cut a new branch off the appropriate base, `claim` the snapshot (which now resolves to the nearest ancestor branch carrying it, not canonical), pick the next slice, implement, update.

### Step 5 — Inspect what's in flight

```text
twerk memjective tree dashboard-revamp
twerk memjective show dashboard-revamp
```

The introspection CLI surfaces every branch carrying the slug along with its PR state. Useful before reconciling, to see which branches are merged, open, closed, or orphaned.

### Step 6 — Back on `master`, reconcile

```text
dev-memjective-reconcile dashboard-revamp
```

`reconcile` runs only on `master`. It enumerates branch snapshots carrying the slug (typically via `memjective tree --format json`), looks up each branch's PR for state/metadata, and folds that evidence into canonical `body.md` / `roadmap.md` / `notes.md` using the same conservative rewrite rules `update` uses.

Evidence is weighted: merged PRs are strongest; open PRs are useful for in-flight findings but weaker for canonical completion; closed-unmerged and orphaned-snapshot evidence are weak and labeled. Branch snapshots are never written to, and a branch snapshot is never pasted verbatim into canonical state.

Canonical now reflects what landed across the workstream. Branch snapshots remain untouched as historical evidence.

## Introspection CLI

Three read-only commands surfaced under `twerk memjective`:

- `twerk memjective list [--branch <name>|--here]` — list snapshots on a branch or across the repo
- `twerk memjective show [<slug>]` — render a present-state summary for a slug
- `twerk memjective tree [<slug>]` — show every branch carrying the slug, grouped by PR state

All mutation is skill-driven; the CLI is for inspection only.

## See also

- [`SKILL.md`](./SKILL.md) — full conceptual reference (storage refs, document anatomy, lifecycle, failure modes)
- [`references/mutation-contract.md`](./references/mutation-contract.md) — single source of truth for what each operation may touch and the shared conservative rewrite rules
- The five operation skills under [`../dev-memjective-create/`](../dev-memjective-create/), [`../dev-memjective-claim/`](../dev-memjective-claim/), [`../dev-memjective-next/`](../dev-memjective-next/), [`../dev-memjective-update/`](../dev-memjective-update/), [`../dev-memjective-reconcile/`](../dev-memjective-reconcile/)
