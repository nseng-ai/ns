# Bun-to-Node TypeScript Migration: Tooling Contract

## Thesis

The Bun-to-Node TypeScript migration needs a small, explicit tooling contract before mechanical package, test, runtime, or documentation changes proceed. This child Objective decides the repository-level TypeScript tooling baseline: how pnpm workspaces are shaped, what Node version is assumed, how TypeScript CLIs and Pi extension modules are executed or built, and how the project treats the experimental `node:sqlite` warning.

The goal is to turn ambiguous migration premises into durable decisions that downstream child Objectives can implement without repeatedly reopening the same policy questions.

## Scope

This Objective covers the tooling contract decisions that unblock the rest of the Bun-to-Node migration family:

- confirm or revise the Node v24+ baseline for TypeScript tooling and project-local runtime compatibility;
- define the intended pnpm workspace/package-manager shape at the policy level, including lockfile and script expectations that later implementation should satisfy;
- choose the TypeScript CLI and Pi extension execution strategy, such as native Node type stripping, a build step, loader usage, or another explicit approach;
- decide whether `node:sqlite`'s experimental warning should be accepted, suppressed, isolated behind an adapter, documented, or avoided;
- document the decisions in enough detail for the pnpm workspace, Vitest migration, Node runtime compatibility, and Bun-reference reconciliation child Objectives to use as input.

## Non-Goals

- Do not perform the full pnpm workspace migration in this Objective.
- Do not convert tests from `bun:test` to Vitest here.
- Do not harden every Pi extension or TypeScript CLI under Node here except as needed to validate the tooling contract.
- Do not reconcile every Bun reference in docs, scripts, templates, or deployment configuration here.
- Do not redesign Pi itself or change installed Pi runtime behavior beyond recording constraints relevant to this repository.
- Do not choose npm plus Node's built-in test runner unless evidence shows the umbrella premise of pnpm plus Vitest is unsuitable.

## Completion Criteria

This Objective is complete when:

- the Node baseline is explicit and justified;
- the pnpm workspace/package-manager contract is clear enough for a later implementation Objective to change manifests, scripts, and lockfiles without re-litigating policy;
- the TypeScript CLI and Pi extension execution/build strategy is selected, with known constraints called out;
- the `node:sqlite` warning policy is selected or deliberately deferred with a concrete downstream owner;
- downstream child Objectives have clear input guidance and any changed assumptions or risks are recorded through Objective updates.

## Assumptions and Risks

Assumptions:

- Node v24+ remains the expected baseline unless local evidence or repository constraints show a lower or different version is required.
- pnpm remains a better fit for this repository's TypeScript workspace shape than npm because workspace coordination matters more than minimizing tooling count.
- Vitest remains the expected test runner for downstream migration, but this Objective only needs to define the contract that test migration will consume.
- Project-local Pi extension modules must be valid under Node even if some tests continue to use a test runner abstraction.

Risks:

- Native Node TypeScript execution may emit warnings, reject non-erasable syntax, or differ from Bun in ways that make a build step safer.
- Introducing a build step may complicate local CLI launch paths, extension development loops, and documentation.
- `node:sqlite` is available in current Node but experimental-warning behavior may be noisy enough to require adapter isolation or explicit documentation.
- Package-manager policy decisions can leak into docs-site deployment or templates earlier than intended if the contract is too broad.
- A contract that is too vague will force later child Objectives to reopen policy decisions; a contract that is too prescriptive may block implementation evidence from correcting bad assumptions.

## Open Questions

- Should TypeScript CLIs run directly under Node's native TypeScript support, through a loader, or from built JavaScript artifacts?
- Should project-local Pi extensions share the same execution strategy as standalone TypeScript CLIs, or should extension runtime compatibility have a narrower contract?
- Is accepting the `node:sqlite` experimental warning sufficient, or should the migration suppress, isolate, or avoid it?
- Which package manifests and scripts are policy-setting inputs for the pnpm workspace contract, and which should be deferred to the pnpm workspace child Objective?
