# Neutralized Pi Extension Runtime Helpers

## Summary

A thermo-nuclear code-quality review found that CCC still imported shared helper modules through `@asdl/pi-extensions` internals while `@asdl/pi-extensions` held cmux compatibility shims back to CCC. That made the intended ownership boundary difficult to reason about and left the real dependency graph hidden behind relative cross-package imports.

The follow-up extracted `@asdl/pi-extension-runtime` as the neutral lower TypeScript helper package for command formatting, machine-envelope parsing, terminal presentation, Objective picker/list helpers, skill expansion, branch-slug helpers, and cmux/Pi runtime types. CCC now imports these helpers from the neutral runtime package. `@asdl/pi-extensions` keeps compatibility re-export modules for existing import paths.

The review also moved cmux behavior tests into `ts/packages/ccc/test/` so `bun test --cwd ts/packages/ccc` covers the cmux command suite now owned by CCC. `@asdl/pi-extensions` retains a small cmux shim smoke test for legacy import compatibility.

## Objective Impact

The neutral runtime-helper portion of the CCC boundary is complete enough for the current cmux migration slice: CCC no longer imports `@asdl/pi-extensions` internals for shared runtime helpers, and the remaining `@asdl/pi-extensions -> CCC` edges are explicit temporary compatibility shims.

Validation evidence should be refreshed after this update with TypeScript check/test gates and import-direction evidence.

## Follow-Ups

- Continue migrating remaining orchestration flows into CCC using `@asdl/pi-extension-runtime` for neutral helper seams.
- Retire `@asdl/pi-extensions` compatibility re-exports when all legacy imports have moved.
- Keep new CCC-owned command behavior tests in `ts/packages/ccc/test/` rather than under the compatibility package.
