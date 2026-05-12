# GitHub Gateway Conformance Fixture Contract

## Status

Initial operating contract for the `github-gateway-conformance-harness` initiative.

The canonical GitHub repository has not been selected yet. Until it is selected, this document defines the repository shape, fixture lifecycle, and configuration contract that the first live conformance tests should target.

## Purpose

The live GitHub conformance suite validates the public `asdl_core.gh` gateway contracts against a real, isolated GitHub repository. This document tells test authors, repository maintainers, CI authors, and future agents what repository state tests may rely on and what state tests may mutate.

The fixture contract is intentionally separate from test implementation. It should be stable enough that:

- a maintainer can create or repair the test repository without reading test internals;
- a test author can add a conformance case without guessing which resources are safe;
- a CI author can configure scheduled/manual runs without exposing production repositories;
- failures can distinguish fixture/environment problems from real fake-vs-real contract drift.

## Repository Contract

The conformance repository must be a dedicated GitHub repository used only for this harness. It may be public or private, but it must not be a production repository and must not contain sensitive code, data, secrets, or organization-critical automation.

Required repository properties:

- Issues and pull requests are enabled.
- The default branch exists and can accept harmless fixture commits.
- The test token can read repository metadata, issues, pull requests, review comments, review threads, and changed files.
- Mutating tests can create branches, commits, pull requests, issue comments, PR reviews, reactions, and review-thread state changes in the test repository.
- Branch protection, required reviews, or required status checks do not prevent ephemeral test PRs from being created and closed.
- The repository can accumulate closed issues, closed PRs, comments, reviews, reactions, and deleted branch history over time.

The repository should have a short README that identifies it as an automated conformance fixture repository and links back to this document or its successor.

## Configuration Contract

Live conformance tests should require explicit repository selection. They must not accidentally run against the developer's current repository just because `gh` can infer context from git remotes.

Use these environment variables as the initial configuration surface:

| Variable                                 | Required | Meaning                                                                                 |
| ---------------------------------------- | -------- | --------------------------------------------------------------------------------------- |
| `ASDL_GH_CONFORMANCE_REPO`               | yes      | GitHub repository in `owner/name` form.                                                 |
| `ASDL_GH_CONFORMANCE_GOLDEN_PR`          | yes      | Pull request number for the persistent read-only golden PR.                             |
| `ASDL_GH_CONFORMANCE_GOLDEN_BRANCH`      | yes      | Head branch name for the persistent read-only golden PR.                                |
| `ASDL_GH_CONFORMANCE_GOLDEN_ISSUE_LABEL` | yes      | Label that selects persistent read-only golden issues.                                  |
| `ASDL_GH_CONFORMANCE_AUTHOR_LOGIN`       | optional | Expected bot/user login for marker-based comment lookup tests, when author-sensitive.   |
| `ASDL_GH_CONFORMANCE_RUN_ID`             | optional | Caller-provided unique run id. If absent, the harness should generate one per test run. |
| `ASDL_GH_CONFORMANCE_ALLOW_MUTATIONS`    | optional | Must be set to `1` before mutating live tests create or update GitHub resources.        |

Authentication should use the normal `gh` mechanisms:

- local runs: `gh auth status` should show an authenticated account with access to `ASDL_GH_CONFORMANCE_REPO`;
- CI runs: provide a least-privilege token through `GH_TOKEN` or the workflow's selected authentication mechanism.

The exact CI token model is a repository-owner decision. A fine-grained PAT or GitHub App token should be scoped to the conformance repository only where feasible. Expected permissions are at least metadata read, issues read/write, pull requests read/write, and contents read/write for ephemeral branches and commits.

When invoking `gh`, the harness should either pass `-R "$ASDL_GH_CONFORMANCE_REPO"` to commands that support it or set `GH_REPO` only inside the live-test process. If a gateway implementation inherits repository context from the current working directory, the harness must establish that context deliberately, for example with a temporary checkout of the conformance repository or a controlled `GH_REPO` environment.

## Fixture Classes

The repository contains two fixture classes:

