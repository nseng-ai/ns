# Roadmap

## Now

- [ ] Define the test-repository fixture contract.
  - Artifact: Documentation describing the canonical test repository, persistent golden fixtures, ephemeral per-run fixtures, naming/marker conventions, and ownership.
  - Notes: The repository should be managed over time, not rolled back to a pristine initial state. Persistent golden fixtures are read-only and stable. Mutating tests create uniquely marked per-run resources; comprehensive stale-resource cleanup can come later.

- [ ] Establish the opt-in conformance test entry point.
  - Artifact: Initial live GitHub conformance test module plus pytest markers, path conventions, or environment guards that skip clearly when real GitHub configuration is absent and stay out of ordinary per-build test commands.
  - Notes: Avoid the overloaded “integration test” name. The suite should be selected intentionally by nightly CI, manual CI, or a documented local command.

- [ ] Prove one read-only fake/real parity slice.
  - Artifact: A small shared contract helper or paired tests that assert the same public gateway result shape against `FakePRGateway` / `FakeIssueGateway` and `RealPRGateway` / `RealIssueGateway` for a persistent golden fixture PR.
  - Notes: This first slice should flush out repository-context, authentication, pagination, and `gh` CLI assumptions before adding mutation coverage.

## Next

- [ ] Add safe mutation coverage with ephemeral fixtures.
  - Artifact: Conformance tests for comments, comment updates, reactions, and PR reviews using unique per-run markers.
  - Notes: Mutations should not touch golden fixtures or rely on global repository counts. Inline review/thread operations may need special fixture setup before they are reliable.

- [ ] Wire the nightly GitHub Actions conformance job.
  - Artifact: Scheduled/manual workflow that installs the existing toolchain, configures the test repo token, runs only the live GitHub conformance suite, and emits clear failure diagnostics.
  - Notes: Keep permissions least-privilege and avoid adding these tests to default PR CI.

- [ ] Document local operation and failure triage.
  - Artifact: Developer docs covering `gh auth status`, token scopes, repository selection, rate-limit checks, common failures, fixture expectations, and when to update fakes.

## Later

- [ ] Expand coverage across the full gateway surface.
  - Artifact: Additional conformance tests or contract cases for review thread resolution/unresolution, thread replies, pagination boundaries, null authors, large or binary changed files, merged/closed PR lookup, and merge command behavior where safe.

- [ ] Add stale fixture cleanup once resource growth is understood.
  - Artifact: A cleanup command, script, or scheduled janitor step that finds stale ephemeral resources by marker and safely closes/deletes what GitHub permits.
  - Notes: Cleanup should be designed after observing how the fixture repository grows; it is not required for the initial conformance harness.

- [ ] Improve gateway ergonomics if the harness exposes friction.
  - Artifact: Focused PRs that add explicit repository/cwd/env injection or shared `gh` invocation helpers without violating `asdl_core.gh` stdlib-only/extractability rules.

- [ ] Add parity reporting for fake drift.
  - Artifact: A concise report or assertion structure that maps each gateway method to fake coverage, mocked real-sanity coverage, and live GitHub conformance coverage.

## Parked

- Running live GitHub conformance tests on every pull request or every build is deferred unless the suite becomes fast, reliable, and cheap enough to justify the signal.
- Exercising production repositories is out of scope; use an isolated test repository instead.
- Full repository rollback is rejected as the default model because GitHub history and identifiers are durable. Manage fixture growth with stable read-only fixtures, per-run markers, and later cleanup instead.
- Broad GitHub API benchmarking or load testing is deferred; the goal is contract confidence, not throughput analysis.
