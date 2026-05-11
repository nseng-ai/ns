# Objective Checkpoint Journal Model

## Status

Design proposal. Pre-release software — no backwards compatibility is required, and no data migration will be performed. Existing on-disk objective state may be left in place and ignored; new code paths replace old ones without translation.

## Summary

Replace per-branch snapshot rewrites of objective markdown with a per-branch append-only journal of checkpoint entries. The branch's objective context becomes a pure function of canonical files plus the branch's copied and locally authored checkpoint journal. Reconcile reads unconsumed checkpoint entries from merged branches and applies semantic updates to canonical.

This shifts objectives from a snapshot-rewrite model (each `objective update` mutates branch-local copies of `body.md` / `roadmap.md` / `notes.md`) to an event-sourcing-lite model where branches contribute journal evidence and canonical absorbs that evidence at reconcile time.

The user-facing branch operation is renamed from `objective update` to `objective checkpoint`:

```text
objective checkpoint [<slug>]
```

A checkpoint reviews newly uncovered commits on the current branch and appends at most one checkpoint entry covering all commits reviewed in that invocation. If there are no uncovered commits, it writes nothing.

## Motivation

The current model has three problems worth fixing:

1. **Snapshot rewrites lose information.** Each `objective update` invocation replaces branch markdown with a new version. The trail of changes — what was rewritten, why, in response to which commit — is not preserved beyond the git history of the brmem ref. Reconstructing "how did this branch's view of the objective evolve?" is impractical.

2. **Reconcile is semantically expensive.** Today's reconcile is an agent that semantically diffs branch markdown against canonical markdown. It works, but the input is opinion-laden prose rather than a structured change stream. Each reconcile call rebuilds context from scratch.

3. **Two writers per file, mutation-contract overhead.** Today both `update` (branch scope) and `reconcile` (canonical scope) write `body.md` / `roadmap.md` / `notes.md`. The `mutation-contract.md` exists to constrain how each writer is allowed to mutate, which is necessary precisely because there are two writers competing for the same surface.

The checkpoint journal model addresses all three: every branch-side change is durable evidence with attribution, reconcile reads structured input, and canonical objective files have one normal progress writer (`reconcile`).

## First principles

### Branch context is a function, not a snapshot

In the current model, "what does branch X think about objective Y?" is answered by reading branch X's snapshot files. Those files diverge from canonical over time and are mutated in place.

In the checkpoint journal model, branch X's view of objective Y is computed from canonical prose plus journal entries present on the branch:

```text
view(branch=X, slug=Y) = render(
    canonical_files(slug=Y),
    journal_entries(branch=X, slug=Y)
)
```

Branches do not own rewritten copies of `body.md`, `roadmap.md`, or `notes.md`. They own an append-only log under `<slug>/journal/`. Stack carry-forward is physical journal copying: entries copied from an ancestor branch are present in the child branch's journal and are rendered the same way as locally authored entries.

### Checkpoints are interpretive and coverage-bearing

A checkpoint entry is deliberate prose, written by an agent or human to record interpretation: "this branch committed to JWT," "this refactor has no objective-level impact," or "lesson learned: cache invalidation belongs in the gateway." It is not a re-encoding of commit messages — those already exist in git.

Each successful checkpoint invocation with newly uncovered commits writes one checkpoint entry that covers all commits reviewed by that run. The entry may contain durable objective-changing prose, or it may explicitly record that the reviewed commits had no objective-level impact. Either way, the covered commits should not be reported as uncovered on future runs.

### Reconcile is the only progress writer of canonical files

Each canonical progress file has one normal progress writer:

- `body.md` — created by `objective create`, then semantically rewritten by `objective reconcile`.
- `roadmap.md` — created by `objective create`, then semantically rewritten by `objective reconcile`.
- `notes.md` — appended to by `objective reconcile` when merged branch checkpoints contain durable lessons worth distilling.

