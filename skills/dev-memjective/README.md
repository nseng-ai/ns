# memjective

A memjective is a local planning record for work that will span multiple
branches, PRs, or sessions. Use one when you need a durable answer to:

- What is this workstream trying to finish?
- What has already landed?
- What remains to be done?
- What branch-local context should stay with in-flight work until it lands?

Memjectives are stored in `brmem`, not in GitHub issues, PR comments, or files
in the working tree. Each memjective is keyed by a slug, such as
`dashboard-revamp`, and stores a small directory of markdown files:

- `body.md`: required, stable description of the workstream.
- `roadmap.md`: optional, ordered PR-sized slices.
- `notes.md`: optional, durable findings discovered while implementing.

The full conceptual reference lives in [`SKILL.md`](./SKILL.md). This README
is the human walkthrough.

## Mental Model

There are two places a memjective can live:

- **Canonical record**: The record of the memjective that lives on trunk/master/main. It
  is the ground truth of how the objective is proceding from the point of view of the global
  system. As code lands and time progresses, a reconcilation process ensures that it is
  up-to-date with respect the code base and any relevant external state.

- **Branch snapshot**: a working copy attached to a feature branch. This represents
  the state of the memjective IF branch were the ground truth of the system. Memjectives
  can themselves evolve in branches, with changing goals, plans, and assumptions as they
  are discovered during the implementation process.

The write boundary is explicit. `update` can rewrite only the current branch
snapshot. `reconcile` can rewrite only the canonical record, and only from
landed work. Open PRs and unmerged branches stay in branch snapshots;
higher-level tooling can build a combined view across canonical state and
those snapshots. `claim` is the only operation that copies a snapshot from one
place to another, and it copies verbatim.

## Which Operation To Use

| You want to...                                | Use                        | Writes to |
| --------------------------------------------- | -------------------------- | --------- |
| Start tracking a new workstream               | `dev-memjective-create`    | Canonical |
| See status and choose the next PR-sized slice | `dev-memjective-next`      | Nothing   |
| Attach the workstream to a branch             | `dev-memjective-claim`     | Branch    |
| Refresh a snapshot before stacking on it      | `dev-memjective-update`    | Branch    |
| Refresh canonical state after PRs merge       | `dev-memjective-reconcile` | Canonical |

Full write rules live in
[`references/mutation-contract.md`](./references/mutation-contract.md).

## Normal Workflow

Assume you want to track a dashboard revamp across several branches. You do
not need to know the final memjective shape or slug before you start.

### 1. Create the canonical record on `master`

```text
Use dev-memjective-create to set up a memjective for revamping the dashboard.
The work will likely include the data layer, table interactions, and follow-up
polish across multiple PRs.
```

`dev-memjective-create` is a collaborative drafting step, not just a storage
command. The agent uses the conversation to identify the workstream title,
scope, goals, completion criteria, and whether there is already enough
structure for a PR-sized roadmap. It proposes a stable slug, such as
`dashboard-revamp`, and asks a short follow-up if the scope or slug would
otherwise be ambiguous.

Once the shape is clear, the skill seeds the shared record on `master`. It
writes `body.md` and, when there is already a concrete slice plan,
`roadmap.md`. It does not attach anything to a feature branch.

### 2. Choose the next slice

```text
dev-memjective-next dashboard-revamp
```

`next` is read-only. It inspects the canonical record and recommends the next
PR-sized slice, including a branch slug such as `dashboard-revamp/data-layer`.
This happens before `claim` so the branch you create is tied to the slice you
intend to implement.

### 3. Create a branch for that slice and claim the snapshot

```text
gt create dashboard-revamp/data-layer
dev-memjective-claim dashboard-revamp
```

`claim` attaches the memjective to the new branch by copying an existing
snapshot. For the first branch in this example, it copies the canonical
record you just created. For a later branch in a stack, it copies from the
nearest ancestor branch that already carries `dashboard-revamp`.

The copy is exact. On a newly created empty branch, no progress has been made
yet toward the workstream, so there is nothing to summarize or merge. If the
target branch already has `dashboard-revamp/`, `claim` aborts instead of
merging.

### 4. Implement and merge the slice

Write code, land commits, open and merge a PR. For this simple path, do not
run `dev-memjective-update`: no later branch needs to inherit progress from
this branch snapshot.

### 5. Reconcile canonical state on `master`

```text
dev-memjective-reconcile dashboard-revamp
```

`reconcile` reads branch snapshots and their associated PR state, then folds
only landed evidence into canonical `body.md`, `roadmap.md`, and `notes.md`.
In normal PR-backed work, that means branches whose PRs are merged. Open PRs,
closed-unmerged PRs, no-PR branches, and orphaned snapshots are not folded
into canonical state.

Reconciliation never writes branch snapshots, and it never pastes a branch
snapshot verbatim into canonical state.

Repeat steps 2-5 for the next non-stacked slice.

## Stacked Branches

Use `dev-memjective-update` only when another branch will claim from the
current branch before the current branch lands. That is the stacked-PR case:
the branch snapshot needs to reflect committed work so the child branch starts
from the right memjective state.

## Rules Worth Remembering

- Always name the slug explicitly. A branch can carry multiple memjectives.
- `claim` copies exactly one source snapshot and does not edit while copying.
- `update` is for stacked branch snapshots. `reconcile` is for `master`.
- Branch snapshots are branch-local state, not shared truth.
- Canonical state incorporates landed work, not open PRs or unmerged branches.

## See also

- [`SKILL.md`](./SKILL.md): full conceptual reference, including storage,
  document anatomy, lifecycle, and failure modes.
- [`references/mutation-contract.md`](./references/mutation-contract.md):
  single source of truth for what each operation may touch.
- Operation skills:
  [`dev-memjective-create`](../dev-memjective-create/),
  [`dev-memjective-claim`](../dev-memjective-claim/),
  [`dev-memjective-next`](../dev-memjective-next/),
  [`dev-memjective-update`](../dev-memjective-update/), and
  [`dev-memjective-reconcile`](../dev-memjective-reconcile/).
