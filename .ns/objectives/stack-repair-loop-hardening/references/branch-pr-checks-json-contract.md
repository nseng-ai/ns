# `branch-pr-checks` Enriched JSON Contract

## Purpose and scope

This document defines the additive machine-output contract planned for
`ns address exec branch-pr-checks --format json`. It is the semantic authority for the
implementation and test slice that follows this contract-definition work.

The enrichment gives stack-repair consumers complete, compact facts for PR readiness:
head-commit committed time, per-check freshness, unresolved review-thread counts, an exact
Graphite trailing-signal marker, and a stack-view-compatible PR classification.

This is a pre-implementation specification. It does not claim that the current command,
GraphQL adapter, gateway types, Zod schema, or package documentation already provides
these fields.

## Compatibility rules

The implementation is additive:

- Keep the standard Clinkr envelope and existing coarse exit behavior. A collection with
  missing or ambiguous branch mappings remains a semantic negative result carrying the
  complete collection.
- Keep the top-level `entries` and `summary` fields and preserve input order.
- Keep the entry-level `status` field as the mapping discriminator with the values
  `found`, `missing`, and `ambiguous`.
- Keep existing `target`, `counts`, `checks`, and `candidates` shapes and fields.
- Keep the command payload's existing snake_case property convention.
- Keep normalized external GitHub `status`, `conclusion`, and `state` values unchanged.
- Add fields rather than renaming or removing fields.
- Publish the additions through the real Zod result schema so `--json-schema` and runtime
  validation remain one contract. Do not maintain a detached hand-authored schema.

The existing check-count buckets remain `passing`, `pending`, `failing`, `cancelled`, and
`unknown`, plus `hasMore`. New derivations do not remove checks from those raw buckets.

## Entry discriminated union

`status` answers whether a branch mapped to exactly one open PR. `pr_status` separately
classifies the mapped PR's readiness. Consumers must not treat these fields as aliases.

| Mapping variant | Required fields                                                                                             | `pr_status`                                         |
| --------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| Found           | `branch`, `status`, `pr_status`, `target`, `head_commit_committed_at`, `review_threads`, `counts`, `checks` | `draft`, `checks-failing`, `unresolved`, or `ready` |
| Missing         | `branch`, `status`, `pr_status`                                                                             | `no-pr`                                             |
| Ambiguous       | `branch`, `status`, `pr_status`, `candidates`                                                               | `null`                                              |

The complete non-null PR-status vocabulary is exactly:

```text
draft | checks-failing | unresolved | ready | no-pr
```

There is no `checks-pending` PR status and no parallel `checks_state` summary. Pending
checks may coexist with `pr_status: ready`; consumers that need check settlement must
inspect `counts` and `checks`.

### Missing and ambiguous variants

A missing branch has no single `target`, check collection, committed timestamp, or thread
summary. An ambiguous branch likewise has no single-PR facts; it retains the existing
candidate entries (`branch`, `pr_number`, `title`, `url`, `head_ref_name`, and
`base_ref_name`).

## Found-entry fields

| Field                      | Type                                                     | Meaning                                                                                                          |
| -------------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| `branch`                   | `string`                                                 | Requested branch, preserving input order.                                                                        |
| `status`                   | `"found"`                                                | Mapping discriminator; not PR readiness.                                                                         |
| `pr_status`                | `"draft" \| "checks-failing" \| "unresolved" \| "ready"` | Readiness derived by the precedence table below.                                                                 |
| `target`                   | existing PR target object                                | Existing `kind`, PR number, branch, title, URL, head/base refs, and optional `head_ref_oid` fields are retained. |
| `head_commit_committed_at` | `string \| null`                                         | GitHub head commit `committedDate` as an ISO-8601 string when supplied.                                          |
| `review_threads`           | thread summary object                                    | Complete review-thread counts described below.                                                                   |
| `counts`                   | existing check-count object                              | Raw normalized bucket counts; complete successful output has `hasMore: false`.                                   |
| `checks`                   | array of enriched check entries                          | Every fully paginated check context, including stale and trailing entries.                                       |

### Review-thread summary