Branches never write canonical `body.md`, `roadmap.md`, or `notes.md`. Reconcile never reads branch markdown snapshots because there are none in the new model.

### Reconcile is explicitly idempotent

Reconcile must be safe to rerun. It consumes checkpoint journal entries by stable entry ID and records consumed IDs in a canonical machine ledger:

```text
<slug>/.journal-consumed.jsonl
```

`reconcile-plan` excludes already-consumed entry IDs. `reconcile-apply` records every checkpoint entry it reviewed, including entries that caused no canonical prose change. Copied journal entries preserve their IDs, so the same checkpoint copied through a stack is consumed once.

### Materialized views are renders, not replayed state

Any rendering of `(canonical, branch journal) -> markdown` can be cached for performance, but the cache is never authoritative. Correctness lives in canonical refs, branch journal entry refs, and the consumed-entry ledger in brmem.

The materializer is intentionally interpretive-light. It does not replay edit operations or attempt operational transformation. A default markdown render should show canonical `body.md` / `roadmap.md` / `notes.md`, followed by chronological branch checkpoint entries as contextual overlays.

## Data model

### Canonical state (trunk only)

Stored under `refs/brmem/ns/objectives/<encoded-trunk>:<key>` for open objectives or `refs/brmem/ns/objectives-closed/<encoded-trunk>:<key>` for closed.

| Key                              | Purpose                                           | Writer            | Rewrite policy                        |
| -------------------------------- | ------------------------------------------------- | ----------------- | ------------------------------------- |
| `<slug>/body.md`                 | What is this objective? Goal, success criteria.   | create, reconcile | Full semantic rewrite                 |
| `<slug>/roadmap.md`              | Numbered list of remaining work.                  | create, reconcile | Full semantic rewrite                 |
| `<slug>/notes.md`                | Curated lessons-learned, decisions, observations. | reconcile         | Append-only, when warranted           |
| `<slug>/.journal-consumed.jsonl` | Machine ledger of consumed checkpoint IDs.        | reconcile-apply   | Append-only JSONL                     |
| `<slug>/.closed`                 | Closure metadata in the closed namespace.         | close             | Written on closed trunk snapshot only |

Canonical does not store branch checkpoint entries. It stores only the canonical objective files and the consumed-entry ledger.

### Branch state (per non-trunk branch)

Stored under `refs/brmem/ns/objectives/<encoded-branch>:<key>`. The branch's storage surface is only checkpoint journal entries:

```text
<slug>/journal/journal-2026-05-10T143217Z-checkpoint-01.md
<slug>/journal/journal-2026-05-10T193045Z-checkpoint-01.md
<slug>/journal/journal-2026-05-11T091200Z-checkpoint-01.md
```

No branch `body.md`, no branch `roadmap.md`, no branch `notes.md`, no `.absorbed.jsonl`, and no branch `.closed`. Every state change on a branch is an append under `<slug>/journal/`.

A branch is considered attached to a slug when it has at least one key under `<slug>/journal/`. A branch with no journal entries can still operate on an explicit slug; its view is canonical plus an empty journal until the first checkpoint is written.

### Journal entry format

```markdown
---
id: oj_20260510T143217Z_01_a1b2c3
kind: checkpoint
timestamp: 2026-05-10T14:32:17Z
created_on_branch: feature/auth
branch_head: f00dbabe
author: claude
effect: objective-change
scopes: [roadmap, notes]
covers:
  - commit: a1b2c3d4
    patch_id: 9f8e7d6c
    subject: Add JWT auth gateway
  - commit: b2c3d4e5
    patch_id: 123abc
    subject: Rename auth tests
---

Reviewed this branch through `f00dbabe`.

The JWT gateway work resolves the cookie-auth alternative and commits the
remaining roadmap to JWT. The test rename has no objective-level implication.
```

No-objective-change checkpoint:

