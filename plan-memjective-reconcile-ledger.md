# Memjective Reconcile State Multi-PR Plan

This plan intentionally does not use the memjective workflow to manage the
migration. It is a plain repo plan for changing memjectives safely.

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

## PR 1: Extract The Workstream Graph Behind `memjective tree`

Goal: make the underlying data model first-class without changing user-facing
behavior.

Implementation:

- Add `packages/twerk-core/src/twerk_core/memjective/workstream_graph.py`.
  This is a regular public module path; do not hide it behind a leading
  underscore and do not re-export it from `__init__.py`.
- Move the non-Click graph-building logic out of
  `packages/twerk-core/src/twerk_core/memjective/tree.py` into this module:
  - list brmem entries in the `memjectives` namespace,
  - filter entries whose key is under `<slug>/`,
  - detect whether the `master` seed snapshot exists,
  - collapse multiple files on the same branch into one branch node,
  - exclude `master` from PR-bearing branch nodes,
  - mark branch liveness with `GitGateway.branch_exists`,
  - enrich each branch through the existing `PRGateway.get_pr_for_branch`.
- Introduce small frozen dataclasses in the new module:
  - `MemjectiveWorkstreamGraph` with `slug`, `seed_present`, and `branches`.
  - `MemjectiveWorkstreamBranch` with `branch`, `stale`, and `pr`.
  - `MemjectiveBranchPr` as a normalized PR observation with `action`,
    `number`, `state`, `title`, `url`, and `error_stderr`.
    The field names should remain close to today's `tree` JSON shape so the
    CLI adapter stays mechanical.
- Keep PR lookup semantics exactly as they are today:
  - `PRSummary.state == OPEN` maps to `open`.
  - `PRSummary.state == MERGED` maps to `merged`.
  - `PRSummary.state == CLOSED` maps to `closed`.
  - `PRLookupError.returncode == 1` maps to `no_pr`.
  - Any other `PRLookupError` maps to `error` and preserves stderr.
- Keep GitHub interaction behind the existing `PRGateway`. PR 1 should not add
  new `gh` commands, REST calls, GraphQL queries, or PR lookup fields.
- Make the graph builder deterministic but layout-neutral:
  - graph construction may return branch nodes sorted alphabetically by branch,
  - the `memjective tree` command remains responsible for the current display
    grouping `merged -> open -> closed -> no_pr -> error`.
    Future reconciliation code should depend on graph facts, not table order.
- Update `tree.py` so `run_tree_memjective` still owns:
  - Click request/response types,
  - slug auto-resolution and its existing error handling,
  - conversion from graph facts into `MemjectiveTreeResult`,
  - human rendering and JSON schema compatibility,
  - negative exit when a slug has no brmem entries.
- Preserve all existing user-visible behavior:
  - `memjective tree --schema` unchanged,
  - omitted slug auto-resolves from the current branch as before,
  - unknown slug returns the same negative result and JSON payload,
  - seed-only memjective shows `seed_present: true` with no rows,
  - stale marker remains JSON-only and is still omitted from human output,
  - auth or other `gh` failures become `error` rows instead of failing the
    command.
- Do not compute or persist `path`/`tree_sha` in PR 1. That belongs to the
  state/check substrate in later PRs.

Tests:

- Existing `test_memjective_tree_cli.py` remains green.
- Add unit tests for graph construction independent of Click rendering.
- Suggested new file:
  `packages/twerk-core/tests/unit/test_memjective_workstream_graph.py`.
- Unit-test graph construction with fakes:
  - no entries for the slug produces an empty graph with `seed_present=False`,
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
- Add or adjust one scenario assertion only if needed to prove `tree` still
  renders from the graph. Prefer keeping the existing scenario suite as the
  compatibility contract.

Review boundary:

- No new persistence.
- No new reconcile semantics.
- No state schema yet.
- No `memjective check` yet.
- No changes to the real GitHub lookup mechanism.
- Pure extraction plus tests.

## PR 2: Add State Schema And Read-Only Check

Goal: introduce `memjective-state/<slug>/state.json` as optional root-owned
model state, but keep all operations read-only.

Implementation:

- Add typed parse/render/validate code for state schema version 1.
- Treat absent state as a valid legacy memjective with zero stored entries.
- Add `memjective check <slug>` that joins:
  - workstream graph facts from PR 1,
  - optional stored state,
  - root snapshot diagnostics.
