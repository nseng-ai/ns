# Contract decision: adopt a TypeScript gateway result contract; park parser, Python, and helper unification

## Summary

The roadmap-row-2 architecture review ran as an interactive grill session on 2026-06-09, using the re-baseline update (`2026-06-09-1423-rebaseline-failure-data-and-gateway-inventory.md`) as its input inventory. Every call below was ratified by the objective owner. The deliverable judgment is recorded here; the remaining roadmap rows are purely mechanical.

### Decision 1: failure-as-data and gateway-result conventions are two concerns, not one

- Parser/workflow results (`handoff.ts`, `objective-list.ts`, `machine-envelope.ts`, runner runtime) are package-local `valid|invalid`-style unions with no shared error object, no presenters, and no cross-package co-variation.
- Gateway results share a recurring error-info shape (`{ code, message, displayCommand? }`) and the same boundary role across packages, with observed textual duplication between `@asdl/plans` and `@asdl/planned-branch`.

### Decision 2: park parser-shape unification (do not re-suggest)

The shared part of the parser conversions — return discriminated data instead of throwing — is already the `typescript-style` skill's errors-as-values rule. The per-package shapes are healthy local variation; naming a repo contract for them adds nothing. This parking includes the `machine-envelope.ts` throw-vs-data divergence between `pi-extension-runtime` and `planned-branch`: it is a parser-family inconsistency, not gateway-contract drift, and converging it is ordinary cleanup whenever someone touches that code, not objective work.

### Decision 3: adopt a TypeScript-only gateway result contract, documentary form

The convention is a documented contract that gateways conform to **structurally**, not a shared code module:

- Gateway methods return `ok`-discriminated unions (`{ ok: true; value } | { ok: false; error }`); operation-only methods may drop `value`.
- Error info is minimal: `code: string`, `message: string`, plus documented optional extras. `displayCommand?: string` is the blessed extension for subprocess-backed gateways.
- Optional lookups use `{ type: "found"; value } | { type: "missing" } | { type: "error"; error }`.
- **Per-gateway naming is expected** (`GitErrorInfo`, `BrmemErrorInfo`, `GraphiteErrorInfo`); the contract specifies shape, not names. No refactor of existing conforming gateways is implied.
- Copies of the shapes across packages are allowed; dedup is expected only along existing dependency edges.

Rationale for documentary over shared code: mandating imports from `@asdl/plans` would give unrelated packages a wrong-direction dependency on a saved-plans package, and a new `@asdl/result` package for ~15 lines of types conflicts with the "no heavyweight Result framework; helpers stay small and local" non-goal. The only observed drift (textual `Git*` duplication) lies inside an existing dependency edge and is fixed by the exemplar.

### Decision 4: the contract's home is the `typescript-fake-driven-testing` skill

The skill's existing "Result unions" section (`skills/typescript-fake-driven-testing/SKILL.md`) already states ~80% of the contract (`ErrorInfo`, `GatewayResult<T>`). Extend that section into the authoritative artifact: add the optional-lookup union, operation results, the `displayCommand?` extension, the per-gateway-naming clarification, and the structural-conformance/dedup-along-edges rule. Constraint: this is a **public skill** (real directory under `skills/` with external discoverability), so the SKILL.md edit must state the contract generically — no asdl-internal module paths or type names (`@asdl/plans`, `GitErrorInfo`) may appear in it.

### Decision 5: TypeScript-only; park the Python raise-vs-return split (do not re-suggest)

Python is internally split (`asdl-core` gateways return failure domain objects; `areg` gateways raise domain exceptions), but both styles are internally consistent per package and there is no cross-package duplication decaying. Ruling on raise-vs-return would be a second architecture review touching LBYL idiom and every `areg` gateway signature. If the Python split ever produces real drift, that is evidence for a dedicated future objective, not this one.

### Decision 6: exemplar slice is the types-only `Git*` dedup

`ts/packages/planned-branch/src/git-gateway.ts` imports `GitCwdParams`, `GitErrorInfo`, `GitResult`, `GitOptionalResult` from `@asdl/plans` (all four are already exported from its index) and deletes its local copies. Package-specific extensions (`GitOperationResult`, `GitBranchPresenceResult`), the brmem/graphite gateways (domain-named structural twins, conforming as-is), and the duplicated private helpers (`runGit`, `failure`, `error`, `execOptions`, `firstNonEmptyLine`) all stay put. Helper-plumbing dedup is parked: it is implementation, not contract, and sharing it would mean designing a public gateway-runtime API in `@asdl/plans` — the "scope creep into gateway redesign" risk verbatim.

### Decision 7: close in-stack

After the artifact and exemplar land, every completion criterion is satisfied; the stack's final tracking branch records closure evidence and writes `closed.md`. Execution shape: one `objective-stack-impl` call producing three mechanical branches on top of the current branch — skill edit → exemplar dedup → closure tracking.

## Objective Impact

- Roadmap row 2 (the architecture review judgment) is complete; this update is its evidence. Remaining rows are mechanical and rewritten accordingly.
- Open question "shared structure worth a named convention, or already captured by `typescript-style`?" — resolved: split answer. Parser shapes are already captured by `typescript-style`; the gateway result shape is a real contract worth naming.
- Open question "one convention or two?" — resolved: two concerns; only the gateway contract is adopted.
- Open question "where does it live?" — resolved: the `typescript-fake-driven-testing` skill's "Result unions" section.
- Risk "premature abstraction" — discharged by construction: everything without observed drift was parked; the one adopted contract codifies what five-plus gateways already do.
- Risk "a convention without a home drifts" — addressed: the home is an existing skill that already triggers on gateway work.
- Risk "scope creep into gateway redesign" — held: exemplar is types-only; helpers, brmem/graphite signatures, and Python are untouched.

## Follow-Ups

- Execute the three remaining roadmap rows as one `objective-stack-impl` stack: extend the FDT skill's "Result unions" section (public-skill constraint: generic statement only), apply the types-only exemplar dedup with `plans`/`planned-branch` test validation, then record closure evidence and write `closed.md`.