1. **Persistent golden fixtures** — stable, read-only resources created once and maintained deliberately.
2. **Ephemeral per-run fixtures** — uniquely marked resources created by mutating tests and owned by the run that created them.

Tests must never mutate persistent golden fixtures. Mutating tests must create their own ephemeral resources and address them by run marker, branch prefix, PR number, issue number, or comment id captured during that run.

## Persistent Golden Fixtures

Golden fixtures provide safe read-only targets for parity tests. They should be small, boring, and intentionally stable. If a golden fixture must change, update the fixture documentation and conformance expectations in the same review.

### Golden Label

Create a label named by `ASDL_GH_CONFORMANCE_GOLDEN_ISSUE_LABEL`, recommended value:

```text
asdl-gh-conformance-golden
```

This label selects read-only issues used by `IssueGateway.list` conformance tests. It must not be reused for ephemeral resources.

### Golden Issue

Create at least one open issue with the golden label.

Recommended shape:

- title starts with `[asdl-gh-conformance:golden-issue]`;
- body contains the marker `<!-- asdl-gh-conformance:golden-issue -->`;
- issue remains open unless tests explicitly add closed-state coverage later;
- no conformance test edits, comments on, labels, assigns, closes, or reopens this issue.

Tests may assert stable public fields such as number, title, state, URL shape, and presence in `gh issue list --label <golden-label>`. Tests should not assert global issue counts.

### Golden Pull Request

Create one persistent open pull request and record its number in `ASDL_GH_CONFORMANCE_GOLDEN_PR`. Its head branch is recorded in `ASDL_GH_CONFORMANCE_GOLDEN_BRANCH`.

Recommended branch name:

```text
asdl-gh-conformance-golden-pr
```

Recommended PR shape:

- title starts with `[asdl-gh-conformance:golden-pr]`;
- body contains the marker `<!-- asdl-gh-conformance:golden-pr -->`;
- head branch changes one small text fixture file, for example `fixtures/golden-pr.txt`;
- PR remains open and unmerged;
- branch remains undeleted;
- conformance tests do not push to the branch, edit the PR, close it, merge it, request reviewers, add labels, or alter review-thread state.

The golden PR should contain these read-only resources:

| Resource                 | Purpose                                                                                                        |
| ------------------------ | -------------------------------------------------------------------------------------------------------------- |
| Changed text file        | Exercises changed-file shape, status, and patch handling.                                                      |
| Discussion comment       | Exercises PR discussion-comment listing without mutating the PR.                                               |
| Submitted PR review      | Exercises PR-level review listing for states such as `COMMENTED`, `APPROVED`, or `CHANGES_REQUESTED`.          |
| Inline review comment    | Exercises PR review-comment listing.                                                                           |
| Unresolved review thread | Exercises review-thread listing when `include_resolved=False`.                                                 |
| Resolved review thread   | Exercises review-thread listing when `include_resolved=True`; tests must not resolve or unresolve this thread. |

The first read-only parity slice does not need to assert every row above. Missing optional rows should be treated as fixture-not-ready skips or setup failures, not as fake/real semantic drift.

## Ephemeral Per-Run Fixtures

Mutating tests own only resources that carry their run marker. The marker must appear in every created issue body, PR body, comment body, review body, or other mutable text field that GitHub preserves.

Use this marker form:

```text
<!-- asdl-gh-conformance run:<run-id> purpose:<purpose> -->
```

Generate `<run-id>` once per live-test run. Recommended format:

```text
YYYYMMDDTHHMMSSZ-<short-sha-or-random-hex>
```

Use lowercase, URL-safe purpose names such as `discussion-comment`, `review-reaction`, or `thread-resolution`.

Recommended naming conventions:

| Resource     | Convention                                                                      |
| ------------ | ------------------------------------------------------------------------------- |
| Branch       | `asdl-gh-conformance/run/<run-id>/<purpose>`                                    |
| Issue title  | `[asdl-gh-conformance:<run-id>] <purpose>`                                      |
| PR title     | `[asdl-gh-conformance:<run-id>] <purpose>`                                      |
| Label        | `asdl-gh-conformance-ephemeral`, if labels are useful for cleanup or searching. |
| Comment body | Include the HTML marker before human-readable test text.                        |
| Review body  | Include the HTML marker before human-readable test text.                        |