```markdown
---
id: oj_20260510T150000Z_01_def456
kind: checkpoint
timestamp: 2026-05-10T15:00:00Z
created_on_branch: feature/auth
branch_head: cafe1234
author: claude
effect: reviewed-no-change
scopes: []
covers:
  - commit: c3d4e5f6
    patch_id: abc789
    subject: Ruff formatting
---

Reviewed these commits. They do not change objective state.
```

**Envelope fields** (YAML frontmatter):

- `id` — required stable ID for reconcile idempotency. Copied journal entries preserve the same ID.
- `kind` — open-set string. Initial writer uses `checkpoint`; future kinds may include `decision`, `blocker`, or `session-summary` if needed. Reconcile initially consumes `kind == "checkpoint"`.
- `timestamp` — ISO 8601 UTC. Used for ordering and point-in-time queries.
- `created_on_branch` — branch where the entry was originally authored. This does not change when the entry is copied.
- `branch_head` — git SHA reviewed by the checkpoint invocation.
- `author` — `claude`, a username, or other identifier.
- `effect` — initial values: `objective-change` or `reviewed-no-change`.
- `scopes` — optional list of canonical surfaces the entry is relevant to: `body`, `roadmap`, `notes`. Empty means no canonical prose change is expected.
- `covers` — list of commits reviewed by this checkpoint. Each item records `commit`, optional `patch_id`, and optional `subject`.

**Body**: free-form markdown. It should be concise but durable. For `reviewed-no-change`, a short sentence is enough.

### Filename and key convention

```text
<slug>/journal/journal-YYYY-MM-DDTHHMMSSZ-checkpoint-NN.md
```

- The brmem key uses `<slug>/journal/` so slug discovery and prefix filtering are straightforward.
- The filename is lexically sortable by timestamp.
- `NN` is a 2-digit counter for sub-second collisions or multiple entries in one invocation.
- No slashes inside the filename.
- No leading dot for journal entries; leading-dot files remain machine-owned markers such as `.journal-consumed.jsonl` and `.closed`.
- The stable identity is the frontmatter `id`, not the filename. Copying preserves both.

## Coverage semantics

`objective checkpoint` replaces patch-marker absorption with checkpoint coverage.

`checkpoint-precheck` enumerates commits in `<trunk>..HEAD` and marks a commit covered when any checkpoint entry present on the branch has a matching coverage record:

1. Prefer `patch_id` when the commit has a non-null patch ID and a journal coverage item records the same `patch_id`.
2. Fall back to commit SHA when patch ID is unavailable.
3. Treat merge/empty commits with no patch ID as coverable by SHA only.

If every commit is covered, checkpoint is a no-op and writes no file.

If any commits are uncovered, the checkpoint skill reviews all uncovered commits and writes exactly one new `kind: checkpoint` entry covering the reviewed commits. The entry may record `effect: objective-change` or `effect: reviewed-no-change`. This avoids a useless-file explosion while still making future coverage deterministic.

Copied ancestor checkpoint entries count as coverage on child branches because they preserve `covers[]`.

## Journal copying and inheritance

The v1 carry-forward model is physical copying, not dynamic inheritance.

`objective attach` copies all keys under `<slug>/journal/` from a source branch to a target branch, preserving file content and entry IDs exactly. Source resolution follows the current attach shape:

1. explicit source branch, if supplied;
2. nearest ancestor branch carrying `<slug>/journal/` entries;
3. canonical objective, which contributes no journal entries.

When there are no source journal entries, attach does not synthesize branch markdown. A later explicit `objective checkpoint <slug>` is the implicit first branch checkpoint.

Physical copying is sufficient for the initial stacked-PR workflow because child branches receive the parent checkpoints they need for context and coverage. True dynamic inheritance is deferred. If real usage shows that copied journals drift too often, a later design may add inherited journal reads through brmem or an objective-owned parent pointer, but that is not part of v1.

## Operations

### `objective create <slug>`

Unchanged in user-facing shape. Initializes canonical files on trunk.

### `objective attach [<slug>]`

