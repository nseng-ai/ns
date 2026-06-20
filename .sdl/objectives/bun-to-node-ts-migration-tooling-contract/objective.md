# Bun-to-Node TypeScript Migration: Tooling Contract

## Thesis

The Bun-to-Node TypeScript migration needs a small, explicit tooling contract before mechanical package, test, runtime, or documentation changes proceed. This child Objective decides the repository-level TypeScript tooling baseline: how pnpm workspaces are shaped, what Node version is assumed, how TypeScript CLIs and Pi extension modules are executed or built, and how the project treats the experimental `node:sqlite` warning.

The goal is to turn ambiguous migration premises into durable decisions that downstream child Objectives can implement without repeatedly reopening the same policy questions.

## Scope

This Objective covers the tooling contract decisions that unblock the rest of the Bun-to-Node migration family:

- use Node v24.12+ as the baseline for TypeScript tooling and project-local runtime compatibility;
- use separate pnpm-managed package-manager surfaces: `ts/` as the TypeScript workspace and `docs-site/` as a standalone docs surface, with lockfile, script, deployment, Node-engine, and patch-handling expectations that later implementation should satisfy;
- use native Node TypeScript type stripping as the project-local TypeScript CLI and Pi extension execution strategy, with build artifacts reserved as a fallback if later package-boundary evidence requires them;
- keep the current `sqlite3` CLI reader acceptable and allow future `node:sqlite` adoption only behind the Graphite metadata adapter boundary with targeted sqlite-warning suppression;
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

- the Node v24.12+ baseline is explicit and justified;
- the separate-surface pnpm workspace/package-manager contract is clear enough for a later implementation Objective to change manifests, scripts, deployment commands, patch metadata, and lockfiles without re-litigating policy;
- the TypeScript CLI and Pi extension execution/build strategy is selected as native Node type stripping, with known constraints called out;
- the `node:sqlite` warning policy is selected or deliberately deferred with a concrete downstream owner;
- downstream child Objectives have clear input guidance and any changed assumptions or risks are recorded through Objective updates.

## Assumptions and Risks

Assumptions:

- Node v24.12+ is the expected baseline for TypeScript tooling. Local evidence showed v24.2 can import current source but is below the practical CLI-entrypoint minimum because TypeScript `import.meta.main` is false there; Node fixed that in v24.3, and v24.12+ is the stable type-stripping baseline in the v24 line.
- pnpm remains a better fit for this repository's TypeScript workspace shape than npm because workspace coordination matters more than minimizing tooling count. The package-manager contract uses separate pnpm surfaces for `ts/` and `docs-site/`, not one root workspace.
- Vitest remains the expected test runner for downstream migration; pnpm migration should not absorb `bun:test` or `bun test --sequential` conversion.
- Project-local Pi extension modules should run through native Node TypeScript type stripping, and current source has been probed as erasable-only. Later package-manager work must preserve a workspace/source layout that does not require Node to strip TypeScript from real package contents under `node_modules`.

Risks:

- Native Node TypeScript execution on supported Node v24.12+ is accepted for project-local tooling, but downstream implementation must add `erasableSyntaxOnly` so future non-erasable syntax does not silently enter the runtime path.
- Introducing a build step would complicate local CLI launch paths, extension development loops, and documentation; keep it as a fallback only if later package-boundary or publishing evidence requires built artifacts.
- `node:sqlite` warning noise is handled by policy rather than immediate implementation: current `sqlite3` CLI usage remains acceptable, and any future `node:sqlite` adoption must isolate targeted warning suppression inside the Graphite metadata adapter boundary.
- Package-manager policy decisions include docs-site install/build and Vercel command migration, but docs content/template cleanup remains downstream Bun-reference reconciliation work.
- The current patched Pi dependency must not be accidentally dropped during package-manager migration; preserve it until the port proves the patch is unnecessary, then track removal as cleanup rather than keeping stale patch debt.
- A contract that is too vague will force later child Objectives to reopen policy decisions; a contract that is too prescriptive may block implementation evidence from correcting bad assumptions.

## Open Questions

No open contract questions remain. Downstream work should reopen this Objective only if implementation evidence invalidates a recorded premise, such as pnpm source-link behavior, Node v24.12+ native type stripping, pnpm patch representation, or targeted `node:sqlite` warning suppression.

## Closure

Outcome: completed.

The tooling contract is settled for the Bun-to-Node TypeScript migration family:

- Node v24.12+ is the TypeScript tooling baseline.
- Project-local TypeScript CLIs and Pi extension modules use native Node TypeScript type stripping with erasable-only source; build artifacts remain a fallback only for later package-boundary evidence.
- Package-manager migration uses separate pnpm-managed surfaces: `ts/` as a pnpm workspace for `packages/*`, and `docs-site/` as a standalone pnpm surface. Root remains orchestration-only through directory-scoped pnpm commands.
- The current Pi dependency patch must be preserved through pnpm-native patch metadata during migration, then removed only when dependency evidence and representative Pi extension scenario coverage prove it unnecessary.
- The current `sqlite3` CLI reader remains acceptable. Future `node:sqlite` adoption is allowed only behind the Graphite metadata adapter boundary with targeted sqlite-warning suppression.
- Downstream ownership is clear: pnpm workspace migration owns manifests, lockfiles, package-manager scripts, Vercel command migration, Node engines, workspace source-link behavior, and patch metadata; Vitest migration owns Bun test-runner conversion; Node runtime compatibility owns CLI runtime/shebang hardening and any sqlite reader implementation change; Bun-reference reconciliation owns remaining prose/template cleanup after commands settle.

Closure evidence is recorded in the Semantic Updates under `updates/`, especially the tooling entrypoint inventory, Node TypeScript execution policy, patch retirement follow-up, pnpm workspace contract, and sqlite policy/downstream guidance updates.
