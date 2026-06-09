# Roadmap

## Work

- [x] Re-baseline the failure-as-data and gateway-extraction inventory against current master.
      Evidence: completed 2026-06-09 against master `e9062814`; full inventory in `updates/2026-06-09-1423-rebaseline-failure-data-and-gateway-inventory.md`. All seed sites located and characterized; `HandoffUsageError`/`CustomCliUsageError`/`RuntimeResultParseError` confirmed removed; new sites since 2026-06-05 captured (`@asdl/plans` package with duplicated `GitResult` shapes, Python provenance/checkpoint unions, `asdl-core` pure-boundary extraction wave); no reversals of the trend found.
- [x] Run the architecture review over the inventoried sites to name, split, or reject a shared failure/boundary contract.
      Evidence: completed 2026-06-09 as an interactive grill session with owner ratification; decision recorded in `updates/2026-06-09-1659-gateway-result-contract-decision.md`. Outcome: two concerns, not one; adopt a TypeScript-only documentary gateway result contract; park parser unification, the Python raise-vs-return split, `machine-envelope` convergence, and helper-plumbing dedup with do-not-re-suggest rationale.
- [x] Extend the "Result unions" section of `skills/typescript-fake-driven-testing/SKILL.md` into the authoritative gateway result contract.
      Evidence: completed 2026-06-09 in commit `c6e3f62d` (stack branch `extend-fdt-gateway-result-contract`). The section now states the full ratified contract — optional-lookup union, operation result, `displayCommand?` extension, "Shape, not names" per-gateway-naming rule, and the dedup-only-along-existing-edges rule — stated generically with no asdl-internal references, honoring the public-skill constraint. `dprint check` passed.
- [x] Apply the types-only exemplar dedup in `@asdl/planned-branch`.
      Evidence: completed 2026-06-09 in commit `c0079410` (stack branch `planned-branch-git-types-dedup`). `git-gateway.ts` now imports `GitCwdParams`, `GitErrorInfo`, `GitResult`, `GitOptionalResult` from `@asdl/plans` and re-exports them for in-package consumers; local copies deleted after confirming textual identity. `GitOperationResult`, `GitBranchPresenceResult`, the brmem/graphite gateways, and the private helpers were untouched. Verification: `plans` and `planned-branch` package tests passed; full workspace typecheck passed.
- [x] Record closure evidence and close the Objective.
      Evidence: this tracking change — Semantic Update `2026-06-09-1724-contract-artifact-and-exemplar-landed.md`, roadmap rows checked, `## Closure` in `objective.md`, `closed.md` written.

## Parked

- Parser-shape unification (`valid|invalid` unions in handoff, objective-list, runner runtime). Do not re-suggest: the shared part — return discriminated data, don't throw — is already the `typescript-style` skill's errors-as-values rule; the per-package shapes are healthy local variation with no shared error object and no cross-package drift.
- `machine-envelope.ts` throw-vs-data convergence (`pi-extension-runtime` vs `planned-branch` copies). Do not re-suggest as Objective work: parser-family inconsistency, not gateway-contract drift; converge it as ordinary cleanup whenever that code is next touched.
- Python raise-vs-return split (`asdl-core` returned failure objects vs `areg` raised domain exceptions). Do not re-suggest: both styles are internally consistent per package, no cross-package duplication is decaying, and ruling on it is a dedicated future review if real drift ever appears.
- Gateway helper-plumbing dedup (`runGit`, `failure`, `error`, `execOptions`, `firstNonEmptyLine` duplicated across gateway implementations). Do not re-suggest: implementation duplication, not contract drift; sharing it would mean designing a public gateway-runtime API surface — the named scope-creep risk.

None of the parked items block closure.
