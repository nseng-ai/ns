# Roadmap

## Completed

- None yet.

## In Progress

- None currently identified in this branch.

## Remaining

- [ ] Define the fixture and runtime configuration contract.
  - Artifact: Checked-in documentation, and preferably a small fixture catalog shape, describing the conformance repository contract, persistent scenario fixtures, ephemeral per-run markers, repository selection, mutation opt-in, authentication, rate-limit expectations, and local preflight checks.
  - Notes: This should be the next piece of work because it constrains every later test and CI artifact. Avoid relying on a developer's ambient `gh` repository context or a growing list of one-off fixture environment variables.

- [ ] Provision the canonical conformance repository and first persistent scenario fixtures.
  - Artifact: A dedicated GitHub repository plus recorded owner/name, visibility, maintainer, credential model, and persistent fixture identities needed by the first read-only slice.
  - Notes: Start with boring fixtures such as a stable open PR branch lookup scenario and an issue-list-by-label scenario. Add comments, reviews, review threads, closed/merged PRs, and pagination fixtures only when tests need them.

- [ ] Establish the opt-in live conformance spine.
  - Artifact: A dedicated live test path, pytest marker or option, preflight/config handling, explicit repository targeting, and a documented local command or `just` recipe.
  - Notes: The spine must skip or fail clearly for missing `gh`, missing auth, missing repository configuration, inaccessible fixtures, or disallowed mutations, and it must stay out of ordinary `just test` and default PR CI.

- [ ] Prove the first read-only fake/real parity slice.
  - Artifact: Shared contract helper or paired tests that exercise the same documented scenario against a fake gateway and the real gateway pointed at the fixture repository.
  - Notes: Good first candidates are PR branch lookup, issue listing by label, or changed-file metadata. The slice should classify fixture/setup failures separately from possible fake/real contract drift.

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
