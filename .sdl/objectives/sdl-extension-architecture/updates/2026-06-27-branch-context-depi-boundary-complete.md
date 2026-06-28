# Branch Context de-Pi Boundary Complete

## Summary

The `branch-context-capability-extension` child has completed its focused Branch Context de-Pi boundary work and is ready for closure review. The child did not reopen saved-plan storage, Branch Memory key semantics, attached-plan selection, branch naming, implementation prompt content, or command taxonomy.

Evidence recorded in the child Objective:

- `@sdl/branch-context/api` and the package root no longer export `IMPL_BRANCH_CONTEXT_COMMAND_NAME` or `formatImplBranchContextCommand`; Pi owns the formatter and command name, while CCC consumes the neutral Pi command surface only to construct Pi launch commands.
- `ts/packages/branch-context/package.json` no longer declares `@sdl/pi`, and Branch Context source/tests have no `@sdl/pi` matches.
- `just ts-guard` passed after narrowing the deferred legacy cycle so Branch Context is no longer tolerated in the autobranch/pi/sdl component.
- `ts/packages/branch-context/CONTEXT.md` and `ts/packages/hosts/pi/CONTEXT.md` now document the Branch Context Capability API vs Pi/CCC presentation boundary.

Final stale-edge and validation checks:

- `rg -n "@sdl/pi" ts/packages/branch-context ts/packages/branch-context/package.json` — no matches.
- `rg -n "IMPL_BRANCH_CONTEXT_COMMAND_NAME|formatImplBranchContextCommand" ts/packages/branch-context ts/packages/ccc ts/packages/hosts/pi ts/scripts/typescript-style-guard` — matches only in CCC/Pi presentation-owned code and tests, not in Branch Context.
- `just ts-check` — passed.
- `just ts-test` — 354 files / 3510 tests passed.
- `just ts-guard` — passed.

## Objective Impact

Parent Phase 2 step 4 can treat the Branch Context child migration as complete or closure-ready. The remaining parent graph debt is no longer a Branch Context → Pi edge; broader autobranch/pi/sdl cleanup and CCC clean-consumer conversion remain parent/future-slice work.

## Follow-Ups

- Let the parent/maintainer close `branch-context-capability-extension` if they accept the evidence.
- Continue remaining Phase 2 capability children and broader CCC clean-consumer work under `sdl-extension-architecture`.
