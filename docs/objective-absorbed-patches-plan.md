# Objective Freshness With `.absorbed.jsonl`

## Purpose

Make objective snapshot freshness deterministic and consistent across
`objective tree`, `objective current`, and `objective-update`.

The current implementation has two related problems:

- `objective tree` and `objective exec update-precheck` each implement their
  own version of freshness.
- A branch with unmerged work remains structurally stale even after
  `objective-update` has confirmed that the branch snapshot covers that work.

The target design is a single freshness definition backed by one classifier.
`objective-update` becomes the operation that records branch work as absorbed
by the branch snapshot.

## Freshness Definition

A live branch snapshot is fresh when every content patch in `trunk..branch` is
absorbed by the objective snapshot.

Absorption is the union of two deterministic sources:

1. **Downstack absorption:** patch IDs already present in strict downstack
   ancestors, computed from Graphite stack state.
2. **Snapshot absorption:** patch IDs recorded in the branch snapshot's
   `<slug>/.absorbed.jsonl` file.

In code terms:

```text
fresh =
  every content patch-id in trunk..branch
  is in (downstack_absorbed_patch_ids union snapshot_absorbed_patch_ids)
```

Deleted branches keep the existing behavior: they are considered fresh for
display purposes because their history can no longer drift. UI code may still
render them as `deleted`.

## Snapshot Marker

`objective-update` writes a machine-owned marker file inside the objective
snapshot:

```text
<slug>/.absorbed.jsonl
```

Each line is one JSON object describing one commit in the current
`trunk..HEAD` range at the time the update operation confirmed the snapshot.

Example:

```jsonl
{"schema":1,"sha":"be31ff09d1ec97c7ff164a3d91a1747458f533ba","patch_id":"9dbe18d121d76ae8054735f69f538b009efa0e8b","author_iso":"2026-04-27T13:36:05-04:00","subject":"[cp] Slice 1: git-backed slot inventory and port slot list"}
```

Use JSONL rather than a JSON array because it is easy to parse, stable in
diffs, and naturally append-like. The file should be treated as generated
state. Humans may read it, but should not hand-edit it.

## Record Schema

Required fields:

- `schema`: integer schema version. Start at `1`.
- `sha`: commit SHA observed when the marker was written.
- `patch_id`: stable `git patch-id` for the commit, or `null` when no content
  patch ID exists.
- `author_iso`: commit author timestamp from `%aI`.
- `subject`: commit subject.

Only `patch_id` participates in normal freshness classification. `sha`,
`author_iso`, and `subject` are diagnostic fields for audit output, debugging,
and future digest rendering.

## Null Patch IDs

Commits with `patch_id == null` should not keep a branch stale forever.

Recommended rule:

- Freshness is defined over content patches.
- `null` patch IDs are recorded for diagnostics but ignored by the classifier.

This covers merge commits, empty commits, and whitespace-only or otherwise
non-content-changing commits without inventing an unstable SHA-based freshness
rule. If a future workflow needs exact tracking of null-patch commits, add a
separate explicit field and tests at that time.

## Writer Contract

Do not make the LLM or skill hand-author `.absorbed.jsonl`. Add a deterministic
hidden exec command that writes it from git facts.

Proposed command:

```bash
objective exec absorb-patches <slug> --expected-head <sha> --format json
```

Responsibilities:

- Resolve the current branch and reject detached `HEAD`.
- Reject `master`; `objective-update` only mutates branch snapshots.
- Validate that `<slug>/body.md` exists on the current branch snapshot.
- Verify current `HEAD` equals `--expected-head`.
- Enumerate `trunk..HEAD` commits in stable order, oldest first.
- Compute patch IDs with the existing git gateway.
- Write `<slug>/.absorbed.jsonl` through `brmem put`.
- Return the old and new brmem commit SHAs for reporting.

The `--expected-head` guard prevents this failure mode:

1. `objective-update` prechecks and triages commits A and B.
2. Another commit C lands before the marker is written.
3. The marker accidentally records A, B, and C as absorbed even though C was
   not reviewed.

When the guard fails, update should stop and ask the user to rerun it.

## Read Contract

Add a parser for `<slug>/.absorbed.jsonl` that returns:

- parsed patch IDs, excluding `null`
- malformed-line diagnostics
- optional record metadata for future audit output

Malformed marker files should not be silently trusted. Recommended behavior:

- If the file is absent, snapshot absorption is the empty set.
- If the file is malformed, freshness should be `stale` or `unknown`, not
  `fresh`.

If the current UI must remain binary, use `stale` for malformed or unreadable
marker state. A later change can introduce an explicit `unknown` UI state if
that proves useful.

## Single Source Of Truth

Centralize freshness in `twerk_objectives.freshness`.

Target public surface:

```python
def classify_obj_state(
    *,
    alive: bool,
    branch_commit_pids: tuple[str | None, ...] | None,
    absorbed_pids: frozenset[str] | None,
) -> ObjectiveSnapshotState:
    ...
```

or a slightly richer input object if diagnostics are needed.

`absorbed_pids` should already include both sources:

```text
downstack_absorbed_patch_ids union snapshot_absorbed_patch_ids
```

Callers should not duplicate the rule.

Update these call sites:

- `objective tree`
- `objective current`
- `objective exec update-precheck`

`update-precheck` should report freshness from the shared classifier instead of
computing `in_sync` inline.

## Date Fallback

Remove or demote the date-based freshness fallback.

Once `.absorbed.jsonl` exists, timestamp comparison becomes actively
misleading:

- A no-op `objective-update` may touch only `.absorbed.jsonl`, not `body.md`.
- Rebases can preserve author time while changing branch shape.
- Imported or amended commits can make time ordering fail to represent
  content coverage.

