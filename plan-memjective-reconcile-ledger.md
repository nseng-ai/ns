# Memjective Reconcile State Steelthread Plan

This plan intentionally does not use the memjective workflow to manage the
migration. It is a plain repo plan for changing memjectives safely.

## Progress

Snapshot of what has landed on `add-memjective-state-writes` so far (not yet
on `master`), plus PR 5 in flight on top of it as
`add-memjective-compute-pending-entries`. The plan's stack order has been
partially executed and partially reordered in practice: the read-only check
shipped first, then the tree model extraction (PR 4) and the reconcile skill
(PR 3) shipped before minimal state writes (PR 2). PR 5 is now open as
PR #256 against base `add-memjective-state-writes`; it adds
`memjective exec compute-pending-entries`, durable subtree provenance via a
new `BranchMemoryGateway.get_tree_sha`, PR merge provenance on `PRSummary`,
and a shared `EvidenceBundle` that both `memjective check` and the new
command project from. The same PR also lifts the `dev-memjective-reconcile`
skill (PR 3) onto `compute-pending-entries` per PR 5's review boundary.

- PR 1 — Steelthread Read-Only Check: **done** (`f63cc61`).
  - `memjective check <slug>` with `--format human|json`.
  - State schema v1 parser at `packages/twerk-core/src/twerk_core/memjective/state.py`.
  - Scenario tests at `tests/scenario/test_memjective_check_cli.py`; unit tests
    at `tests/unit/test_memjective_state.py`.
- PR 2 — Minimal State Writes (`memjective exec init`, `memjective exec
  record-entry`): **done** (`952ad42`).
  - New `exec` subgroup at
    `packages/twerk-core/src/twerk_core/memjective/exec_group.py`, mounted
    under `memjective/group.py`.
  - `memjective exec init <slug>` at
    `packages/twerk-core/src/twerk_core/memjective/exec_init.py` —
    idempotent; creates `memjective-state/master:<slug>/state.json` when
    absent, fails when root memjective docs are missing.
  - `memjective exec record-entry <slug>` at
    `packages/twerk-core/src/twerk_core/memjective/exec_record_entry.py` —
    accepts `--file`, `--json`, or stdin (`-`); upserts by stable `id`;
    enforces schema version, slug match, unique PR numbers, and basic
    status transitions; returns `commit_sha` and `action`
    (`created`/`updated`/`promoted`).
  - Scenario tests at
    `packages/twerk-core/tests/scenario/test_memjective_exec_cli.py`
    (~700 lines) and unit tests at
    `packages/twerk-core/tests/unit/test_memjective_exec_record_entry.py`.
- PR 3 — `dev-memjective-reconcile` Steelthread: **done** (`fb18544`,
  upgraded in `952ad42`). The skill at
  `skills/dev-memjective-reconcile/SKILL.md` consumes `memjective check`,
  performs the conservative root-doc rewrite, and now persists the
  incorporation entry via `memjective exec init` / `memjective exec
  record-entry` (no longer LM-only). Re-runs are idempotent: reconciled
  PRs gain a non-empty `matching_stored_entry_ids` and drop out of the
  candidate filter.
- PR 4 — Extract Tree Model: **done** (`1fad6f3`). `tree_model.py` and unit
  tests at `tests/unit/test_memjective_tree_model.py`. `tree.py` consumes the
  extracted model. `check.py` was implemented against this model from the
  start.
