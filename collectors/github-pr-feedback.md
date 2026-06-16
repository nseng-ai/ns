# GitHub PR feedback collector

Collect unresolved/current GitHub PR feedback into roaster-shaped JSON findings
for human or agent triage.

This is a prompt-only collector. It does not persist findings, discover other
collectors, or provide a machine-addressable ingestion API. When you follow this
prompt, return the collector result as JSON only.

## When to use

Use this collector when the user wants current GitHub PR review feedback
normalized into roaster-style findings. It is intended for triage of review
threads, PR-level review bodies, and human-like discussion comments that may
require code or documentation changes.

Do not use this collector to inspect arbitrary GitHub issues, CI failures,
Buildkite logs, code-scanning alerts, or already-collected roaster review
results.

## Safety boundary

This collector is read-only. Do not:

- edit files
- stage or commit changes
- create branches
- push
- run `gt submit`
- resolve GitHub review threads
- post GitHub replies, comments, or reactions
- call mutating `pr-address` operations such as `resolve-thread-batch`,
  `reply-to-review`, `reply-to-discussion`, or `resolve-thread-with-reply`
- use `pr-address exec prepare-run`, because it can reopen contested threads and
  is not purely read-only

## Required helper

This collector requires a runnable `pr-address` CLI. Do not fall back to raw
`gh` inspection in this MVP. If `pr-address` is unavailable or a required
`pr-address` command fails with `exit_code: 2`, return a JSON-only precondition
or collection failure result with empty `findings` and `ignored_items`.

The collector should use these read-only commands only:

```bash
git branch --show-current
pr-address exec map-branch-prs --branches-json '{"branches":["<branch>"]}' --format json --stdout-mode full
pr-address exec download-feedback --pr-number <pr-number> --format json
```

Do not pass `--include-resolved` by default. This collector focuses on
unresolved/current feedback.

## Target PR selection

1. If the user/request supplies an explicit PR number, use that PR number and
   skip branch PR discovery.
2. Otherwise run:

   ```bash
   git branch --show-current
   ```

3. Then run:

   ```bash
   pr-address exec map-branch-prs --branches-json '{"branches":["<branch>"]}' --format json --stdout-mode full
   ```

4. If no current branch is available, or no open PR is found for the current
   branch, return one JSON object with empty `findings` and `ignored_items` and
   a `summary` explaining that no target PR could be resolved.
5. If a PR is found, run:

   ```bash
   pr-address exec download-feedback --pr-number <pr-number> --format json
   ```

The `pr-address exec` commands return a machine envelope. Treat `exit_code: 0`
as success with payload under `data`; treat `exit_code: 1` as a negative
non-fatal outcome that may include a useful message or partial data; treat
`exit_code: 2` as a failure and fail closed instead of guessing from ad hoc
GitHub inspection.

## Collection procedure

Use the Markdown returned in `data.markdown` from `download-feedback` as source
evidence. The helper formats review evidence; it does not decide actionability,
severity, or batch membership. You must interpret the Markdown and decide which
items become findings.

Include as findings:

- unresolved/current inline review threads that request changes,
  clarification, simplification, cleanup, or fixes
- PR-level review bodies when they contain actionable feedback not already
  represented by inline threads
- human-like discussion comments when they request changes or raise unresolved
  concerns
- non-blocking FYI items only when they still deserve explicit triage

Prefer avoiding duplicate findings when a PR-level review summary repeats an
inline thread. If the Markdown includes resolved, stale, non-actionable,
duplicate, empty, or automation-noise items, summarize them compactly in
`ignored_items`. Do not create a complete source-item ledger.

## Classification guidance

Use roaster's severity labels only:

- `warning`: ordinary actionable PR feedback; this is the default
- `info`: FYI/non-blocking feedback that still deserves triage
- `error`: clearly blocking feedback, change-requested feedback, or feedback
  that must be addressed before merge

Ignored item reasons should be short snake_case strings. Suggested reasons:

- `non_actionable`
- `duplicate`
- `already_resolved`
- `stale_or_outdated`
- `automation_noise`
- `empty_review`
- `insufficient_evidence`

## Output contract

Return exactly one JSON object. Do not wrap it in Markdown. Do not include prose
before or after the JSON.

Required top-level fields:

```json
{
  "collector": "github-pr-feedback",
  "target": {
    "kind": "github_pr",
    "pr_number": 123,
    "branch": "feature/example",
    "url": "https://github.com/org/repo/pull/123"
  },
  "summary": "Collected unresolved GitHub PR feedback from PR #123.",
  "findings": [],
  "ignored_items": []
}
```

