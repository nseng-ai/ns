# GitHub Gateway Integration Harness

## Thesis

Build a checked-in integration testing harness that exercises the `asdl_core.gh` gateway contracts against a real, isolated GitHub test repository so the fake and real implementations can be kept behaviorally aligned over time. The harness should complement the existing fake-driven and subprocess-mocked gateway tests by validating the external GitHub behaviors that cannot be represented confidently in local tests alone.

## Motivation

The GitHub gateway layer is a critical dependency for PR-addressing, reviewer publication, objectives, slots, and other workflows that read or mutate GitHub state. Today the fake implementations power most business-logic tests, while the real gateway tests monkeypatch `subprocess.run` to cover command construction and parsing. That keeps ordinary CI fast, but it can miss drift in GitHub API payloads, `gh` CLI behavior, pagination, authentication, and mutation semantics. A nightly real-repository harness provides defense in depth: it can catch fake/real contract divergence before users discover it in live PR workflows.

## Scope

- The `asdl_core.gh` gateway layer, especially `IssueGateway` / `RealIssueGateway` / `FakeIssueGateway` and `PRGateway` / `RealPRGateway` / `FakePRGateway`.
- A real GitHub test repository with controlled issues, branches, pull requests, reviews, review comments, discussion comments, reactions, and review threads as needed by the gateway surface.
- Integration tests under the appropriate package test layout, likely `packages/asdl-core/tests/integration/`, that can run the same contract-oriented scenarios against fake implementations and real implementations where practical.
- CI wiring for a scheduled or manually triggered integration job that is separate from ordinary PR CI.
- Test-harness documentation describing required secrets, repository setup, fixture lifecycle, cleanup, rate-limit expectations, and how to run or skip the suite locally.
- Feedback from the real harness into fake behavior when a legitimate fake/real mismatch is found.

## Non-Goals

- Replacing fast fake-driven scenario tests or mocked real-sanity tests in normal CI.
- Running real GitHub mutation tests on every pull request by default.
- Broad GitHub automation outside the gateway contract, such as managing production repositories, arbitrary organization settings, or unrelated `gh` workflows.
- Adding runtime dependencies to `asdl_core.gh`; that subpackage remains stdlib-only and extractable.
- Testing every GitHub API edge case exhaustively in the first pass. The initial harness should prove the shape and cover the highest-risk gateway operations first.

## Constraints

- `asdl_core.gh` must remain self-contained, stdlib-only, and free of imports from parent `asdl_core` utilities.
- The integration harness must be opt-in for developers and scheduled for CI so network, auth, rate-limit, and GitHub availability failures do not destabilize fast PR feedback.
- Ordinary `just test` currently ignores `*/integration/*`; any nightly workflow should intentionally select the real GitHub integration suite.
- The real gateways are backed by the `gh` CLI and currently inherit repository context from the process environment/current working directory. The harness must make repository selection explicit and safe, either through a temporary checkout, `GH_REPO`, or a documented supported mechanism.
- GitHub REST, GraphQL, and Search have separate rate-limit behavior. The suite should be small, paginated deliberately, and able to surface rate-limit/auth failures clearly.
- Mutating tests must use an isolated test repository, unique fixture names, idempotent setup, and reliable cleanup so repeated nightly runs do not accumulate unbounded issues, branches, comments, or PRs.
- Secrets used by scheduled CI must be least-privilege for the test repository where feasible, and the harness must not require broad production repository access.

## Invariants

- Fake implementations stay I/O-free and constructor-configured; the real GitHub harness validates the contract but does not make fakes depend on GitHub.
- Business logic continues to test primarily over fakes. Real GitHub integration tests are final validation, not the primary development loop.
- Gateway contract changes update the ABC, real implementation, fake implementation, fake tests, mocked real-sanity tests, and relevant integration coverage together.
- Integration tests must be safe to re-run after partial failure; setup and cleanup should tolerate existing resources from previous failed runs.
- Real tests should assert stable contract behavior and public result shapes, not incidental private GitHub payload details.
- Failures should distinguish harness/environment problems from actual fake/real contract drift whenever possible.

## Completion Criteria

- [ ] A documented GitHub test repository exists with the minimum fixture strategy needed for read-only and mutating gateway operations.
- [ ] `packages/asdl-core/tests/integration/` contains an opt-in real GitHub gateway suite covering the initial contract surface for `IssueGateway` and `PRGateway`.
- [ ] The suite includes parity-oriented assertions or shared contract helpers that make fake/real drift visible.
- [ ] A scheduled or manually triggered GitHub Actions workflow runs the integration suite against the test repository with appropriate secrets and permissions.
- [ ] Local developer instructions explain how to configure auth, select the test repo, run the suite, and interpret common auth/rate-limit/environment failures.
- [ ] Existing fake and mocked real-sanity tests remain fast, deterministic, and part of normal `just test` / PR CI.
- [ ] Any fake/real mismatches found while building the harness are either fixed or recorded with explicit follow-up.

## Open Questions

- What repository should serve as the canonical GitHub test repo, and who owns its fixture lifecycle?
- Should the first harness use an existing persistent fixture PR, create fresh ephemeral PRs per run, or combine both approaches?
- What CI secret/token model is acceptable: repository-scoped fine-grained PAT, GitHub App token, or another mechanism?
- Which gateway operations are safe and valuable enough for the first nightly suite, especially thread resolution, unresolution, reactions, and inline review creation?
- Should the real gateway gain explicit repository/cwd injection before the harness, or is process-level `GH_REPO` / temporary checkout context sufficient?
- How should the suite report environment failures versus semantic contract failures so nightly noise stays actionable?