Recommended behavior:

- Prefer patch-id classification.
- If patch-id inputs cannot be computed, return `stale` for the binary UI.
- Keep timestamps only as diagnostics in JSON output.

## `objective-update` Workflow

Revise the skill and CLI support so update has two durable effects:

1. Conservatively rewrite objective content files when branch work is not yet
   documented.
2. Record the current branch content patches in `.absorbed.jsonl` after the
   content is confirmed covered.

Detailed flow:

1. Run `objective exec update-precheck <slug> --format json`.
2. Capture `branch_head_sha` from precheck output.
3. If shared freshness is already `fresh`, report no update needed.
4. Load present snapshot files.
5. Triage branch commits against snapshot content.
6. Rewrite `body.md`, `roadmap.md`, or `notes.md` only when content changes are
   needed.
7. Persist changed content files with `brmem put`.
8. Run `objective exec absorb-patches <slug> --expected-head <branch_head_sha>
   --format json`.
9. Report both content-file changes and marker-file changes.

Important semantic point:

- "Snapshot content needs rewriting" and "snapshot freshness marker needs
  advancing" are separate decisions.
- If content already documents the commits, update should still write or
  refresh `.absorbed.jsonl` so `tree` and `current` become fresh.

## `update-precheck` Output Changes

Add fields:

- `branch_head_sha`: current `HEAD` at precheck time.
- `snapshot_absorbed_patch_ids`: patch IDs parsed from `.absorbed.jsonl`.
- `absorbed_patch_ids`: the union used by the classifier, or rename to
  `effective_absorbed_patch_ids`.
- `freshness`: `fresh` or `stale`.

Consider deprecating `in_sync` after callers move to `freshness`. If kept for
compatibility, define it as `freshness == "fresh"` and compute it from the
shared classifier.

## Carry-Forward Semantics

`objective-claim` copies branch snapshots verbatim. That means
`.absorbed.jsonl` may be copied from an ancestor into a child branch.

This is acceptable because the marker is patch-id based:

- Patches inherited from the source snapshot remain absorbed.
- New child-branch patches are absent from the copied marker and make the
  child stale until update runs.

The classifier should always compare the marker against the current branch's
own `trunk..branch` patch IDs, not against the marker's recorded SHAs.

## Reconciliation Semantics

`objective-reconcile` reads branch snapshots as evidence but does not write
back to them. It should ignore `.absorbed.jsonl` for prose reconciliation
unless a future digest view wants to show freshness diagnostics.

Canonical objective state on `master` does not need `.absorbed.jsonl`.

## Implementation Steps

1. Add constants for the marker filename, likely in
   `twerk_objectives.discovery`:

   ```python
   ABSORBED_PATCHES_FILE = ".absorbed.jsonl"
   ```

2. Add marker model and parser, likely in a new public module such as
   `twerk_objectives.absorbed_marker`.

3. Extend freshness gathering so `classify_branch_snapshot` reads
   `<slug>/.absorbed.jsonl`, unions it with downstack absorption, and calls one
   classifier.

4. Refactor `objective exec update-precheck` to call the shared classifier
   and include `branch_head_sha` plus marker diagnostics in JSON output.

5. Add `objective exec absorb-patches` under the hidden `exec` group.

6. Update `skills/objective-update/SKILL.md` so the skill always advances the
   marker after successful evidence triage, even when no Markdown files change.

7. Update the objective conceptual docs to mention `.absorbed.jsonl` as a
   machine-owned branch snapshot metadata file.

8. Update scenario and unit tests.

## Test Plan

Unit tests:

- Parser accepts valid JSONL records.
- Parser ignores blank lines if desired, or rejects them explicitly.
- Parser rejects malformed JSON and returns a diagnostic.
- Parser extracts only non-null patch IDs for classification.
- Classifier returns fresh when all branch content patch IDs are in the union.
- Classifier returns stale when any content patch ID is missing.
- Classifier ignores `None` branch patch IDs if adopting the content-only rule.

Scenario tests:

- `objective tree` reports stale before `.absorbed.jsonl` is written.
- `objective exec absorb-patches` writes `.absorbed.jsonl`.
- `objective tree` reports fresh after marker write.
- A new commit after marker write makes the branch stale again.
- Rebase with preserved patch IDs remains fresh.
- Copied marker through `objective-claim` keeps inherited patches fresh and
  leaves new child patches stale.
- `objective-update` writes `.absorbed.jsonl` on a no-op content update.
- `objective-update` refuses to write the marker when `HEAD` differs from
  `branch_head_sha`.
- Malformed `.absorbed.jsonl` does not produce a fresh state.

Regression tests:

- `objective exec update-precheck` and `objective tree` agree on freshness for
  the same branch.
- Existing downstack absorption behavior still works when `.absorbed.jsonl` is
  absent.

## Migration Behavior

Existing snapshots will not have `.absorbed.jsonl`.

Default behavior:

- Missing marker means empty snapshot absorption.
- Branches with unmerged work may show stale until `objective-update` runs.
- Running `objective-update` on a branch with already documented work should
  write `.absorbed.jsonl` and make the snapshot fresh.

No one-time migration is required.

## Implementation Decisions

The first implementation made these calls:

- Keep the public UI binary for now. Malformed markers and unavailable
  patch-id facts classify live branches as `stale`.
- Allow blank lines in `.absorbed.jsonl`; the parser ignores them.
- Rewrite `.absorbed.jsonl` from scratch on each successful
  `objective exec absorb-patches` run so it is a precise snapshot of the
  current `trunk..HEAD` range.
- Expose marker diagnostics through `objective exec update-precheck`; keep
  `objective current` and `objective tree` focused on the final fresh/stale
  state for now.
