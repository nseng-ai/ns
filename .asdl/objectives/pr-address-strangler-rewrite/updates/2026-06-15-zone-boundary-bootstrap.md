# Zone Boundary Bootstrap Landed

## Summary

The first boundary-only slice is now represented in the working tree: `src/core`, `src/app`, and `src/legacy` exist as explicit zones, and a package-local Vitest static test documents and enforces the bootstrap import matrix before production modules are moved.

The enforcement applies only to files already under those zones. Existing root-level `src/*.ts` files and `src/operation-schemas/**` remain bootstrap legacy for this slice and are intentionally not policed until a future carve moves them.

## Objective Impact

The first roadmap row is complete. Future carve and RunEngine slices can now rely on a checked import-direction contract: `core` may import only `core`, `app` may import `app` or `core`, and `legacy` may import `legacy`, `core`, or bootstrap-root files while being forbidden from importing `app`.

Verification: targeted `@asdl/pr-address` check/test passed, and full TypeScript workspace check/test passed.

## Follow-Ups

- Use the boundary test as the guardrail when moving the first production modules into `core`, `app`, or `legacy`.
- Decide in a later slice when bootstrap-root modules become illegal rather than allowed transitional legacy.