- PR 5 — Snapshot Provenance + `memjective exec compute-pending-entries`:
  **in flight** (PR #256 on `add-memjective-compute-pending-entries`, base
  `add-memjective-state-writes`, tip `ffcc45b`).
  - `BranchMemoryGateway.get_tree_sha(namespace, branch, path)` at
    `packages/twerk-core/src/twerk_core/brmem/gateway.py`, with the real
    implementation in `brmem/real.py` (resolves via
    `git rev-parse <ref>:<path>` and verifies the object type is `tree`)
    and the fake in `brmem/fake.py` (synthetic `faketree-<hex>` over sorted
    `(key, content_sha)` pairs under the prefix).
  - `PRSummary.merged_at` and `PRSummary.merge_commit_oid` at
    `packages/twerk-core/src/twerk_core/gh/types.py`, populated from the
    `gh pr view` JSON via a `_none_if_blank` helper in
    `gh/real_gateway_helpers.py`; threaded through `MemjectiveTreePr` and
    `MemjectiveTreeBranch`.
  - Shared `EvidenceBundle` and `compute_evidence` at
    `packages/twerk-core/src/twerk_core/memjective/evidence.py`, joining
    `build_memjective_tree_model`, `load_state`, and per-snapshot
    `get_tree_sha` calls. Both `memjective check` and
    `memjective exec compute-pending-entries` now project from this bundle,
    eliminating drift.
  - `memjective exec compute-pending-entries <slug>` at
    `packages/twerk-core/src/twerk_core/memjective/exec_compute_pending_entries.py`,
    mounted in `exec_group.py`. Returns `pending_entries` (merged PR + no
    matching stored entry; carries `candidate_entry` and `recommended_reads`
    with the source `tree_sha`), `blocked_entries` (closed-unmerged with
    action `decide_skip`), `ignored_entries` (open / no PR / no PR identity),
    and structured `errors` (`missing_root_memjective`, `invalid_state`,
    `pr_lookup_error`, `missing_brmem_snapshot_for_merged_pr`,
    `branch_pr_identity_conflict`).
  - `memjective check` refactored to thin `_adapt_root` / `_adapt_branch`
    adapters over `EvidenceBundle`; `CheckRoot` and `CheckSource` gain
    `tree_sha`, and `CheckPR` gains `merged_at` and `merge_commit_oid`. The
    old `_matching_stored_entry_ids` and candidate-filtering logic is gone.
  - `dev-memjective-reconcile` skill rewritten to drive off
    `memjective exec compute-pending-entries`: iterates
    `data.pending_entries`, uses subtree-level `tree_sha` for source
    provenance, and references `data.errors` by `kind` for stop conditions.
  - Tests: scenario at
    `packages/twerk-core/tests/scenario/test_memjective_exec_compute_pending_entries_cli.py`
    (~570 lines); unit at `tests/unit/test_memjective_evidence.py`; gateway
    coverage for `get_tree_sha` and the new merge-provenance fields under
    `tests/gateways/` and `tests/integration/`.