- Report the important invariant buckets:
  - merged PRs without incorporation entries,
  - incorporated PRs whose current PR facts no longer match,
  - closed-unmerged PRs needing skip decisions,
  - open/local branches being tracked but not eligible for semantic promotion.
- Provide `--format json` for agent/skill consumers.

Tests:

- Unit tests for schema parse failures and version mismatch.
- Scenario tests for check with no state, empty state, merged-pending PR,
  incorporated PR, closed-unmerged PR, and stale incorporation entry.

Review boundary:

- Still no writes.
- Existing `list`, `show`, and `tree` behavior unchanged.

## PR 3: Add Generic State Mutation

Goal: make state writes deterministic CLI operations instead of hand-edited
JSON in skills.

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
  - refuses invalid state transitions unless an explicit force flag is added,
  - writes only the `memjective-state` namespace.
- Document payload shapes for PR observations, skipped closed PRs, and
  incorporated PRs, but keep the CLI surface generic.

Tests:

- `init` is idempotent.
- `record-entry` creates a new entry.
- `record-entry` updates the same entry instead of duplicating it.
- `record-entry` upgrades `branch-*` to `pr-*` when a PR-backed payload is
  supplied, preserving the prior source snapshot when appropriate.
- Duplicate PR numbers are rejected.
- Invalid JSON, unknown schema versions, and invalid transitions fail cleanly.

Review boundary:

- Mechanical state mutation only.
- No semantic doc edits.
- No pending-entry computation yet.

## PR 4: Add Pending-Entry Computation

Goal: compute the exact work needed to converge root docs and stored state
without performing semantic edits.

Implementation:

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
- `--format json` is the primary interface for future skills.

Tests:

- Merged PR with no incorporation entry appears as a pending computed entry.
- Re-running the command after an incorporation entry is a no-op for that PR.
- Deleted branch with surviving brmem snapshot can still produce evidence.
- Missing brmem snapshot for a merged PR is a hard diagnostic, not silent skip.
- Closed-unmerged PR without a skipped entry appears as blocked.
- Open PR appears as ignored, not pending.

Review boundary:

- Evidence computation only.
- No LLM summarization in Python.
- No root doc mutation.

## PR 5: Add Incorporation Recording Semantics

Goal: let an agent perform the semantic doc edits and then record the mechanical
incorporation entry so future reconcile runs are idempotent.

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

- Still no automated semantic editing.
- This PR makes the human/agent reconciliation loop auditable.

## PR 6: Add `dev-memjective-reconcile` Skill

Goal: introduce the user-facing reconciliation workflow after the CLI has
enough mechanical support.

Implementation:

- New skill flow:
  1. Run `memjective check <slug> --format json`.
  2. Run `memjective exec compute-pending-entries <slug> --format json`.
  3. For each pending entry with `action: incorporate`, read the recommended
     brmem source docs.
  4. Conservatively update root memjective docs using the existing mutation
     contract.
  5. Persist root doc changes with `brmem put`.
  6. Build a JSON entry payload that adds an `incorporated` resolution with
     summary and root before/after snapshots.
  7. Run `memjective exec record-entry <slug> --file <payload>`.
  8. Re-run `memjective check` and report remaining pending work.
- The skill must say explicitly that open PRs are not semantically incorporated.
- Closed-unmerged PRs are skipped only on user confirmation, then recorded via
  `record-entry` with a `skipped` resolution.

Tests:

- Skill-level manual verification scenarios for:
  - one merged-pending PR,
  - no pending PRs,
  - closed-unmerged PR requiring confirmation,
  - stale root docs requiring rerun.

Review boundary:

- Skill only. It consumes CLI commands introduced earlier.
- No changes to `dev-memjective-next` yet.

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

Do not include these in the first stack:

- Cross-namespace brmem transactions.
- Fully derived memjective docs.
- GitHub Actions or daemon-triggered reconcile.
- Automatic LLM summarization inside Python.
- Moving memjective storage to GitHub issues.
- Changing branch carry-forward to exclude files from `memjectives/<slug>/*`.

These may become useful later, but they are not needed to establish the
coverage invariant.

## Suggested Stack Order

1. Extract workstream graph behind `tree`.
2. Add state schema plus read-only check.
3. Add generic state mutation.
4. Add pending-entry computation.
5. Add incorporation recording semantics.
6. Add `dev-memjective-reconcile`.
7. Update existing memjective skills to feed state.
8. Promote check into the default status surface.

The first five PRs create the substrate. PRs 6-8 make the workflow natural.