```json
{
  "total": 4,
  "resolved": 3,
  "unresolved": 1
}
```

All three values are nonnegative integers. `total` and `resolved` come from the complete
review-thread connection, and `unresolved = total - resolved`. A successful response must
not report partial thread counts.

## Check-entry fields

Every existing field is retained and two derived fields are added.

| Field           | Type                                                    | Meaning                                                                         |
| --------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `bucket`        | `passing \| pending \| failing \| cancelled \| unknown` | Existing normalized bucket.                                                     |
| `kind`          | `check_run \| status_context \| unknown`                | Existing normalized source kind.                                                |
| `name`          | `string`                                                | Existing display/check name.                                                    |
| `workflow_name` | `string \| null`                                        | Existing workflow name.                                                         |
| `status`        | `string \| null`                                        | Existing normalized external check-run status.                                  |
| `conclusion`    | `string \| null`                                        | Existing normalized external check-run conclusion.                              |
| `state`         | `string \| null`                                        | Existing normalized external legacy-context state.                              |
| `started_at`    | `string \| null`                                        | Existing source timestamp.                                                      |
| `completed_at`  | `string \| null`                                        | Existing source timestamp; retained but not used for freshness.                 |
| `created_at`    | `string \| null`                                        | Existing source timestamp and freshness fallback.                               |
| `details_url`   | `string \| null`                                        | Existing check-run details URL.                                                 |
| `target_url`    | `string \| null`                                        | Existing legacy-context target URL.                                             |
| `identity`      | `string \| null`                                        | Existing stable normalized identity when available.                             |
| `freshness`     | `fresh \| stale \| unknown`                             | Derived relationship between the selected check timestamp and head commit time. |
| `is_trailing`   | `boolean`                                               | Exact Graphite mergeability trailing marker.                                    |

`freshness` is derived evidence, not a replacement for raw timestamps. Stale checks remain
present and remain included in their raw buckets and counts.

## PR-status derivation and precedence

Apply the first matching rule:

| Priority | Condition                                                                  | `pr_status`      |
| -------- | -------------------------------------------------------------------------- | ---------------- |
| 1        | Mapping `status` is `missing`.                                             | `no-pr`          |
| 2        | Mapping `status` is `ambiguous`.                                           | `null`           |
| 3        | The found PR is a draft.                                                   | `draft`          |
| 4        | At least one failing check has `freshness: fresh` or `freshness: unknown`. | `checks-failing` |
| 5        | `review_threads.unresolved` is greater than zero.                          | `unresolved`     |
| 6        | Otherwise.                                                                 | `ready`          |

A proven-stale failing check does not make the current head fail. An unknown timestamp is
conservative: a failing check with `freshness: unknown` still yields `checks-failing`.
This intentionally refines stack-view's current aggregate-failure rule without changing
its vocabulary or the relative draft/failure/thread precedence.

Pending checks do not alter `pr_status`. Cancelled checks remain distinct and do not
become failures merely because they were cancelled. Unknown check buckets remain visible
but do not independently produce another PR status.

`ready` is a stack-view readiness classification, not proof that every check has settled.
A repair loop may declare the current head green only after separately interpreting
pending and unknown counts and the individual check entries.

## Freshness derivation

### Timestamp selection

| Check kind       | Selected check timestamp                                                |
| ---------------- | ----------------------------------------------------------------------- |
| `check_run`      | `started_at`, falling back to `created_at` when `started_at` is absent. |
| `status_context` | `created_at`.                                                           |
| `unknown`        | `created_at` when available; otherwise no selected timestamp.           |

### Comparison

Parse the selected check timestamp and `head_commit_committed_at` as ISO-8601 instants.

| Evidence                                                            | `freshness` |
| ------------------------------------------------------------------- | ----------- |
| Either value is missing or invalid.                                 | `unknown`   |
| Selected check timestamp is before the head commit instant.         | `stale`     |
| Selected check timestamp equals or follows the head commit instant. | `fresh`     |

Equality is fresh. `completed_at` does not participate in this derivation.

## Exact Graphite trailing recognition

Set `is_trailing: true` only when both conditions hold:

1. `bucket` is exactly `pending`; and
2. either:
   - `identity` is exactly `status-context:Graphite / mergeability_check`; or
   - `identity` is unavailable (`null`) and `name` is exactly
     `Graphite / mergeability_check`.

All other entries have `is_trailing: false`. In particular, name fallback must not
supersede a non-null, nonmatching identity, and a non-pending Graphite context is not
trailing.

A trailing check remains in `checks` and in the raw pending count. The marker identifies
expected, non-actionable Graphite lag that passes as downstack PRs merge; it does not hide,
re-bucket, or settle the check.

## Pagination, completeness, and failure behavior

Successful found-entry classification is complete:

- Follow every page of the status-check-context connection until `hasNextPage` is false.
- Follow every page of the review-thread connection until `hasNextPage` is false.
- Every check-context and review-thread continuation response carries the PR `headRefOid`
  and must match the head observed by the initial branch query. A moved head is a
  `github_pr_feedback_pagination_invalid` whole-command failure; callers rerun the command,
  and the command does not automatically restart pagination.
- Do not classify a PR from a partial first page. The capability layer also rejects any
  found outcome with `counts.hasMore: true` from any gateway implementation before deriving
  `pr_status` or returning a partial collection.
- Preserve `counts.hasMore` for additive compatibility, but set it to `false` on every
  successfully fully collected found entry.
- Treat a missing/invalid continuation cursor, malformed continuation response, or failure
  fetching any required page as a command/gateway failure. Never return a partial `ready`
  classification.
- Preserve branch input order and the existing missing/ambiguous semantic-negative
  behavior.

Connection pagination is distinct from branch mapping's deliberate `first: 2` lookup.
That lookup needs only enough candidates to discriminate zero, one, or multiple matching
open PRs; it is not a truncated fact connection for a selected PR.

## Representative examples

Examples focus on the data carried by the standard command envelope. The first example
shows a complete collection; later examples show individual entry fragments to keep the
semantic cases readable. Existing target and candidate fields are included, while
unrelated envelope metadata is omitted.

### Found draft PR

```json
{
  "entries": [
    {
      "branch": "draft-api",
      "status": "found",
      "pr_status": "draft",
      "target": {
        "kind": "github-pr",
        "pr_number": 41,
        "branch": "draft-api",
        "title": "Draft API",
        "url": "https://github.example/pulls/41",
        "head_ref_name": "draft-api",
        "base_ref_name": "main",
        "head_ref_oid": "abc41"
      },
      "head_commit_committed_at": "2026-07-14T10:00:00Z",
      "review_threads": { "total": 1, "resolved": 0, "unresolved": 1 },
      "counts": {
        "passing": 0,
        "pending": 0,
        "failing": 1,
        "cancelled": 0,
        "unknown": 0,
        "hasMore": false
      },
      "checks": [
        {
          "bucket": "failing",
          "kind": "check_run",
          "name": "unit",
          "workflow_name": "CI",
          "status": "COMPLETED",
          "conclusion": "FAILURE",
          "state": null,
          "started_at": "2026-07-14T10:01:00Z",
          "completed_at": "2026-07-14T10:03:00Z",
          "created_at": "2026-07-14T10:00:30Z",
          "details_url": "https://github.example/checks/1",
          "target_url": null,
          "identity": "check-run:1",
          "freshness": "fresh",
          "is_trailing": false
        }
      ]
    }
  ],
  "summary": { "requested": 1, "matched": 1, "missing": 0, "ambiguous": 0 }
}
```

Draft wins over both fresh failure and unresolved threads.

### Found PR with fresh and stale failing checks