- PR 6 — Harden Incorporation Recording Semantics: **done** (this branch,
  `harden-memjective-incorporation-recording`).
  - Strict incorporation schema in `validate_entry_payload` at
    `packages/twerk-core/src/twerk_core/memjective/exec_record_entry.py`,
    via `_validate_incorporation_schema` and `_validate_provenance_block`.
    When `resolution` is `incorporated` or `incorporated_no_doc_change`,
    the writer now requires `pr.state == "MERGED"`, non-empty
    `pr.merge_commit_oid`, and `source` / `root_before` / `root_after`
    blocks each carrying non-empty `namespace`, `branch`, `path`, and
    `tree_sha`. Each rule surfaces a distinct `error_type`
    (`pr_not_merged`, `missing_merge_commit_oid`, `missing_source` /
    `missing_root_before` / `missing_root_after` and per-field variants
    like `missing_source_tree_sha`, `incorporation_requires_pr_id`).
    `EntryInvalid` gained an optional `error_type` field (default
    `"entry_invalid"`) and `run_exec_record_entry` propagates it.
  - New `_validate_incorporation_against_evidence` helper in the same
    module runs after schema validation and `load_state` for
    incorporation-shaped payloads. It calls `compute_evidence(...)` once
    and applies, in order: duplicate-merge check (state-only, never
    bypassable; `error_type="already_incorporated"`), doc-change
    invariant (`root_unchanged_for_incorporated` /
    `root_changed_for_no_doc_change`), `root_after_mismatch` against the
    current root tree, then per-branch checks (`pr_not_merged`,
    `merge_commit_oid_mismatch`, `source_tree_sha_mismatch`), and finally
    `no_pending_match` (overridden by `--force`). `--force` now bypasses
    only `resolution_regression` and `no_pending_match`; help text
    updated to spell that out.
  - New shared helper `pending_entry_ids(bundle)` in
    `packages/twerk-core/src/twerk_core/memjective/exec_compute_pending_entries.py`
    so `record-entry` and `compute-pending-entries` project the
    pending-set rule from a single source of truth.
  - `skills/dev-memjective-reconcile/SKILL.md` updated: the example
    incorporation payload now includes `pr.merge_commit_oid`; the
    "writer treats fields opaquely" paragraph is replaced with the
    hardened-contract description listing every `error_type`; the
    Status section reflects that provenance validation is now
    end-to-end and the empty Deferred bullet is removed.
  - Tests: 9 new strict-schema rejection tests in
    `packages/twerk-core/tests/unit/test_memjective_exec_record_entry.py`
    (one per rule), and 9 new evidence-cross-check scenario tests in
    `packages/twerk-core/tests/scenario/test_memjective_exec_cli.py`
    (happy path, open-PR refusal, root_after mismatch, both doc-change
    invariant violations, source tree_sha drift, merge_commit_oid
    mismatch, no-pending-match overridden by `--force`, duplicate
    incorporation never bypassable by `--force`, end-to-end via
    `compute-pending-entries → record-entry → compute-pending-entries`).
    Five existing scenario tests whose use of `incorporated` was
    incidental switched to `tracked` to keep them focused on their
    original rule.
- PRs 7–8: **not started**.

Next reviewable slice: PR 7 (Teach Existing Memjective Skills To Record
State), which threads `memjective exec init` and `record-entry` calls into
`dev-memjective-create`, `dev-memjective-next`, and `dev-memjective-update`
so normal usage feeds machine state automatically.

## Direction

The target model is **curated root docs plus root-owned machine-readable
reconciliation state**, not a fully derived memjective.

- `brmem` remains the episodic store: branch-local, high-fidelity, cheap to
  write, and allowed to contain messy session context.
- Root memjective docs remain curated semantic state: current workstream truth,
  durable decisions, roadmap, constraints, and completion criteria.
- Root-owned machine state tracks coverage and provenance: which branch/PR
  entries exist, which merged PRs have been incorporated, and which root
  snapshot mutation incorporated them.
- Reconcile is idempotent. Forgetting to run it delays consolidation but does
  not lose the ability to converge later.

The internal analogy is a ledger or log, but the user-facing CLI should mostly
call this "state" or "machine-readable reconciliation state."

Core invariant:

> Every merged PR associated with a memjective has exactly one root
> incorporation entry, and that entry points to the PR facts, source snapshot,
> and root memjective snapshot mutation that incorporated it.

## Steelthread Bias

Ship the first useful behavior before extracting every substrate.

The earliest reviewable slice should let a user answer:

- Which merged PRs for this memjective still need to be incorporated?
- Which closed PRs need a skip decision?
- Which open/local branches are visible but not eligible for root promotion?
- Is there already recorded incorporation state?

That means the first PR should expose `memjective check <slug>` with read-only
diagnostics, even if some internals are intentionally modest. Once the
user-facing loop exists, later PRs can extract the tree model, strengthen
provenance, add lower-level computation commands, and tighten recording
invariants without delaying the first observable value.

## Storage Decision

Use a separate brmem namespace for the machine-readable reconciliation state:

```text
namespace: memjective-state
branch: master
key: <slug>/state.json
```

Do not store the authoritative state as `memjectives/<slug>/state.json` yet.
The current carry-forward contract copies `memjectives/<slug>/*` onto slice
branches, so putting root-owned state there would either create stale branch
copies or require changing carry-forward semantics first. A separate namespace
keeps the authority boundary clean.

Root docs stay where they are:

```text
namespace: memjectives
branch: master
path: <slug>
```