Drops body/roadmap/notes file-copying logic. A branch attaches to an objective by copying existing checkpoint journal entries under `<slug>/journal/` from the resolved source branch to the target branch. It never edits, summarizes, or rewrites entries.

When the resolved source is canonical and there are no journal entries to copy, attach may report that there was nothing to copy. The first explicit `objective checkpoint <slug>` on the branch creates the first branch-local journal entry.

### `objective checkpoint [<slug>]` (skill)

Replaces branch markdown rewrites with checkpoint journal appends. Skill workflow:

1. Run `objective exec checkpoint-precheck` to obtain:
   - canonical body/roadmap/notes content;
   - existing checkpoint journal entries on this branch for the slug;
   - branch commits in `<trunk>..HEAD`;
   - uncovered commits, computed from journal `covers[]` using patch IDs first and commit SHAs as fallback.
2. If `uncovered_commits` is empty, exit no-op and write nothing.
3. Otherwise, the agent reviews all uncovered commits.
4. The agent writes exactly one checkpoint entry via `objective exec append-checkpoint`, covering all reviewed commits. The entry uses `effect: objective-change` when it records objective-relevant interpretation and `effect: reviewed-no-change` when it only records coverage.

The old "is the branch stale?" boolean disappears. The precheck returns evidence; the skill decides what interpretation to write.

### `objective reconcile [<slugs>]` (skill)

Replaces semantic branch-markdown diffing with idempotent checkpoint consumption. Skill workflow:

1. Run `objective exec reconcile-plan` to obtain:
   - current canonical body/roadmap/notes;
   - current consumed-entry ledger;
   - per-branch checkpoint entries from merged branches, filtered by PR-merged status, kind, and consumed ID;
   - PR/commit attribution for each included branch.
2. Agent inspects unconsumed checkpoint entries and decides:
   - updated `body.md` content (full rewrite when needed);
   - updated `roadmap.md` content (full rewrite when needed);
   - optional `notes.md` append text;
   - which checkpoint entry IDs were reviewed.
3. Agent writes via `objective exec reconcile-apply` with proposed canonical files and optional `--notes-append-file`.
4. `reconcile-apply` writes canonical changes serially and appends consumed-entry records to `<slug>/.journal-consumed.jsonl` for every reviewed checkpoint ID, including no-op entries.

Consumed-ledger records use JSONL, for example:

```json
{"entry_id":"oj_20260510T143217Z_01_a1b2c3","source_branch":"feature/auth","pr":432,"consumed_at":"2026-05-11T10:00:00Z","effect":"roadmap"}
{"entry_id":"oj_20260510T150000Z_01_def456","source_branch":"feature/auth","pr":432,"consumed_at":"2026-05-11T10:00:00Z","effect":"no-op"}
```

### `objective show [<slug>]`

Renders the materialized view: canonical files plus the current branch's chronological checkpoint journal. Default branch is current. Passing `--branch <name>` renders another branch's journal context.

The render should label canonical files and branch checkpoint entries clearly; it should not pretend branch checkpoints have already been semantically replayed into canonical markdown.

### `objective exec materialize <slug> [--branch <name>] [--out <path>] [--format markdown|json]`

New exec command. Emits the materialized view for tooling.

Initial v1 supports current state only:

- Alternate branches via `--branch <name>`.
- Machine-readable output via `--format json`, returning canonical files, journal entries, and consumed-entry facts as structured data.
- Markdown output that renders canonical files plus checkpoint entries.

Point-in-time `--at` is deferred. It should not rely on `ref@{time}` unless brmem explicitly guarantees reflogs for `refs/brmem/...`. A future implementation should likely walk the brmem snapshot commit history or add a brmem historical-list API.

`objective digest` and `reconcile-plan` may call `materialize --format json` internally rather than duplicating read logic.

### `objective close <slug>` / `objective reopen <slug>`

Same user-facing shape, but the moved key set changes.

Close moves every active key for the slug from `objectives` to `objectives-closed`, including:

```text
<slug>/body.md
<slug>/roadmap.md
<slug>/notes.md
<slug>/.journal-consumed.jsonl
<slug>/journal/*
```

Then it writes trunk `<slug>/.closed` in the closed namespace.

Reopen moves closed keys back to `objectives`, omitting only `<slug>/.closed`.

Branches do not carry independent close state, but their journal entries move namespaces with the objective so closed-objective history remains inspectable.

### `objective exec next-context [<slug>]`

Reads:

- canonical body/roadmap/notes;
- current branch's checkpoint journal entries;
- uncovered commits computed from `<trunk>..HEAD` minus journal `covers[]`.

Returns canonical content, full checkpoint entries, and uncovered commits. Removes `snapshot_state`, `snapshot_state_advisory`, and patch-id staleness classification.

## What gets deleted

When the phasing below completes, the following are removed or replaced:

- `objective update` user-facing operation, replaced by `objective checkpoint`.
- `packages/asdl-objectives/src/asdl_objectives/absorbed_marker.py`.
- `packages/asdl-objectives/src/asdl_objectives/snapshot_state.py` and the `ObjectiveSnapshotState` literal.
- `ABSORBED_PATCHES_FILE` constant and related discovery wiring in `discovery.py`.
- `objective exec absorb-patches` operation and its tests.
- `objective exec update-precheck`, replaced by `objective exec checkpoint-precheck`.
- Branch body/roadmap/notes file-copying in `objective exec attach`; attach now copies `<slug>/journal/*` only.
- The conservative branch-markdown rewrite sections of `skills/objective/references/mutation-contract.md`.
- `objective-update` skill content, replaced by `objective-checkpoint` skill content.
- Branch-level patch-id staleness handling everywhere it is referenced.
- Tests for deleted branch snapshot and absorbed-marker code paths.

Existing branch snapshots in brmem refs containing `body.md` / `roadmap.md` / `notes.md` / `.absorbed.jsonl` are left as orphans. New code does not read them. They will disappear naturally as branches are deleted in the normal course of work. No migration script will be written.

## Implementation phasing

Five phases, each a coherent landable PR or short stack. Phases are dependency-ordered; each lands a coherent slice without breaking the system mid-way.

### Phase 1: Foundations

- Add brmem support for key listing within `(namespace, branch)` with a prefix filter, or add objective-local helpers that filter `list_entries(namespace, branch)` by prefix until brmem grows a direct primitive.
- Add a `journal` module to `asdl-objectives`:
  - `<slug>/journal/` key generation;
  - filename generator;
  - stable entry ID generator;
  - frontmatter parser;
  - entry struct;
  - validation rules;
  - coverage extraction by patch ID / commit SHA.
- Add a consumed-ledger module for `<slug>/.journal-consumed.jsonl` parsing and serialization.
- Add `objective exec append-checkpoint --kind checkpoint [--effect ...] [--body-file <path>]` or equivalent, with entry body via stdin or file.
- Add journal-copy helper logic for `<slug>/journal/*` preserving bytes and IDs.
- Tests: round-trip an entry, parse frontmatter, generate filenames, validate coverage matching, list entries by slug prefix, copy journal entries without changing IDs, parse/append consumed ledger records.

Lands without changing existing flows. New machinery sits idle until Phase 2 wires it up.

### Phase 2: Checkpoint flow

- Add `objective exec checkpoint-precheck` to compute uncovered commits from checkpoint journal `covers[]` rather than from `.absorbed.jsonl`.
- Drop `snapshot_state` and `snapshot_state_advisory` from precheck result; add `uncovered_commits: list[BranchCommit]`.
- Add the `objective-checkpoint` skill. The skill writes one checkpoint entry per invocation with uncovered commits; it no-ops when there are none.
- Replace or remove the old `objective-update` skill and command surface.
- Delete `absorb-patches` exec command and `absorbed_marker.py`.
- Tests: checkpoint-precheck returns correct uncovered commits; checkpoint scenario writes one journal entry covering multiple commits; reviewed-no-change entries suppress future uncovered reports.