```json
{
  "branch": "mixed-failures",
  "status": "found",
  "pr_status": "checks-failing",
  "target": {
    "kind": "github-pr",
    "pr_number": 42,
    "branch": "mixed-failures",
    "title": "Mixed failures",
    "url": "https://github.example/pulls/42",
    "head_ref_name": "mixed-failures",
    "base_ref_name": "main",
    "head_ref_oid": "abc42"
  },
  "head_commit_committed_at": "2026-07-14T10:00:00Z",
  "review_threads": { "total": 0, "resolved": 0, "unresolved": 0 },
  "counts": {
    "passing": 0,
    "pending": 0,
    "failing": 2,
    "cancelled": 0,
    "unknown": 0,
    "hasMore": false
  },
  "checks": [
    {
      "bucket": "failing",
      "kind": "check_run",
      "name": "old-unit",
      "workflow_name": "CI",
      "status": "COMPLETED",
      "conclusion": "FAILURE",
      "state": null,
      "started_at": "2026-07-14T09:00:00Z",
      "completed_at": "2026-07-14T09:05:00Z",
      "created_at": "2026-07-14T08:59:00Z",
      "details_url": null,
      "target_url": null,
      "identity": "check-run:2",
      "freshness": "stale",
      "is_trailing": false
    },
    {
      "bucket": "failing",
      "kind": "check_run",
      "name": "current-unit",
      "workflow_name": "CI",
      "status": "COMPLETED",
      "conclusion": "FAILURE",
      "state": null,
      "started_at": "2026-07-14T10:01:00Z",
      "completed_at": "2026-07-14T10:05:00Z",
      "created_at": "2026-07-14T10:00:30Z",
      "details_url": null,
      "target_url": null,
      "identity": "check-run:3",
      "freshness": "fresh",
      "is_trailing": false
    }
  ]
}
```

Both entries remain in the raw failing count; the fresh entry drives `checks-failing`.
If only the stale entry existed, the PR would proceed to the thread rule and then `ready`.

### Ordinary pending plus trailing Graphite pending

```json
{
  "branch": "pending-work",
  "status": "found",
  "pr_status": "ready",
  "target": {
    "kind": "github-pr",
    "pr_number": 43,
    "branch": "pending-work",
    "title": "Pending work",
    "url": "https://github.example/pulls/43",
    "head_ref_name": "pending-work",
    "base_ref_name": "main",
    "head_ref_oid": "abc43"
  },
  "head_commit_committed_at": "2026-07-14T10:00:00Z",
  "review_threads": { "total": 0, "resolved": 0, "unresolved": 0 },
  "counts": {
    "passing": 0,
    "pending": 2,
    "failing": 0,
    "cancelled": 0,
    "unknown": 0,
    "hasMore": false
  },
  "checks": [
    {
      "bucket": "pending",
      "kind": "check_run",
      "name": "integration",
      "workflow_name": "CI",
      "status": "IN_PROGRESS",
      "conclusion": null,
      "state": null,
      "started_at": "2026-07-14T10:02:00Z",
      "completed_at": null,
      "created_at": "2026-07-14T10:01:00Z",
      "details_url": null,
      "target_url": null,
      "identity": "check-run:4",
      "freshness": "fresh",
      "is_trailing": false
    },
    {
      "bucket": "pending",
      "kind": "status_context",
      "name": "Graphite / mergeability_check",
      "workflow_name": null,
      "status": null,
      "conclusion": null,
      "state": "PENDING",
      "started_at": null,
      "completed_at": null,
      "created_at": "2026-07-14T10:03:00Z",
      "details_url": null,
      "target_url": "https://graphite.example/pr/43",
      "identity": "status-context:Graphite / mergeability_check",
      "freshness": "fresh",
      "is_trailing": true
    }
  ]
}
```

`ready` does not assert settlement: the ordinary pending check remains actionable for the
repair loop, while the exact Graphite context is distinguishable as trailing.

### Found PR with unresolved threads

```json
{
  "branch": "review-needed",
  "status": "found",
  "pr_status": "unresolved",
  "target": {
    "kind": "github-pr",
    "pr_number": 44,
    "branch": "review-needed",
    "title": "Review needed",
    "url": "https://github.example/pulls/44",
    "head_ref_name": "review-needed",
    "base_ref_name": "main",
    "head_ref_oid": "abc44"
  },
  "head_commit_committed_at": "2026-07-14T10:00:00Z",
  "review_threads": { "total": 4, "resolved": 3, "unresolved": 1 },
  "counts": {
    "passing": 1,
    "pending": 0,
    "failing": 0,
    "cancelled": 0,
    "unknown": 0,
    "hasMore": false
  },
  "checks": [
    {
      "bucket": "passing",
      "kind": "status_context",
      "name": "lint",
      "workflow_name": null,
      "status": null,
      "conclusion": null,
      "state": "SUCCESS",
      "started_at": null,
      "completed_at": null,
      "created_at": "2026-07-14T10:01:00Z",
      "details_url": null,
      "target_url": null,
      "identity": "status-context:lint",
      "freshness": "fresh",
      "is_trailing": false
    }
  ]
}
```