The durable state should not hard-code today's root document filenames
(`body.md`, `roadmap.md`, `notes.md`). Store snapshot-level provenance instead:
`namespace`, `branch`, `path`, and `tree_sha`. `path` is the memjective slug
directory, and `tree_sha` is the Git tree object resolved at
`refs/brmem/ns/<namespace>/<encoded-branch>:<path>`. The CLI can expand the
actual files for diagnostics, but the persisted record should work if future
memjectives have different files.

## Command Surface

Use `memjective check <slug>` as the human-facing invariant dashboard. It should
answer: is this workstream caught up, and what action is needed next?

Put lower-level primitives under `memjective exec`. These commands are allowed
to be legible to humans, but their primary audience is skills, scripts, and LMs.
Keep them small and explicit:

```bash
memjective check <slug>

memjective exec init <slug>
memjective exec record-entry <slug> --file entry.json
memjective exec record-entry <slug> --json '{"id":"pr-221",...}'
memjective exec record-entry <slug> - < entry.json
memjective exec compute-pending-entries <slug> --format json
```

Steelthread order:

1. Ship `memjective check <slug>` first, read-only, with enough JSON for the
   first reconcile skill to consume.
2. Add `init` and `record-entry` once there is a visible check result worth
   updating.
3. Add `compute-pending-entries` later as a hardened, lower-level primitive when
   the skill workflow has proven the exact evidence shape it needs.

Avoid command names like `plan`, `stamp`, `record-pr-skipped`, or
`record-pr-incorporated` in the public workflow. The CLI primitives compute or
record structured facts; the skill does the semantic incorporation.

## State Shape

Initial schema:

```json
{
  "version": 1,
  "slug": "twerk-reviewer",
  "root": {
    "namespace": "memjectives",
    "branch": "master",
    "path": "twerk-reviewer"
  },
  "entries": [
    {
      "id": "pr-221",
      "kind": "pull_request",
      "source": {
        "branch": "slice-3-dedup-inline-split",
        "snapshot": {
          "namespace": "memjectives",
          "branch": "slice-3-dedup-inline-split",
          "path": "twerk-reviewer",
          "tree_sha": "abc123"
        }
      },
      "pr": {
        "number": 221,
        "state": "MERGED",
        "title": "Add post-findings-comment command...",
        "url": "https://github.com/...",
        "head_ref_name": "slice-3-dedup-inline-split",
        "base_ref_name": "reviewer-parser-hardening",
        "merged_at": "2026-04-23T...",
        "merge_commit_oid": "..."
      },
      "resolution": {
        "status": "incorporated",
        "recorded_at": "2026-04-24T...",
        "root_before": {
          "namespace": "memjectives",
          "branch": "master",
          "path": "twerk-reviewer",
          "tree_sha": "def456"
        },
        "root_after": {
          "namespace": "memjectives",
          "branch": "master",
          "path": "twerk-reviewer",
          "tree_sha": "789abc"
        },
        "summary": "Checked off slice 3 and recorded the inline-comment batching invariant."
      }
    },
    {
      "id": "pr-231",
      "kind": "pull_request",
      "pr": {
        "number": 231,
        "state": "CLOSED",
        "title": "Expand README with execution model..."
      },
      "resolution": {
        "status": "skipped",
        "recorded_at": "2026-04-24T...",
        "reason": "Closed unmerged; docs approach superseded by PR #240."
      }
    }
  ]
}
```

Rules:

- Top-level collection name is `entries`, not `slices`. The state is a log-like
  record of workstream entries, not a workflow-specific slice list.
- Stored entries are entries already persisted in
  `memjective-state/<slug>/state.json`.
- Computed candidate entries are synthesized from brmem snapshots, GitHub PR
  facts, and root snapshot diagnostics. They may not exist in the stored state
  yet.
- `id` is required and stable. For PR-backed entries, use `pr-<number>`. Before
  a PR exists, use `branch-<branch-name>`.
