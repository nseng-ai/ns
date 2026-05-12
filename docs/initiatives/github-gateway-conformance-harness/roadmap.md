# Roadmap

## Completed

- Define the fixture and runtime configuration contract.
  - Evidence: `docs/github-gateway-conformance-fixtures.md` documents the dedicated repository contract, pytest/runtime configuration boundary, checked-in persistent fixture catalog model, ephemeral run markers, mutation opt-in, authentication, rate-limit preflight, maintainer checklist, and open operating decisions.

- Make live conformance and real gateway calls target an explicit repository.
  - Evidence: `RealPRGateway` and `RealIssueGateway` accept an optional `owner/name` repo; shared `gh` helpers pass `-R` where supported; GraphQL and REST helpers parse the configured repo instead of relying on ambient `gh repo view`; gateway tests cover the explicit-repo command shapes.

- Establish the opt-in live conformance spine for read-only runs.
  - Evidence: `packages/asdl-core/live_conformance/github/` provides pytest options, config validation, preflight checks, fixture catalog types, a repository-targeted `gh` wrapper, and a first live read-only PR lookup test. `pyproject.toml` registers `live_github` markers, `justfile` exposes `just live-github-readonly <repo>`, and live tests are skipped unless `--run-live-github` is supplied.

## In Progress

- [ ] Prove the first read-only fake/real parity slice.
  - Artifact: Shared contract helper or paired tests that exercise the same documented scenario against a fake gateway and the real gateway pointed at the fixture repository.
  - Status: The real-side `PRGateway.get_pr_for_branch` live check exists for the `pr_basic_lookup` scenario, with setup failures classified through preflight checks. Remaining work is to provision real fixture identifiers, add the fake-side or shared parity assertion, and run the slice against the canonical repository.

## Remaining

- [ ] Provision the canonical conformance repository and first persistent scenario fixtures.
  - Artifact: A dedicated GitHub repository plus recorded owner/name, visibility, maintainer, credential model, and persistent fixture identities needed by the first read-only slice.
  - Notes: Start by replacing the placeholder `pr_basic_lookup` and `issue_list_open_with_label` catalog identifiers with real fixtures. Add comments, reviews, review threads, closed/merged PRs, and pagination fixtures only when tests need them.

- [ ] Add safe mutation coverage with ephemeral fixtures.
  - Artifact: Mutating live conformance cases that create uniquely marked resources, touch only resources owned by the current run, and verify returned public gateway objects.
  - Notes: Start with discussion comments, comment updates, reactions, or PR reviews. Add review-thread resolution and replies only after ephemeral PR/review-thread setup is reliable.

- [ ] Wire scheduled or manual CI for the live suite.
  - Artifact: GitHub Actions workflow that runs only the conformance entry point on a schedule or `workflow_dispatch` with the chosen repository and credentials.
  - Notes: Keep default PR CI unchanged. Diagnostics should make auth, rate-limit, fixture, and semantic drift failures easy to distinguish.

- [ ] Expand conformance coverage and drift visibility.
  - Artifact: Broader gateway contract coverage plus a concise map of fake coverage, mocked real-sanity coverage, and live conformance coverage.
  - Notes: Add scenarios for review threads, deleted/null authors, discussion comments, inline review comments, pagination boundaries, closed or merged PR lookup, changed-file edge cases, and safe merge behavior when the fixture model supports them.

- [ ] Add operational maintenance after observing real runs.
  - Artifact: Cleanup and ergonomics improvements informed by actual fixture repository growth and run failures.
  - Notes: Candidates include stale ephemeral-resource cleanup by marker/branch/title/label, better repository-targeting ergonomics, and clearer failure reports. Preserve the `asdl_core.gh` stdlib-only and extractability boundary.

## Parked

- Running live GitHub conformance tests on every pull request or every build is deferred unless the suite becomes fast, reliable, and cheap enough to justify the signal.
- Exercising production repositories is out of scope; the suite should use an isolated fixture repository.
- Full fixture repository rollback is rejected as the default lifecycle model because GitHub history and identifiers are durable.
- Broad GitHub API benchmarking or load testing is deferred; the goal is contract confidence, not throughput analysis.