### Missing branch

```json
{
  "branch": "without-pr",
  "status": "missing",
  "pr_status": "no-pr"
}
```

### Ambiguous branch

```json
{
  "branch": "duplicate-head",
  "status": "ambiguous",
  "pr_status": null,
  "candidates": [
    {
      "branch": "duplicate-head",
      "pr_number": 45,
      "title": "Candidate A",
      "url": "https://github.example/pulls/45",
      "head_ref_name": "duplicate-head",
      "base_ref_name": "main"
    },
    {
      "branch": "duplicate-head",
      "pr_number": 46,
      "title": "Candidate B",
      "url": "https://github.example/pulls/46",
      "head_ref_name": "duplicate-head",
      "base_ref_name": "release"
    }
  ]
}
```

### Missing timestamp yields unknown freshness

```json
{
  "branch": "unknown-time",
  "status": "found",
  "pr_status": "checks-failing",
  "target": {
    "kind": "github-pr",
    "pr_number": 47,
    "branch": "unknown-time",
    "title": "Unknown time",
    "url": "https://github.example/pulls/47",
    "head_ref_name": "unknown-time",
    "base_ref_name": "main",
    "head_ref_oid": "abc47"
  },
  "head_commit_committed_at": null,
  "review_threads": { "total": 0, "resolved": 0, "unresolved": 0 },
  "counts": {
    "passing": 0,
    "pending": 0,
    "failing": 1,
    "cancelled": 0,
    "unknown": 0,
    "hasMore": false
  },
  "checks": [
    {
      "bucket": "failing",
      "kind": "unknown",
      "name": "external-gate",
      "workflow_name": null,
      "status": null,
      "conclusion": null,
      "state": null,
      "started_at": null,
      "completed_at": null,
      "created_at": null,
      "details_url": null,
      "target_url": null,
      "identity": null,
      "freshness": "unknown",
      "is_trailing": false
    }
  ]
}
```

Unknown freshness is conservatively current-or-unclassified for failure precedence.

## Downstream implementation checklist

The next Objective slice must implement and test, without weakening this contract:

- capability-kit GitHub query/schema/gateway support for draft state, the verified head
  commit's `committedDate`, complete check-context pagination, and complete review-thread
  pagination;
- Address Capability API outcome vocabulary for the new source facts;
- PR Address pure payload derivation for freshness, trailing recognition, thread counts,
  and PR-status precedence;
- the real Zod command result schema and therefore `--json-schema`;
- fake gateway fixtures, unit tests, and scenario tests for mapping variants, no checks,
  both check kinds, stale/fresh/unknown timestamps, exact trailing recognition,
  pagination, malformed continuations, and authentication/fetch failures;
- package README updates only after runtime behavior ships.

GitHub does not expose an authoritative commit-level push timestamp. Freshness therefore
uses the selected head commit object's `committedDate`. Re-pushing the same SHA is not
observable, so freshness classifies checks relative to commit-object creation rather than
transport to GitHub. The adapter verifies the selected commit OID matches `headRefOid` and
must not substitute `authoredDate` or repository-wide `pushedAt`.
The adapter may fetch continuation pages sequentially or with bounded concurrency, but
must preserve output order, completeness, and all-or-failure behavior.

## Flow stack-view consumer decision

The `flow-pi-tier` Objective settles the backend relationship. When stack-view is promoted
into Flow's Pi tier, it consumes this enriched Address command/capability data for checks
and review-thread counts instead of retaining duplicate GraphQL facts. This contract does
not modify Flow or stack-view code; consumer migration remains owned by that Objective.
