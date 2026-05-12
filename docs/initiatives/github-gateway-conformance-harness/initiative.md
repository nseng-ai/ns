# GitHub Gateway Conformance Harness

## Thesis

Create an opt-in live GitHub conformance suite for the `asdl_core.gh` gateway contracts, backed by an isolated fixture repository, so fake and real gateway implementations can be checked against GitHub's actual `gh` CLI and API behavior without making fast local or pull-request test feedback depend on the network.

## Motivation

GitHub gateway behavior is part of the correctness boundary for PR addressing, review publication, objectives, slots, and other workflows that read or mutate pull requests and issues. The repository already relies heavily on fake-driven tests for business logic and subprocess-shaped real gateway tests for command construction and response parsing. Those tests are fast and should remain the default, but they cannot fully detect drift in GitHub payloads, `gh` CLI behavior, pagination, authentication, rate limits, mutation semantics, or fixture assumptions. A small live conformance harness provides defense in depth by validating the gateway contract against a real, intentionally managed GitHub repository.

## Scope

- The `asdl_core.gh` gateway contracts, real implementations, fake implementations, and public domain result types used by `IssueGateway` and `PRGateway` consumers.
- A dedicated live conformance test entry point that is selected intentionally and excluded from ordinary `just test`, package scenario tests, and default PR CI.
- An isolated GitHub fixture repository with persistent read-only scenario fixtures and ephemeral per-run resources for mutating tests.
- A fixture and runtime configuration contract covering repository selection, authentication, fixture catalog ownership, mutation opt-in, rate-limit expectations, and local preflight checks.
- Shared conformance or parity helpers where they make fake/real contract drift easier to see.
- Scheduled or manually triggered CI that runs the live suite against the fixture repository with least-privilege credentials.
- Documentation for maintainers and developers explaining how to provision fixtures, run the suite, interpret setup failures, and feed legitimate drift findings back into the gateway contract and fakes.

## Non-Goals

- Replacing fake-driven unit, scenario, or gateway tests as the primary development loop.
- Running live GitHub tests on every pull request or every build by default.
- Exercising production repositories, organization settings, broad repository administration, or unrelated GitHub automation.
- Making `asdl_core.gh` depend on non-stdlib runtime packages or parent `asdl_core` utilities.
- Exhaustively testing every GitHub API edge case before the initial harness is useful.
- Requiring the fixture repository to be reset to a pristine state after each run. GitHub history and identifiers are durable, so the repository should be managed rather than rolled back.
- Building comprehensive stale-fixture cleanup before the suite has produced enough evidence about resource growth.

## Constraints

- `asdl_core.gh` remains self-contained, stdlib-only, and extractable; any pytest-specific or repository-fixture helpers should live outside the runtime gateway package.
- Live conformance must be explicitly selected by a runner, marker, path, recipe, or CI workflow. Missing configuration must not accidentally fall through to a developer's ambient GitHub repository.
- Repository targeting must be deliberate. The harness uses a configured `owner/name` repository; when that repo is passed into real gateways, `gh` calls must target it explicitly (`-R` where supported or parsed owner/repo for API calls) rather than relying on incidental current-working-directory state.
- Runtime configuration should stay small. Stable persistent fixture identities should be documented or checked in as a scenario catalog rather than passed as ad hoc one-off environment variables wherever practical.
- Mutating tests must require an explicit mutation opt-in and must operate only on resources marked for the current run.
- Persistent scenario fixtures are read-only. Tests may assert documented public fields for those fixtures, but must not mutate them or rely on global repository counts.
- GitHub REST, GraphQL, and Search have different rate-limit behavior. The suite should stay small, use pagination deliberately, and surface rate-limit/authentication failures clearly.
- CI credentials should be least-privilege for the fixture repository where feasible and must not require broad production repository access.

## Invariants

- Fake implementations stay I/O-free and constructor-configured; the live suite validates the contract but never makes fakes depend on GitHub.
- Business logic continues to test primarily over fakes. Live conformance is final validation and drift detection, not the normal edit-test loop.
- Gateway contract changes update the ABC, real implementation, fake implementation, fake tests, mocked real-sanity tests, and relevant live conformance coverage together.
- Live tests assert stable public gateway behavior and dataclass shapes, not incidental private GitHub payload details.
- The suite is safe to re-run after partial failure. Setup tolerates existing ephemeral resources from previous failed runs.
- Fixture resources are addressed by explicit scenario names, fixture catalog entries, branches, labels, markers, PR numbers, issue numbers, or run ids rather than by repository-wide counts.
- Failures distinguish harness/environment/fixture problems from possible fake/real semantic contract drift whenever practical.

## Completion Criteria

- [x] A fixture and runtime configuration contract is checked in, including persistent scenario fixtures, ephemeral per-run fixture conventions, repository targeting, auth, rate-limit, and local preflight guidance.
- [ ] A canonical isolated GitHub fixture repository is selected or created, with ownership, visibility, credentials, and persistent scenario fixture identities recorded in the appropriate docs or catalog.
- [x] A dedicated opt-in live conformance suite exists and is excluded from ordinary per-build test commands and default PR CI.
- [ ] The initial read-only parity slice validates at least one high-signal `IssueGateway` or `PRGateway` scenario against both fake and real behavior.
- [ ] Mutating coverage exists for at least one safe ephemeral-resource operation and proves the marker/ownership model without touching persistent fixtures.
- [ ] A scheduled or manually triggered GitHub Actions workflow runs the live suite against the fixture repository with appropriate diagnostics and permissions.
- [ ] Local developer instructions explain how to authenticate, select the fixture repository, run read-only and mutating slices, and interpret common setup or rate-limit failures.
- [ ] Existing fake-driven and mocked real-sanity tests remain fast, deterministic, and part of normal `just test` / PR CI.
- [ ] Any fake/real mismatches found while building the harness are fixed or recorded with explicit follow-up.

## Open Questions

- What repository should be the canonical fixture repository, and who owns its ongoing maintenance?
- Should the fixture repository be public or private?
- What CI credential model is acceptable: fine-grained PAT, GitHub App token, `GITHUB_TOKEN` against a repository in the same org, or another mechanism?
- What exact persistent fixture identities should replace the placeholder `pr_basic_lookup` and `issue_list_open_with_label` catalog entries, and which additional catalog fixtures should come next?
- How should the first read-only live scenario be paired with fake behavior: shared helper, paired tests, or another parity pattern?
- Which mutating operations are valuable and safe enough for the first mutation slice: discussion comments, comment updates, reactions, PR reviews, review-thread resolution, or thread replies?
- What additional diagnostics are needed to keep setup, fixture, rate-limit, and semantic drift failures actionable in scheduled runs?
- When should stale ephemeral fixture cleanup be added, and should successful mutating runs clean up immediately or leave early resources for inspection?