- `record-entry` upserts by `id`, validates payloads against the schema, and
  enforces invariants such as unique PR numbers and non-regression from
  `incorporated` back to pending without an explicit force flag.
- PR facts are cached observations, not the source of truth. Check and
  compute commands refresh them from GitHub when possible.
- Open PRs and local-only branches may be represented as entries, but they do
  not advance root semantic docs.
- Merge is the promotion boundary. Only merged PRs are eligible for semantic
  incorporation into root docs.

## PR 1: Steelthread Read-Only Check

Goal: deliver the first user-facing value quickly: a user can run
`memjective check <slug>` and see which PRs need incorporation, which closed PRs
need a skip decision, and what state has already been recorded.

Implementation:

- Add typed parse/render/validate code for state schema version 1.
- Treat absent state as a valid legacy memjective with zero stored entries.
- Add `memjective check <slug>` with `--format human` and `--format json`.
- Build check facts by reusing today's `memjective tree` data path directly or
  by extracting only the smallest helper needed. Do not require the full tree
  model extraction before this command can ship.
- Join:
  - current brmem branch snapshots for the slug,
  - current PR lookup facts,
  - optional stored state,
  - root diagnostics for `memjectives/master/<slug>`.
- Report the important user-facing buckets:
  - merged PRs without incorporation entries,
  - merged PRs already recorded as incorporated,
  - incorporated PRs whose current PR facts no longer match the recorded facts,
  - closed-unmerged PRs needing skip decisions,
  - closed-unmerged PRs already recorded as skipped,
  - open/local branches being tracked but not eligible for semantic promotion,
  - lookup or state parse errors.
- Include enough JSON evidence for the first reconcile skill to consume:
  - slug,
  - root namespace/branch/path and existence,
  - source namespace/branch/path for each branch snapshot,
  - PR number/state/title/url/head/base/merged-at when known,
  - stored entry, when present,
  - recommended action such as `incorporate`, `decide_skip`, `wait`, or
    `none`.
- Keep root `tree_sha` best-effort in this PR. If resolving it cleanly would
  expand the slice, expose root existence now and harden snapshot provenance in
  a later PR.
- Preserve all existing `list`, `show`, and `tree` behavior.

Tests:

- Unit tests for schema parse failures, version mismatch, absent state, and
  empty state.
- Scenario tests for `check` with no state, empty state, merged-pending PR,
  incorporated PR, closed-unmerged PR, skipped closed PR, open PR, and stale
  incorporation entry.
- Existing `test_memjective_tree_cli.py` remains green.

Review boundary:

- No writes.
- No semantic doc edits.
- No new lower-level `compute-pending-entries` command yet.
- No full tree model extraction required.

## PR 2: Minimal State Writes

Goal: make the `check` result actionable by adding deterministic writes for the
machine-readable state.

Implementation:

- Add `memjective exec init <slug>`:
  - creates `memjective-state/<slug>/state.json` on `master` if absent,
  - records `version`, `slug`, and the root path,
  - fails if root memjective docs do not exist,
  - is idempotent when the existing state is valid for the slug.
- Add `memjective exec record-entry <slug>`:
  - accepts exactly one JSON payload via `--file`, `--json`, or stdin (`-`),
  - validates the payload against the entry schema,
  - upserts the entry by stable `id`,
  - enforces unique PR numbers across entries,
  - supports the statuses needed by the steelthread: `incorporated`, `skipped`,
    and tracked non-terminal branch/PR observations,
  - writes only the `memjective-state` namespace.
- Keep validation practical in this PR:
  - reject malformed JSON, schema version mismatches, slug mismatches, duplicate
    PR numbers, and obvious status regressions,
  - defer strict `root_before`/`root_after` provenance matching until the
    hardening PR.
- After each write, `memjective check <slug>` should reflect the updated state.

Tests:

- `init` is idempotent.
- `record-entry` creates a new entry.
- `record-entry` updates the same entry instead of duplicating it.
- `record-entry` upgrades `branch-*` to `pr-*` when a PR-backed payload is
  supplied, preserving prior source facts when appropriate.