Target rules:

- `target.kind` must be `github_pr`.
- `target.pr_number` may be `null` only when PR resolution failed.
- `target.branch` should be the PR head branch when available; otherwise use
  the current branch, or `null` if unknown.
- `target.url` may be `null` if no PR URL is available.

Required finding shape:

```json
{
  "id": "simplify-branch-condition",
  "title": "Simplify branch condition",
  "summary": "Reviewer asked to replace nested conditionals with a clearer helper.",
  "source": "github-pr-feedback",
  "severity": "warning",
  "location": {
    "path": "packages/foo/bar.py",
    "line": 42
  },
  "source_ref": {
    "source": "github-pr",
    "url": "https://github.com/org/repo/pull/123#discussion_r123456"
  },
  "metadata": {}
}
```

Finding field rules:

- `id`: required; human-readable kebab-case slug. It only needs to be stable
  enough for human/agent triage within this run.
- `title`: required; concise title.
- `summary`: required; one or two sentences explaining the requested change or
  concern.
- `source`: required; must be `github-pr-feedback`.
- `severity`: required; one of `info`, `warning`, or `error`.
- `location`: required but may be `null` for PR-level or discussion feedback
  without a file location. When present, include `path` and optional `line`.
- `source_ref`: required when a URL is available. Keep it simple:
  - `source`: `github-pr`
  - `url`: source URL or PR URL
- `metadata`: optional object for useful source-specific extras such as author,
  review state, source kind, or compact source evidence. Do not require or
  depend on machine closeout fields.

Required ignored item shape:

```json
{
  "summary": "Approval review with no actionable body.",
  "reason": "non_actionable",
  "source_ref": {
    "source": "github-pr",
    "url": "https://github.com/org/repo/pull/123"
  }
}
```

Ignored item field rules:

- `summary`: required; one concise sentence.
- `reason`: required; short snake_case reason.
- `source_ref`: required when URL/source is available and should use the same
  simple shape as finding source refs.

## Failure and empty-result shapes

If `pr-address` is unavailable, return JSON like:

```json
{
  "collector": "github-pr-feedback",
  "target": {
    "kind": "github_pr",
    "pr_number": null,
    "branch": "feature/example",
    "url": null
  },
  "summary": "Could not collect GitHub PR feedback because `pr-address` was not available.",
  "findings": [],
  "ignored_items": []
}
```

If no current-branch PR is found, return JSON like:

```json
{
  "collector": "github-pr-feedback",
  "target": {
    "kind": "github_pr",
    "pr_number": null,
    "branch": "feature/example",
    "url": null
  },
  "summary": "No open GitHub PR was found for the current branch.",
  "findings": [],
  "ignored_items": []
}
```

If a PR is found but there is no actionable feedback, return the resolved target
and empty `findings`, with `ignored_items` summarizing any non-actionable source
items that were present.

## JSON schema by example

```json
{
  "collector": "github-pr-feedback",
  "target": {
    "kind": "github_pr",
    "pr_number": 123,
    "branch": "feature/collector-mvp",
    "url": "https://github.com/acme/widgets/pull/123"
  },
  "summary": "Collected 1 actionable finding from unresolved GitHub PR feedback on PR #123.",
  "findings": [
    {
      "id": "simplify-branch-condition",
      "title": "Simplify branch condition",
      "summary": "Reviewer asked to replace nested conditionals with a clearer helper.",
      "source": "github-pr-feedback",
      "severity": "warning",
      "location": {
        "path": "packages/widgets/src/branching.py",
        "line": 42
      },
      "source_ref": {
        "source": "github-pr",
        "url": "https://github.com/acme/widgets/pull/123#discussion_r123456"
      },
      "metadata": {
        "author": "reviewer"
      }
    }
  ],
  "ignored_items": [
    {
      "summary": "Approval review had no actionable body.",
      "reason": "empty_review",
      "source_ref": {
        "source": "github-pr",
        "url": "https://github.com/acme/widgets/pull/123"
      }
    }
  ]
}
```

## Rules

- Return one JSON object only; no Markdown wrapper and no explanatory prose.
- Use `pr-address exec download-feedback`; do not use `prepare-run`.
- Stay read-only and do not mutate GitHub, git, Graphite, files, or Branch
  Memory.
- Keep finding IDs human-readable rather than hashes or opaque source object
  IDs.
- Keep `source_ref` simple with `source` and `url` only.
- Use optional `metadata` only as an escape hatch for helpful source-specific
  facts.
- Optimize for human/agent triage, not automatic closeout or source-item
  accounting.
