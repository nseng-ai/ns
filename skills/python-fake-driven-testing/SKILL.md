---
name: python-fake-driven-testing
description: "Python fake-driven testing architecture. Use when writing or reviewing tests for code with external dependencies, gateway interfaces, fakes, or mock-to-fake conversion."
---

# python-fake-driven-testing

Use for Python testing architecture: gateway interfaces, real/fake
implementations, fake-driven feature tests, mock-to-fake conversion, and
defense-in-depth test coverage.

This skill owns architecture. For on-disk test placement, use
`python-fake-driven-test-layout`; when path guidance conflicts, that skill wins.
For pytest mechanics, use `pytest`. For Python implementation style, use
`dignified-python`.

## Core Model

- Gateway layer: thin capability-shaped wrappers around external state or APIs
  such as databases, git, HTTP APIs, message queues, or filesystems.
- Gateway trio: define an ABC/interface, a Real implementation, and an
  in-memory Fake implementation.
- DI boundary: only gateways get fakes; business logic above gateways runs for
  real in tests.
- Keep gateways narrow. Prefer names like `GitCli`, `NpxSkillsClient`,
  `ProjectManifestStore`, or `EnvLayoutStore`; avoid mechanism-shaped gateways
  like `FileSystemGateway`, `SubprocessGateway`, or `HttpClient`.
- Put complexity in business logic, not gateway classes.

## Test Layers

- Layer 1 `fake-check`: tests of fake-specific behavior. Write when adding or
  changing fakes. Location: `tests/gateways/test_fakes.py`.
- Layer 2 `real-sanity`: fast tests of real implementations with mocked
  external systems. Write when adding or changing real gateways. Location:
  `tests/gateways/test_real_gateways.py`.
- Layer 3 `pure`: unit tests for utilities with zero dependencies, no fakes, no
  mocks. Location: `tests/unit/`.
- Layer 4 `logic`: business logic and top-level workflows tested over in-memory
  fakes. This is the default for features and bug fixes. Location:
  `tests/scenario/` for end-to-end workflows or `tests/unit/` for narrow logic.
- Layer 5 `smoke`: critical workflows over real systems, used sparingly.
  Location: `tests/integration/`.
- Layer 6 `conformance`: optional shared gateway contract tests that every
  implementation must pass. Heavyweight infrastructure (factory fixtures,
  per-implementation parametrization, opt-in live credentials). Adopt only
  when fake/real parity is high-value enough to justify the cost — many
  gateways will never need this layer. Location: `tests/conformance/`.

If a test imports a `Fake*`, it is Layer 4 `logic`, not Layer 3 `pure`.

## Scenario Tests

Use a fast scenario test for CLIs, top-level workflows, or any feature that
coordinates multiple gateways.

Required shape:

1. Arrange initial state in in-memory fakes.
2. Act exactly once through the real user-facing entry point, usually
   `click.testing.CliRunner` for Click commands.
3. Assert exit code, user-visible output, stable fake post-state, then public
   mutation-tracking properties only when no durable state exists.

Do not assert on private fake fields such as `_checkout_calls`. Do not use
subprocess tests for scenario or unit coverage when in-process invocation is
available.

Read `references/fast-scenario-testing.md` for the full pattern, infrastructure,
and examples.

## Reference Routing

- Adding a feature or fixing a bug: read `references/quick-reference.md`, then
  `references/workflows.md`.
- Deciding which layer or test shape to use: read
  `references/testing-strategy.md`.
- Adding or changing a gateway/ABC/fake: read
  `references/gateway-architecture.md`, then `references/workflows.md`.
- Creating a `FileSystem`, `Subprocess`, `Shell`, or `Http`-named gateway:
  read `references/anti-patterns.md` and
  `references/gateway-architecture.md#keep-gateways-narrow` first.
- Designing gateway failure behavior: read `references/non-ideal-states.md`.
- Converting tests from `unittest.mock.patch` to fakes: read
  `references/mock-to-fake-conversion.md`.
- Implementing CliRunner, constructor injection, builders, mutation tracking,
  dry-run behavior, or error injection: read `references/patterns.md`.
- Working with framework-specific pytest or web-app details: read
  `references/python-specific.md`.
- Extending the gateway system, such as dry-run preview behavior: read
  `references/advanced-extensions.md`.
- Unsure whether an approach is valid: read `references/anti-patterns.md`.

## Guardrails

- Default to Layer 4 tests over fakes for business logic with dependencies.
- Default to Layer 3 pure unit tests for helpers with no dependencies.
- Do not write speculative tests for features that do not exist yet.
- Use `tmp_path`; never hardcode real machine paths in tests.
- Fakes must not perform I/O.
- When a gateway interface changes, update ABC, Real, Fake, fake tests, real
  sanity tests, affected business-logic tests, and conformance tests if the
  gateway has them.
- Every fake operation needs coverage for default success, constructor-driven
  error injection, and mutation tracking when mutation tracking is part of the
  fake contract.
- Keep real implementation `try`/`except` boundaries in Real gateways; fakes
  should return configured non-ideal states without touching external systems.
- For discriminated-union style results, narrow with `isinstance()`, never
  truthiness.