- Duplicate PR numbers are rejected.
- Invalid JSON, unknown schema versions, slug mismatches, and invalid basic
  transitions fail cleanly.
- A check scenario proves that a recorded incorporated entry leaves the merged
  pending bucket.

Review boundary:

- Mechanical state mutation only.
- No semantic root doc edits.
- No hardened incorporation proof yet.

## PR 3: Add `dev-memjective-reconcile` Steelthread

Goal: provide the first end-to-end user workflow: inspect pending merged PRs,
incorporate their branch memjective docs into the root docs, and record the
state entry so rerunning the workflow is idempotent.

Implementation:

- New skill flow:
  1. Run `memjective check <slug> --format json`.
  2. Run `memjective exec init <slug>` if state is absent.
  3. For each check item whose recommended action is `incorporate`, read the
     source brmem docs from the item's namespace/branch/path.
  4. Conservatively update root memjective docs using the existing mutation
     contract.
  5. Persist root doc changes with `brmem put`.
  6. Build a JSON entry payload with `resolution.status: incorporated`,
     recorded PR facts, source snapshot facts available from `check`, and a
     human summary.
  7. Run `memjective exec record-entry <slug> --file <payload>`.
  8. Re-run `memjective check` and report remaining pending work.
- The skill must say explicitly that open PRs are not semantically incorporated.
- Closed-unmerged PRs are skipped only on user confirmation, then recorded via
  `record-entry` with a `skipped` resolution.
- If the first check cannot provide enough evidence for a merged PR, the skill
  stops on that PR and reports the missing fact instead of guessing.

Tests:

- Skill-level manual verification scenarios for:
  - one merged-pending PR,
  - no pending PRs,
  - closed-unmerged PR requiring confirmation,
  - rerun after incorporation showing no pending work.

Review boundary:

- Skill only, consuming `check`, `init`, and `record-entry`.
- No new Python-side semantic summarization.
- No changes to `dev-memjective-next` yet.

## PR 4: Extract The Tree Model Behind `memjective tree` And `check`

Goal: harden the data model after the user-facing loop exists, without changing
visible behavior.

Implementation:

- Add `packages/twerk-core/src/twerk_core/memjective/tree_model.py`. This is a
  regular public module path; do not hide it behind a leading underscore and do
  not re-export it from `__init__.py`.
- Move the non-Click tree model construction out of
  `packages/twerk-core/src/twerk_core/memjective/tree.py` into this module:
  - list brmem entries in the `memjectives` namespace,
  - filter entries whose key is under `<slug>/`,
  - detect whether the `master` seed snapshot exists,
  - collapse multiple files on the same branch into one branch node,
  - exclude `master` from PR-bearing branch nodes,
  - mark branch liveness with `GitGateway.branch_exists`,
  - enrich each branch through the existing `PRGateway.get_pr_for_branch`.
- Introduce small frozen dataclasses in the new module:
  - `MemjectiveTreeModel` with `slug`, `seed_present`, and `branches`.
  - `MemjectiveTreeBranch` with `branch`, `stale`, and `pr`.
  - `MemjectiveTreePr` as a normalized PR observation with `action`, `number`,
    `state`, `title`, `url`, and `error_stderr`.
- Update both `tree` and `check` to consume the extracted model.
- Keep PR lookup semantics exactly as they are today:
  - `PRSummary.state == OPEN` maps to `open`.
  - `PRSummary.state == MERGED` maps to `merged`.
  - `PRSummary.state == CLOSED` maps to `closed`.
  - `PRLookupError.returncode == 1` maps to `no_pr`.
  - Any other `PRLookupError` maps to `error` and preserves stderr.
- Keep GitHub interaction behind the existing `PRGateway`. This PR should not
  add new `gh` commands, REST calls, GraphQL queries, or PR lookup fields.