After this phase, branch progress is recorded in checkpoint journal entries only. Existing branch markdown is no longer touched.

### Phase 3: Reconcile flow

- Rewrite `objective exec reconcile-plan` to gather unconsumed checkpoint entries from merged branches instead of branch markdown diffs.
- Filter candidate entries by stable frontmatter `id` against canonical `<slug>/.journal-consumed.jsonl`.
- Add `--notes-append-file <path>` to `objective exec reconcile-apply`.
- Extend `reconcile-apply` so it appends consumed-ledger records for every reviewed checkpoint entry ID, including no-op entries.
- Rewrite `skills/objective-reconcile/SKILL.md` to consume checkpoint entries.
- Update `skills/objective/references/mutation-contract.md`: canonical files are single-writer through reconcile; branch mutations are append-only checkpoint entries.
- Tests: reconcile-plan excludes consumed IDs; copied checkpoint IDs dedupe; reconcile-apply appends notes and consumed ledger records idempotently; semantic body/roadmap rewrites still work.

After this phase, canonical is reconciled from checkpoint entries, not from branch markdown.

### Phase 4: Reader updates and cleanup

- Update `objective exec next-context` to read canonical body/roadmap/notes plus current-branch checkpoint entries and uncovered commits.
- Update `objective show` to render the materialized view: canonical files plus branch checkpoint entries.
- Update `objective exec current` and `objective exec digest` to read the new model.
- Update `objective attach` to copy `<slug>/journal/*` only.
- Update `objective close` / `objective reopen` to move all slug keys, including journal entries and `.journal-consumed.jsonl`.
- Delete `snapshot_state.py`, `ABSORBED_PATCHES_FILE`, branch markdown reading paths in `discovery.py`, mutation-contract sections about branch-level rewrites, attach markdown copy logic, and related skill prose.
- Delete orphaned scenario tests for deleted operations.

After this phase, the old code is gone. Branches with leftover markdown files in brmem refs are unreachable from any code path; they sit as harmless ref clutter until branches are deleted.

### Phase 5: Materialize command and polish

- Add `objective exec materialize <slug>` with `--branch`, `--out`, and `--format json|markdown` for current-state materialization.
- Defer point-in-time `--at` until brmem has an explicit historical-read/listing strategy.
- Optionally wire `objective digest` and `reconcile-plan` to call `materialize` internally instead of duplicating read logic.
- Documentation pass: rewrite `skills/objective/SKILL.md` (concepts) and any other skill docs to reflect the new model. Drop references to "snapshot state," "absorbed patches," "branch markdown rewrite," and user-facing `objective update`.

Each phase is independently shippable. After Phase 2 the system records branch progress as checkpoints but some old readers may still exist. After Phase 4 the system is clean. Phase 5 adds the explicit materialization API and finishes the docs.

## Deferred questions

1. **Dynamic inheritance beyond copying.** V1 physically copies checkpoint journal entries during attach. True inherited reads may require brmem changes or an objective-owned parent pointer. Defer until real stacks prove physical copying insufficient.
2. **Point-in-time materialization.** Current-state materialization is required. `--at` is deferred because `ref@{time}` is unsafe unless brmem guarantees reflogs for its custom refs. A future design should use brmem snapshot commit history or a new historical listing API.
3. **Journal entry size envelope.** No hard limit. Sub-page prose is the norm; multi-page entries are allowed but discouraged. Soft guidance belongs in skill docs, not enforcement.
4. **Compaction.** Deferred. Real-world checkpoint counts are expected to stay in the 1–50 range per branch. If long-lived branches accumulate enough entries to make reads slow, revisit with a checkpoint compaction primitive.
5. **Concurrent checkpoint writes.** Deferred for now. Unique filenames reduce accidental collision, but brmem snapshot refs are still last-writer-wins if two writers append concurrently. Initial workflows assume one agent/operator writes a branch objective journal at a time.
