# Roadmap

## Work

- [x] Remove hard language-style violations across source and tests.
      Evidence: constructor parameter properties were replaced with explicit fields and assignments in the targeted source and test classes, the test-only `any` in runner-subagent fake process listeners was removed, focused scans found no remaining constructor parameter properties or explicit type-level `any` in `ts/packages/pi-extensions`, and the broad emit-time construct scan reports only ambient declarations or text/identifier false positives. Validation: `bun run --cwd ts/packages/pi-extensions check`, `bun run --cwd ts/packages/pi-extensions test`, `just ts-check`, and `just ts-test` passed.
- [ ] Convert existing object-shape and contract aliases to interfaces while preserving union and function aliases as `type`.
      Evidence: public and internal object contracts in the TypeScript packages follow the interface/type split, with any compatibility aliases documented intentionally. This may be a large mechanical diff, but it should remain one simple, human-legible decision.
- [ ] Harden untyped JSON, tool, and runtime boundaries with `unknown` plus guards or decoders.
      Evidence: CLI JSON parse sites in land/land-stack/worktree status and runner/grill runtime inputs no longer depend on broad casts before validation.
- [ ] Rework expected failure APIs toward discriminated returned data where callers branch on failures.
      Evidence: brmem, planned-branch, land-stack, handoff/objective parsing, and runner runtime parsing either return typed failure data or document why a throw remains the terminal presentation boundary.
- [ ] Clarify dependency-injection and adapter ownership for Node/Pi globals.
      Evidence: domain logic receives collaborators for process, filesystem, clocks, spawn, and runtime surfaces where practical; remaining direct global usage lives in explicit adapter modules.
- [ ] Add lightweight TypeScript style guardrails and contributor guidance for `typescript-style` compliance.
      Evidence: the repo has a repeatable way to catch regressions for erasable syntax, explicit `any`, import suffixes, and boundary-cast patterns without relying on manual audit memory.
- [ ] Capture remaining intentional exceptions and close the audit loop.
      Evidence: relevant TypeScript checks and tests pass, deviations are documented, and the Objective records what was fixed versus deliberately accepted.

## Parked

- Redesigning Pi extension product behavior beyond type/style remediation.
- Introducing a heavyweight schema/validation dependency unless local guards become clearly insufficient.
- Broad non-TypeScript architecture cleanup outside the specific seams touched by TypeScript style compliance.