- Preserve all existing user-visible behavior:
  - `memjective tree --schema` unchanged,
  - omitted slug auto-resolves from the current branch as before,
  - unknown slug returns the same negative result and JSON payload,
  - seed-only memjective shows `seed_present: true` with no rows,
  - stale marker remains JSON-only and is still omitted from human output,
  - auth or other `gh` failures become `error` rows instead of failing the
    command.

Tests:

- Existing `test_memjective_tree_cli.py` remains green.
- Existing `check` scenarios remain green.
- Add unit tests for tree model construction independent of Click rendering.
- Suggested new file:
  `packages/twerk-core/tests/unit/test_memjective_tree_model.py`.
- Unit-test tree model construction with fakes:
  - no entries for the slug produces an empty model with `seed_present=False`,
  - master-only seed produces `seed_present=True` and no branch nodes,
  - multiple files under the same slug on one branch collapse to one node,
  - unrelated slugs and unrelated namespaces are ignored,
  - live branch with open PR maps to `open`,
  - live branch with merged PR maps to `merged`,
  - live branch with closed PR maps to `closed`,
  - deleted branch with surviving brmem ref has `stale=True`,
  - missing PR (`returncode == 1`) maps to `no_pr`,
  - non-1 PR lookup failure maps to `error` and preserves stderr,
  - `master` is never emitted as a branch node even when it has files.

Review boundary:

- Refactor plus tests.
- No new persistence.
- No new reconcile semantics.

## PR 5: Add Snapshot Provenance And Pending-Entry Computation

Goal: turn the evidence shape proven by `check` and the steelthread skill into a
stable lower-level primitive for agents and scripts.

Implementation:

- Resolve and expose durable snapshot provenance for root and source docs:
  `namespace`, `branch`, `path`, and `tree_sha`.
- Add `memjective exec compute-pending-entries <slug>`.
- The command is read-only. It does not mutate state, initialize state, or ask an
  LLM for prose changes.
- It computes candidate entries by joining:
  - stored state, if present,
  - brmem snapshots carrying the slug,
  - current GitHub PR facts,
  - root snapshot diagnostics.
- It returns action-oriented buckets:

  ```json
  {
    "slug": "twerk-reviewer",
    "root": {
      "namespace": "memjectives",
      "branch": "master",
      "path": "twerk-reviewer",
      "tree_sha": "def456"
    },
    "pending_entries": [
      {
        "id": "pr-221",
        "origin": "computed",
        "action": "incorporate",
        "reason": "PR is merged and no incorporation entry exists",
        "candidate_entry": {
          "id": "pr-221",
          "kind": "pull_request"
        },
        "recommended_reads": [
          {
            "namespace": "memjectives",
            "branch": "slice-3-dedup-inline-split",
            "path": "twerk-reviewer",
            "tree_sha": "abc123"
          }
        ]
      }
    ],
    "blocked_entries": [
      {
        "id": "pr-231",
        "origin": "computed",
        "action": "decide_skip",
        "reason": "PR is closed but not merged and no skipped entry exists"
      }
    ],
    "ignored_entries": [
      {
        "id": "pr-228",
        "origin": "computed",
        "reason": "PR is still open"
      }
    ],
    "errors": []
  }
  ```

- `origin` distinguishes stored entries from entries synthesized from current
  external state. A returned item may include both a `stored_entry` and a
  `candidate_entry` when the command is showing drift.
- `--format json` is the primary interface.
- Update `dev-memjective-reconcile` to use this command once it exists.

Tests:

- Merged PR with no incorporation entry appears as a pending computed entry.
- Re-running the command after an incorporation entry is a no-op for that PR.
- Deleted branch with surviving brmem snapshot can still produce evidence.
- Missing brmem snapshot for a merged PR is a hard diagnostic, not silent skip.
- Closed-unmerged PR without a skipped entry appears as blocked.
- Open PR appears as ignored, not pending.

Review boundary:

- Evidence computation only.
- No root doc mutation in Python.
- No new skill behavior beyond switching the skill to the hardened primitive.

## PR 6: Harden Incorporation Recording Semantics

