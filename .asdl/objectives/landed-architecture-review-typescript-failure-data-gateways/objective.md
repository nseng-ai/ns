# TypeScript Failure-as-Data and Gateway Conventions

## Thesis

TypeScript Pi and agent workflow code has converged on a useful boundary pattern: expected failures at system, parser, and workflow edges should be represented as typed data, and external capabilities should be isolated behind semantic gateways when reuse, parsing, mutation policy, or fake-driven tests make the boundary important. The pattern is already visible in landed work, but it is not yet named as a durable TypeScript convention.

This Objective turns that implicit TypeScript practice into an explicit, discoverable convention. It is anchored on `@asdl/pi-extension-runtime` and `ts/packages/pi-extensions` runtime boundaries, then compares those boundaries against nearby examples such as `ccc` land-stack result unions, `@asdl/planned-branch` gateways, and `asdl-dev` gateway result helpers. The outcome should be a finite convention and evidence review, not a broad cleanup backlog.

## Scope

This Objective covers TypeScript code and TypeScript-facing guidance only:

- Review Pi runtime and Pi extension command/parsing boundaries as the primary anchor.
- Use existing TypeScript examples as comparison evidence, including `LandStackResult`, `GatewayResult<T>`, planned-branch git/brmem/Graphite gateways, machine-envelope parsing, objective-list parsing, and command-runtime formatting helpers.
- Write a new ADR under `docs/adr/` that states the TypeScript convention for failure-as-data and semantic gateway boundaries.
- Cross-link the ADR from TypeScript guidance where agents will read it during implementation, especially TypeScript style and TypeScript fake-driven testing guidance when warranted.
- Apply a targeted refactor only when evidence shows a recoverable expected user, environment, parser, or external-system outcome is still represented as a throw in a way that blocks caller branching, better presentation, or fake-driven tests.
- Record candidate evidence, but choose actual refactor work only after the baseline review applies the convention.

Candidate evidence to inspect, not pre-committed implementation work:

- handoff git/current-branch failures and detached-HEAD handling in Pi extension code;
- handoff and planned-branch content slug derivation failures;
- TypeScript recipe rendering failures for planned-branch implementation prompts;
- command-runtime, machine-envelope, and objective parser result shapes in `@asdl/pi-extension-runtime`.

## Non-Goals

- Do not define or update Python conventions in this Objective.
- Do not create a universal cross-package or cross-language `Result` framework.
- Do not require one concrete success/failure shape across all TypeScript packages; `{ ok: true | false }`, `{ type: "success" | "failure" }`, and domain-specific discriminants may all remain valid when typed and clear.
- Do not mass-refactor every throw, catch, parser, or gateway-like module found by grep.
- Do not convert programmer errors, impossible states, broken invariants, or malformed static configuration into ordinary returned data merely for consistency.
- Do not create mechanism-shaped gateways such as `ShellRunner` or `SubprocessGateway` as a substitute for semantic boundaries.
- Do not include payload artifact architecture; that belongs to the separate payload-artifact Objective lineage.
- Do not add hidden Objective metadata, registries, YAML/frontmatter, schedulers, or state-machine behavior.

## Completion Criteria

This Objective is complete when:

- the TypeScript failure-as-data and semantic gateway convention is documented in a new ADR under `docs/adr/`;
- relevant TypeScript guidance links to that ADR or otherwise makes the convention discoverable to future agents;
- the Pi runtime/Pi extension anchor has been reviewed against the convention with concrete evidence;
- high-leverage TypeScript drift found during that review has either been fixed with focused tests and affected package validation, or explicitly parked with rationale;
- no active non-parked roadmap work remains.

The Objective does not require every TypeScript package to be inventoried or rewritten. It does not wait for Python guidance or cross-language alignment.

## Assumptions and Risks

Assumptions:

- TypeScript-only scope is the right first slice even though the original architecture-review cluster was broader.
- Pi runtime and Pi extension boundaries are the highest-leverage anchor because they shape agent-facing command, parser, and presentation behavior.
- The repo benefits more from a named convention plus targeted drift fixes than from a universal result helper.
- Existing TypeScript result shapes are acceptable when they are discriminated, typed, presentable, and testable.

Risks:

- Future agents may accidentally broaden this Objective into Python or full-repo cleanup; the mitigation is the explicit TypeScript-only Scope and Non-Goals.
- ADR placement may give the convention more authority than the evidence supports; the mitigation is to keep the ADR concrete, TypeScript-scoped, and evidence-linked.
- Candidate throw sites may turn out to be valid invariant failures rather than recoverable outcomes; the mitigation is to treat them as evidence to inspect, not preselected refactors.
- A targeted refactor could churn established public behavior; the mitigation is to require focused tests, affected package validation, and no public API changes unless the convention review justifies them.

## Open Questions

- Which, if any, candidate Pi extension failure path should become the first targeted refactor after the baseline review?
- Does the ADR need a follow-up Objective for non-TypeScript conventions, or is TypeScript-only guidance sufficient for now?
