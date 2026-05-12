# GitHub Gateway Conformance Fixture Contract

## Status

Initial operating contract for the `github-gateway-conformance-harness` initiative.

The canonical GitHub repository has not been selected yet. Until it is selected, this document defines the repository shape, fixture lifecycle, fixture catalog model, and runtime configuration boundary that the first live conformance tests target.

## Purpose

The live GitHub conformance suite validates the public `asdl_core.gh` gateway contracts against a real, isolated GitHub repository. This document tells test authors, repository maintainers, CI authors, and future agents what repository state tests may rely on and what state tests may mutate.

The fixture contract is intentionally separate from test implementation. It should be stable enough that:

- a maintainer can create or repair the test repository without reading gateway internals;
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

## Runtime Configuration Boundary

Runtime configuration stays small and explicit. It answers only:

- should live tests run;
- which repository should they target;
- are mutating tests allowed;
- what run id should ephemeral resources use.

Primary configuration is pytest options:

```bash
uv run pytest packages/asdl-core/live_conformance/github \
  --run-live-github \
  --github-conformance-repo owner/asdl-gh-conformance
```

The repo also provides a convenience recipe for the read-only slice:

```bash
just live-github-readonly owner/asdl-gh-conformance
```

Optional environment fallback exists only at the pytest boundary:

| Variable                              | Meaning                                                                                  |
| ------------------------------------- | ---------------------------------------------------------------------------------------- |
| `ASDL_GH_CONFORMANCE_REPO`            | GitHub repository in `owner/name` form, used when `--github-conformance-repo` is absent. |
| `ASDL_GH_CONFORMANCE_ALLOW_MUTATIONS` | Set to `1` to allow tests marked `live_github_mutating`.                                 |
| `ASDL_GH_CONFORMANCE_RUN_ID`          | Caller-provided unique run id. If absent, the harness generates one per test run.        |

Do not require scenario fixture identities as runtime parameters. In particular, do not add or depend on singular golden-fixture variables such as:

- `ASDL_GH_CONFORMANCE_GOLDEN_PR`
- `ASDL_GH_CONFORMANCE_GOLDEN_BRANCH`
- `ASDL_GH_CONFORMANCE_GOLDEN_ISSUE_LABEL`

Persistent fixture identities live in checked-in fixture catalog code. Runtime gateway code must not read `ASDL_GH_CONFORMANCE_*` variables.

Authentication uses normal `gh` mechanisms:

- local runs: `gh auth status` should show an authenticated account with access to the configured repository;
- CI runs: provide a least-privilege token through `GH_TOKEN` or the workflow's selected authentication mechanism.

The exact CI token model is a repository-owner decision. A fine-grained PAT or GitHub App token should be scoped to the conformance repository only where feasible. Expected permissions are at least metadata read, issues read/write, pull requests read/write, and contents read/write for ephemeral branches and commits.

## Fixture Classes

The repository contains two fixture classes:

1. **Persistent scenario fixtures** — stable, read-only resources created once and maintained deliberately.
2. **Ephemeral per-run fixtures** — uniquely marked resources created by mutating tests and owned by the run that created them.

Tests must never mutate persistent scenario fixtures. Mutating tests must create their own ephemeral resources and address them by run marker, branch prefix, PR number, issue number, or comment id captured during that run.

## Persistent Scenario Fixture Catalog

Persistent fixtures provide safe read-only targets for parity tests. They are named by scenario and checked into the live conformance fixture catalog with the identifiers and expected initial state needed by that scenario.

Examples of scenario names:

- `pr_basic_lookup`
- `pr_changed_files_text`
- `pr_discussion_comments`
- `pr_reviews`
- `pr_review_threads_mixed_resolution`
- `issue_list_open_with_label`
- `closed_pr_lookup`
- `merged_pr_lookup`
- `null_author_comment`
- `pagination_boundary_comments`

The first catalog slice may contain placeholders until the canonical repository is provisioned, but the model remains the same: update checked-in fixture definitions when fixture identities change. Do not add ad hoc environment variables for one-off PR numbers, branch names, or labels.

### Catalog Entry Expectations

A pull request fixture records, at minimum:

- scenario name;
- PR number;
- head branch;
- expected lifecycle state (`OPEN`, `CLOSED`, or `MERGED`);
- expected title prefix;
- optional changed file paths required by that scenario.

An issue-list fixture records, at minimum:

- scenario name;
- label;
- expected issue state;
- expected title prefix.

Persistent fixtures should be small, boring, and intentionally stable. If a fixture must change, update the fixture catalog and this contract in the same review when the contract changes.

## Ephemeral Per-Run Fixtures

Mutating tests own only resources that carry their run marker. The marker must appear in every created issue body, PR body, comment body, review body, or other mutable text field that GitHub preserves.

Use this marker form:

```text
<!-- asdl-gh-conformance run:<run-id> purpose:<purpose> -->
```

Generate `<run-id>` once per live-test run. Recommended format:

```text
YYYYMMDDTHHMMSSZ-<short-random-hex>
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

- mutate persistent scenario issues, PRs, branches, comments, reviews, or review threads;
- operate on any repository other than the configured conformance repository;
- depend on global issue, PR, comment, reaction, or review counts;
- change repository settings, branch protection, secrets, collaborators, webhooks, Actions settings, or organization settings;
- create broad or unbounded API scans outside the configured repository;
- require the repository to be reset to a pristine state after each run.

## Test Author Expectations

Conformance tests should assert gateway contract behavior and public dataclass shapes, not incidental GitHub payload details.

Prefer assertions like:

- the `pr_basic_lookup` branch lookup returns the cataloged PR number and lifecycle state;
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

Environment and fixture failures should be reported separately from semantic failures. Missing `gh`, missing repository configuration, failed authentication, missing permissions, rate-limit exhaustion, unreachable repositories, and absent persistent fixtures are harness/setup failures. A real gateway result that differs from the fake for the same documented scenario is a possible contract-drift failure.

## Local Preflight Checklist

Before running live conformance tests locally:

```bash
gh --version
gh auth status
gh api rate_limit
```

Then run the read-only conformance slice, for example:

```bash
uv run pytest packages/asdl-core/live_conformance/github \
  --run-live-github \
  --github-conformance-repo owner/asdl-gh-conformance
```

or:

```bash
just live-github-readonly owner/asdl-gh-conformance
```

Set `ASDL_GH_CONFORMANCE_ALLOW_MUTATIONS=1` or pass `--github-conformance-allow-mutations` only when intentionally running tests that create or update live GitHub resources.

## Maintainer Checklist

When creating or repairing the conformance repository:

- create or verify every persistent scenario fixture named by the checked-in fixture catalog;
- keep fixture PR numbers, branches, labels, states, and title prefixes in sync with the catalog;
- add scenario-specific comments, reviews, changed files, or review threads only when the catalog/test slice requires them;
- confirm `gh auth status` and `gh api rate_limit` work with the selected token;
- run the preflight tests before treating semantic conformance failures as gateway drift;
- run the read-only conformance slice before enabling mutating tests;
- treat fixture repair as reviewable work when it changes checked-in expectations.

## Open Decisions

These decisions should be made before the first scheduled live run is treated as authoritative:

- canonical repository owner/name;
- repository visibility;
- fixture maintainer or owning team;
- CI token model and exact fine-grained permissions;
- exact persistent fixture identifiers for the first fully provisioned catalog;
- whether the first mutating tests should clean up successful resources immediately or intentionally leave all resources for early inspection;
- whether merge behavior belongs in the initial conformance repository or requires a separate branch-protection fixture.
