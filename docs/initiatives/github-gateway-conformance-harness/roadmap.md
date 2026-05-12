# Roadmap

## Completed

- No completed roadmap areas yet.

## In Progress

- [ ] Define the test-repository fixture contract.
  - Deliverable: Documentation describing the canonical test repository, persistent golden fixtures, ephemeral per-run fixtures, naming/marker conventions, and ownership.
  - Status: Initial operating contract added in `docs/github-gateway-conformance-fixtures.md`; still needs the canonical repository, visibility, owner, CI token model, and actual golden fixtures to be selected or verified.
  - Notes: The repository should be managed over time, not rolled back to a pristine initial state. Persistent golden fixtures are read-only and stable. Mutating tests create uniquely marked per-run resources; comprehensive stale-resource cleanup can come later.

## Remaining

- [ ] Establish the opt-in live conformance spine.
  - Deliverable: Initial live GitHub conformance test module, pytest marker/path convention, environment guards, and a documented local command.
  - Includes:
    - Select the explicit entry point for live conformance tests.
    - Ensure missing `gh`, auth, repo config, or golden fixture config skips or fails clearly.
    - Keep the suite out of ordinary `just test` / PR CI.
    - Document local operation and basic failure triage.

- [ ] Prove the first read-only fake/real parity slice.
  - Deliverable: Shared contract helper or paired tests that compare public gateway result shapes for one golden issue or PR scenario.
  - Includes:
    - Load `ASDL_GH_CONFORMANCE_*` configuration.
    - Seed a matching fake fixture for the same scenario.
    - Exercise a small high-signal read-only surface, such as golden PR lookup, changed files, comments, reviews, or golden issue listing.
    - Classify failures as setup/auth/fixture problems versus fake/real contract drift.

- [ ] Add safe mutation coverage with ephemeral fixtures.
  - Deliverable: Mutating conformance cases that create uniquely marked resources and never touch golden fixtures.
  - Includes:
    - Generate and propagate a per-run marker.
    - Create ephemeral issues, branches, and PRs as needed.
    - Cover comments, comment updates, reactions, and PR reviews first.
    - Add review-thread resolution and replies only after fixture setup is reliable.
    - Leave cleanup optional until resource growth is understood.

- [ ] Wire scheduled/manual CI for the live suite.
  - Deliverable: GitHub Actions workflow that runs only the conformance entry point on a schedule or `workflow_dispatch`.
  - Includes:
    - Configure the selected test repository and golden fixture environment variables.
    - Use least-privilege credentials for the conformance repository.
    - Emit clear diagnostics for auth, rate limit, missing fixture, and semantic drift failures.
    - Keep default PR CI unchanged.

- [ ] Expand conformance coverage and drift visibility.
  - Deliverable: Broader gateway contract coverage plus a concise fake/real coverage report.
  - Includes:
    - Add cases for review threads, pagination boundaries, null authors, closed or merged PR lookup, changed-file edge cases, and safe merge behavior.
    - Track which gateway methods have fake coverage, mocked real-sanity coverage, and live conformance coverage.
    - Feed legitimate drift findings back into fake behavior and gateway contract tests.

- [ ] Add operational maintenance once the harness has run for a while.
  - Deliverable: Cleanup and ergonomics improvements informed by observed suite behavior.
  - Includes:
    - Add stale ephemeral fixture cleanup by marker, branch, title, or label.
    - Improve explicit repository, cwd, or environment injection if the harness exposes friction.
    - Preserve `asdl_core.gh` stdlib-only and extractability constraints.

## Parked

- Running live GitHub conformance tests on every pull request or every build is deferred unless the suite becomes fast, reliable, and cheap enough to justify the signal.
- Exercising production repositories is out of scope; use an isolated test repository instead.
- Full repository rollback is rejected as the default model because GitHub history and identifiers are durable. Manage fixture growth with stable read-only fixtures, per-run markers, and later cleanup instead.
- Broad GitHub API benchmarking or load testing is deferred; the goal is contract confidence, not throughput analysis.
