# Contract artifact and exemplar landed; Objective closed

## Summary

The two mechanical slices prescribed by the contract decision (`2026-06-09-1659-gateway-result-contract-decision.md`) were implemented as a Graphite stack on top of `add-failure-data-gateway-convention`:

- **Artifact** (commit `c6e3f62d`, branch `extend-fdt-gateway-result-contract`): the "Result unions" section of `skills/typescript-fake-driven-testing/SKILL.md` now states the full gateway result contract — the optional-lookup union (`found | missing | error`), the value-less operation result, `displayCommand?` as the blessed extension for subprocess-backed gateways, a "Shape, not names" subsection establishing per-gateway domain-named structural twins, and the rule that copies across packages are fine with dedup only along existing dependency edges. The public-skill constraint was honored: the contract is stated generically with no asdl-internal module paths or type names. `dprint check` passed.
- **Exemplar** (commit `c0079410`, branch `planned-branch-git-types-dedup`): `ts/packages/planned-branch/src/git-gateway.ts` imports `GitCwdParams`, `GitErrorInfo`, `GitResult`, `GitOptionalResult` from `@asdl/plans` and deletes its local copies, after confirming the four declarations were textually identical. The types are re-exported from `git-gateway.ts` because the package's in-memory test fake imports them from that module; the package index is unchanged. `GitOperationResult`, `GitBranchPresenceResult`, the brmem/graphite gateways, and the private helpers were untouched, per the ratified non-goals.

Verification: `plans` and `planned-branch` package test suites passed; full TypeScript workspace typecheck passed. Evidence is local committed branch state written under landed-state semantics; PR evidence was not required.

## Objective Impact

- Roadmap rows 3 and 4 (artifact, exemplar) are complete with commit-level evidence; row 5 (closure tracking) is completed by this update.
- Completion criteria are all satisfied: the inventory was re-baselined (row 1), the named decision is recorded (row 2), the convention artifact exists, and exactly one targeted exemplar demonstrates it with evidence.
- Risk "a convention without a home drifts" — discharged: the home is the `typescript-fake-driven-testing` skill, which already triggers on gateway work.
- Risk "scope creep into gateway redesign" — held through completion: the exemplar was types-only.
- The Objective is closed: `## Closure` recorded in `objective.md`, `closed.md` written.

## Follow-Ups

- None blocking. Parked items (parser-shape unification, Python raise-vs-return, `machine-envelope` convergence, helper-plumbing dedup) retain their do-not-re-suggest rationale in `roadmap.md`.
- PR submission for the stack is intentionally manual.