Goal: make the already-working reconciliation loop auditable and resistant to
stale evidence.

Implementation:

- Extend `memjective exec record-entry` validation for payloads whose
  `resolution.status` is `incorporated`.
- The command should:
  - require merged PR facts for PR-backed incorporation entries,
  - require a matching pending computed entry unless explicitly forced,
  - verify that `root_before` matches the root snapshot used by
    `compute-pending-entries`,
  - capture or verify the current `root_after` snapshot,
  - require `root_after` to differ from `root_before` unless the payload
    explicitly records a no-doc-change reason,
  - refuse duplicate incorporation for the same PR and merge commit.
- Keep the durable write generic: the caller still invokes
  `memjective exec record-entry`, not a separate `record-pr-incorporated`
  command.

Tests:

- Happy path records a merged pending PR as incorporated.
- Duplicate incorporation is idempotent or cleanly negative.
- Incorporation refuses open PRs.
- Incorporation refuses missing root docs.
- Incorporation catches root docs that changed since the computed evidence
  snapshot unless an explicit override is provided.

Review boundary:

- Validation hardening only.
- The semantic doc edit remains in the user/agent workflow.

## PR 7: Teach Existing Memjective Skills To Record State

Goal: make normal memjective usage feed machine state without forcing users to
remember extra commands.

Implementation:

- Update `dev-memjective-create` to call `memjective exec init <slug>` after
  creating root docs.
- Update `dev-memjective-next` after carry-forward to call
  `memjective exec record-entry <slug> --file <payload>` with a branch-backed
  entry payload for the new branch snapshot.
- Update `dev-memjective-update` guidance:
  - branch-local update still edits branch snapshot,
  - root/master reconcile should prefer `dev-memjective-reconcile` for merged
    PR incorporation,
  - sibling snapshot evidence remains useful but is no longer the authority for
    root promotion.
- Keep the old path compatible for legacy memjectives with no state file.

Tests:

- Manual verification scenarios in each skill document.
- Confirm no skill asks users to hand-edit `state.json`.

Review boundary:

- Documentation/skill workflow change only.
- CLI behavior already exists from earlier PRs.

## PR 8: Promote Check Into The Default Status Surface

Goal: make it hard to lose track.

Implementation:

- Update `memjective check` or add a new default `memjective overview` command
  that shows both PR state and incorporation state:
  - open,
  - merged pending incorporation,
  - merged incorporated,
  - closed skipped,
  - closed needs decision,
  - lookup error.
- Keep `tree` backward-compatible or deprecate it slowly.
- Add short, copy-pastable next-step hints:
  - `memjective exec init <slug>`,
  - `memjective exec compute-pending-entries <slug> --format json`,
  - `dev-memjective-reconcile <slug>`.

Tests:

- Scenario output for all state combinations.
- JSON schema includes both PR lifecycle state and incorporation state.

Review boundary:

- User-facing polish and discoverability.
- No new persistence semantics.

## Deferred Work

Do not include these in the steelthread stack:

- Cross-namespace brmem transactions.
- Fully derived memjective docs.
- GitHub Actions or daemon-triggered reconcile.
- Automatic LLM summarization inside Python.
- Moving memjective storage to GitHub issues.
- Changing branch carry-forward to exclude files from `memjectives/<slug>/*`.

These may become useful later, but they are not needed to establish the
coverage invariant.

## Suggested Stack Order

1. Add the steelthread read-only `memjective check`.
2. Add minimal state writes with `init` and `record-entry`.
3. Add the `dev-memjective-reconcile` steelthread.
4. Extract and harden the shared tree model behind `tree` and `check`.
5. Add snapshot provenance plus `compute-pending-entries`.
6. Harden incorporation recording semantics.
7. Update existing memjective skills to feed state.
8. Promote check into the default status surface.

The first three PRs create a complete user-facing loop. PRs 4-6 harden the
substrate after behavior exists. PRs 7-8 make the workflow natural during
normal memjective usage.
