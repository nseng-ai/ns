# GitHub Gateway Conformance Harness

## Thesis

Build a checked-in live GitHub conformance harness that exercises the `asdl_core.gh` gateway contracts against a real, isolated GitHub test repository so the fake and real implementations can be kept behaviorally aligned over time. The conformance suite should complement the existing fake-driven and subprocess-mocked gateway tests by validating the external GitHub behaviors that cannot be represented confidently in local tests alone.

## Motivation

The GitHub gateway layer is a critical dependency for PR-addressing, reviewer publication, objectives, slots, and other workflows that read or mutate GitHub state. Today the fake implementations power most business-logic tests, while the real gateway tests monkeypatch `subprocess.run` to cover command construction and parsing. That keeps ordinary CI fast, but it can miss drift in GitHub API payloads, `gh` CLI behavior, pagination, authentication, and mutation semantics. A nightly live-repository conformance suite provides defense in depth: it can catch fake/real contract divergence before users discover it in live PR workflows.

## Scope

- The `asdl_core.gh` gateway layer, especially `IssueGateway` / `RealIssueGateway` / `FakeIssueGateway` and `PRGateway` / `RealPRGateway` / `FakePRGateway`.
- A real GitHub test repository with controlled issues, branches, pull requests, reviews, review comments, discussion comments, reactions, and review threads as needed by the gateway surface.
- A dedicated conformance test entry point that is not part of ordinary per-build test execution and can run the same contract-oriented scenarios against fake implementations and real implementations where practical.
- CI wiring for a scheduled or manually triggered conformance job that is separate from ordinary PR CI.
- Test-harness documentation describing required secrets, repository setup, fixture lifecycle, rate-limit expectations, and how to run or skip the suite locally.
- A managed test-repository fixture model with:
  - persistent golden fixtures: stable read-only issues, PRs, branches, comments, and reviews that tests never mutate;
  - ephemeral per-run fixtures: uniquely marked resources created by mutating tests and touched only by the run that created them.
- Feedback from the live harness into fake behavior when a legitimate fake/real mismatch is found.

## Non-Goals

- Replacing fast fake-driven scenario tests or mocked real-sanity tests in normal CI.
- Running live GitHub mutation tests on every pull request or every build by default.
- Broad GitHub automation outside the gateway contract, such as managing production repositories, arbitrary organization settings, or unrelated `gh` workflows.
- Adding runtime dependencies to `asdl_core.gh`; that subpackage remains stdlib-only and extractable.
- Testing every GitHub API edge case exhaustively in the first pass. The initial harness should prove the shape and cover the highest-risk gateway operations first.
- Fully resetting the GitHub test repository to a pristine initial state after each run. GitHub history is durable and some resource identifiers are monotonic, so the repository should be managed rather than rolled back.
- Designing comprehensive stale-fixture cleanup in the first pass. Cleanup can be added later after the fixture lifecycle is understood.

## Constraints

- `asdl_core.gh` must remain self-contained, stdlib-only, and free of imports from parent `asdl_core` utilities.
- The conformance harness must be opt-in for developers and scheduled for CI so network, auth, rate-limit, and GitHub availability failures do not destabilize fast PR feedback.
- The conformance suite must have an explicit runner, marker, path, or workflow that prevents ordinary per-build test commands from invoking it accidentally.
- The real gateways are backed by the `gh` CLI and currently inherit repository context from the process environment/current working directory. The harness must make repository selection explicit and safe, either through a temporary checkout, `GH_REPO`, or a documented supported mechanism.
- GitHub REST, GraphQL, and Search have separate rate-limit behavior. The suite should be small, paginated deliberately, and able to surface rate-limit/auth failures clearly.
- Mutating tests must use an isolated test repository, unique fixture names or markers, and idempotent setup so repeated nightly runs do not depend on global repository counts or pristine state.
- Persistent golden fixtures must be treated as read-only. Ephemeral per-run fixtures may accumulate closed issues, PRs, comments, or branches until a later cleanup mechanism exists.
- Secrets used by scheduled CI must be least-privilege for the test repository where feasible, and the harness must not require broad production repository access.

## Invariants

- Fake implementations stay I/O-free and constructor-configured; the live GitHub harness validates the contract but does not make fakes depend on GitHub.
- Business logic continues to test primarily over fakes. Live GitHub conformance tests are final validation, not the primary development loop.
- Gateway contract changes update the ABC, real implementation, fake implementation, fake tests, mocked real-sanity tests, and relevant conformance coverage together.
- Conformance tests must be safe to re-run after partial failure; setup should tolerate existing resources from previous failed runs.
- Real tests should assert stable contract behavior and public result shapes, not incidental private GitHub payload details.
- Tests should address fixture resources by explicit branch names, labels, markers, PR numbers, or other stable identifiers rather than asserting global repository state.
- Failures should distinguish harness/environment problems from actual fake/real contract drift whenever possible.

## Completion Criteria

- [ ] A documented GitHub test repository exists with persistent golden fixtures and ephemeral per-run fixture conventions for read-only and mutating gateway operations.
- [ ] A dedicated opt-in live GitHub conformance suite covers the initial contract surface for `IssueGateway` and `PRGateway` without running in ordinary per-build test commands.
- [ ] The suite includes parity-oriented assertions or shared contract helpers that make fake/real drift visible.
- [ ] A scheduled or manually triggered GitHub Actions workflow runs the conformance suite against the test repository with appropriate secrets and permissions.
- [ ] Local developer instructions explain how to configure auth, select the test repo, run the suite, and interpret common auth/rate-limit/environment failures.
- [ ] Existing fake and mocked real-sanity tests remain fast, deterministic, and part of normal `just test` / PR CI.
- [ ] Any fake/real mismatches found while building the harness are either fixed or recorded with explicit follow-up.

## Open Questions

- What repository should serve as the canonical GitHub test repo, and who owns its fixture lifecycle?
- What exact path, pytest marker, or command convention should identify live GitHub conformance tests while keeping them out of ordinary per-build test runs?
- Which resources belong in the persistent golden fixture set, and which should be created ephemerally per run?
- What naming or marker convention should ephemeral resources use so future cleanup can identify stale resources without affecting golden fixtures?
- What CI secret/token model is acceptable: repository-scoped fine-grained PAT, GitHub App token, or another mechanism?
- Which gateway operations are safe and valuable enough for the first nightly suite, especially thread resolution, unresolution, reactions, and inline review creation?
- Should the real gateway gain explicit repository/cwd injection before the harness, or is process-level `GH_REPO` / temporary checkout context sufficient?
- How should the suite report environment failures versus semantic contract failures so nightly noise stays actionable?
