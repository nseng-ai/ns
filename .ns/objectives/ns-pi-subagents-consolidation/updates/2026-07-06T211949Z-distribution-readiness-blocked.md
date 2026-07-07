# Distribution Readiness Assessment Blocks External Promotion

## Summary

`@nseng-ai/ns-pi-subagents` is not ready for external distribution yet. The package remains explicitly private, exports raw workspace TypeScript source, and its Pi manifest points at `./src/extension.ts`. More importantly, the package has a runtime import from `@internal/pi-tools/overlay-kit` in `src/fleet/navigator.ts` while `@internal/pi-tools` also depends on `@nseng-ai/ns-pi-subagents` for thermo-council and context-profiler subagent helpers. That bidirectional internal coupling means the package cannot be promoted as an external package by simply flipping `private` or publishing the current files.

## Objective Impact

The distribution-readiness row is complete as an assess-and-record slice: packaging is blocked, not unblocked. The promotion path is:

1. Move the overlay UI primitives used by `src/fleet/navigator.ts` out of `@internal/pi-tools/overlay-kit` into a publishable/shared package, or duplicate a narrower local navigator rendering seam inside `@nseng-ai/ns-pi-subagents` if that is deliberately preferable.
2. Break the bidirectional dependency by keeping `@internal/pi-tools` as a downstream consumer of `@nseng-ai/ns-pi-subagents`, not a runtime dependency of it.
3. Decide the release artifact contract before publishing: either add a build/declaration pipeline and export compiled artifacts, or explicitly adopt source-TypeScript package distribution for Pi packages. The current `files: ["src", "README.md"]`, raw `.ts` export map, and `pi.extensions: ["./src/extension.ts"]` are dogfood-friendly but not yet an external distribution contract.
4. Only after those promotion steps should a human-owned release slice remove `private: true`, set package metadata/versioning as needed, and consider publishing. Publishing itself remains outside this Objective.

## Follow-Ups

- Keep the current package private until the overlay-kit dependency and release-artifact contract are resolved.
- Treat thermo-council/context-profiler imports from `@nseng-ai/ns-pi-subagents/runner-subagents` as useful evidence that the runner-subagent subpath is reusable, but not as evidence that external packaging is unblocked.
- When the current consolidation stack lands, record merge evidence for the human-owned stack row; this assessment leaves no additional semantic implementation row for distribution readiness.
