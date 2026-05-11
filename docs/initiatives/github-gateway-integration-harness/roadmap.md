# Roadmap

## Now

- [ ] Define the test-repository fixture contract.
  - Artifact: Documentation or setup script describing the canonical test repository, required branches/PRs/issues/comments/reviews, naming conventions, ownership, and cleanup policy.
  - Notes: Start with the smallest fixture set that can validate `PRGateway.get_pr_for_branch`, issue listing, discussion comments, changed files, review comments, and review summaries before taking on higher-risk mutations.

- [ ] Establish the opt-in integration test entry point.
  - Artifact: Initial `packages/asdl-core/tests/integration/` test module plus pytest markers or environment guards that skip clearly when real GitHub configuration is absent.
  - Notes: Preserve the current fast path where `just test` ignores integration tests; the real suite should be selected intentionally by nightly CI or a documented local command.

- [ ] Prove one read-only fake/real parity slice.
  - Artifact: A small shared contract helper or paired tests that assert the same public gateway result shape against `FakePRGateway` / `FakeIssueGateway` and `RealPRGateway` / `RealIssueGateway` for an existing fixture PR.
  - Notes: This first slice should flush out repository-context, authentication, pagination, and `gh` CLI assumptions before adding mutation coverage.

## Next

- [ ] Add safe mutation coverage.
  - Artifact: Integration tests for comments, comment updates, reactions, and PR reviews with unique markers and cleanup.
  - Notes: Mutations should be idempotent and safe after partial failure. Inline review/thread operations may need special fixture setup before they are reliable.

- [ ] Wire the nightly GitHub Actions job.
  - Artifact: Scheduled/manual workflow that installs the existing toolchain, configures the test repo token, runs only the GitHub integration suite, and emits clear failure diagnostics.
  - Notes: Keep permissions least-privilege and avoid adding these tests to default PR CI.

- [ ] Document local operation and failure triage.
  - Artifact: Developer docs covering `gh auth status`, token scopes, repository selection, rate-limit checks, common failures, cleanup, and when to update fakes.

## Later

- [ ] Expand coverage across the full gateway surface.
  - Artifact: Additional integration tests or contract cases for review thread resolution/unresolution, thread replies, pagination boundaries, null authors, large or binary changed files, merged/closed PR lookup, and merge command behavior where safe.

- [ ] Improve gateway ergonomics if the harness exposes friction.
  - Artifact: Focused PRs that add explicit repository/cwd/env injection or shared `gh` invocation helpers without violating `asdl_core.gh` stdlib-only/extractability rules.

- [ ] Add parity reporting for fake drift.
  - Artifact: A concise report or assertion structure that maps each gateway method to fake coverage, mocked real-sanity coverage, and real GitHub integration coverage.

## Parked

- Running real GitHub integration tests on every pull request is deferred unless the suite becomes fast, reliable, and cheap enough to justify the signal.
- Exercising production repositories is out of scope; use an isolated test repository instead.
- Broad GitHub API benchmarking or load testing is deferred; the goal is contract confidence, not throughput analysis.