Ephemeral resources may be closed or branches may be deleted at the end of a successful run, but tests must remain safe after partial failure. Future cleanup should find stale resources by marker, title prefix, branch prefix, and optional label rather than by age alone.

## Allowed and Forbidden Mutations

Allowed in mutating tests, only in the conformance repository and only with an ephemeral run marker:

- create and delete branches under `asdl-gh-conformance/run/`;
- create small commits on ephemeral branches;
- open, comment on, review, close, and optionally merge ephemeral PRs when a test explicitly covers merge behavior;
- create, comment on, label, close, and reopen ephemeral issues;
- add and update discussion comments created by the same run;
- add reactions to comments created by the same run;
- submit PR reviews against ephemeral PRs;
- resolve or unresolve review threads created by the same run.

Forbidden for all conformance tests:

- mutate persistent golden issues, PRs, branches, comments, reviews, or review threads;
- operate on any repository other than `ASDL_GH_CONFORMANCE_REPO`;
- depend on global issue, PR, comment, reaction, or review counts;
- change repository settings, branch protection, secrets, collaborators, webhooks, Actions settings, or organization settings;
- create broad or unbounded API scans outside the configured repository;
- require the repository to be reset to a pristine state after each run.

## Test Author Expectations

Conformance tests should assert gateway contract behavior and public dataclass shapes, not incidental GitHub payload details.

Prefer assertions like:

- the golden PR branch lookup returns the configured PR number and an open lifecycle state;
- changed files include the expected fixture path and a text patch when GitHub exposes one;
- review comments have stable public fields such as id, body, author, path, line, and created timestamp;
- discussion comment lookup respects both marker and author when the operation is author-sensitive;
- mutation methods return the newly created or updated public gateway object.

Avoid assertions like:

- this repository has exactly N issues or pull requests;
- comments have contiguous numeric ids;
- timestamps equal a hard-coded value;
- GraphQL node ids have a particular prefix;
- pagination happens after a specific page size unless the test deliberately creates that boundary.

Environment failures should be reported separately from semantic failures. Missing `gh`, missing environment variables, failed authentication, missing permissions, rate-limit exhaustion, and absent golden fixtures are harness/setup failures. A real gateway result that differs from the fake for the same documented scenario is a possible contract-drift failure.

## Local Preflight Checklist

Before running live conformance tests locally:

```bash
gh --version
gh auth status
gh api rate_limit
```

Then export the conformance configuration, for example:

```bash
export ASDL_GH_CONFORMANCE_REPO=owner/name
export ASDL_GH_CONFORMANCE_GOLDEN_PR=123
export ASDL_GH_CONFORMANCE_GOLDEN_BRANCH=asdl-gh-conformance-golden-pr
export ASDL_GH_CONFORMANCE_GOLDEN_ISSUE_LABEL=asdl-gh-conformance-golden
```

Set `ASDL_GH_CONFORMANCE_ALLOW_MUTATIONS=1` only when intentionally running tests that create or update live GitHub resources.

## Maintainer Checklist

When creating or repairing the conformance repository:

- create or verify the golden label;
- create or verify the golden issue;
- create or verify the golden PR and branch;
- add at least one small changed text file to the golden PR;
- add the golden PR discussion comment, PR review, inline review comment, unresolved thread, and resolved thread needed by the currently enabled tests;
- record the repository, golden PR number, golden branch, and golden issue label in the CI configuration;
- confirm `gh auth status` and `gh api rate_limit` work with the selected token;
- run the read-only conformance slice before enabling mutating tests;
- treat fixture repair as reviewable work when it changes test expectations.

## Open Decisions

These decisions should be made before the first scheduled live run is treated as authoritative:

- canonical repository owner/name;
- repository visibility;
- fixture maintainer or owning team;
- CI token model and exact fine-grained permissions;
- pytest marker/path/command used to select the live suite;
- whether the first mutating tests should clean up successful resources immediately or intentionally leave all resources for early inspection;
- whether merge behavior belongs in the initial conformance repository or requires a separate branch-protection fixture.
