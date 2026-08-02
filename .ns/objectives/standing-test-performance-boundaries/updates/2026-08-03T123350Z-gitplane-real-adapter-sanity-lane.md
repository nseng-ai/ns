# Gitplane Real-Adapter Sanity Lane

## Summary

The TypeScript test topology now has a narrow `test/sanity/` lane for invoking a concrete real adapter
while mocking only low-level runtime or vendor modules when code-unchanged adapter testing requires
module substitution. Sanity runs with Vitest `isolate: true`; it must not mock domain or workflow logic,
semantic gateways, or the adapter subject. This is distinct from the isolated lane, which owns ambient
product/runtime contracts rather than an adapter-mocking technique, and from integration, which retains
actual Git, filesystem, process, and other external-system compatibility.

The lane runs through `just ts-test-sanity`; default `just` / `just check` invokes that isolated lane
alongside core validation, and opt-in `just ci` includes it through `check`. It also has a separate
non-draft CI job. The TypeScript style guard exempts the two isolated-cache paths `/test/isolated/` and
`/test/sanity/`; ordinary shared-cache package-test lanes retain all five shared-state bans.

## Objective Impact

Gitplane's initial real-adapter sanity suite contains 24 tests. It exercises the concrete
`RealArtifactGateway` while substituting low-level runtime modules and exposed a minimal production
parsing defect, which was fixed without replacing the existing integration tests. Those integration
tests continue to own actual Git/filesystem/process compatibility.

This is containment and focused adapter confidence, not evidence of a speedup. No speedup is claimed.
The reusable lane contract is recorded in the Objective, roadmap, TypeScript testing guide, and reusable
TypeScript skills.

## Validation

- Sanity lane: `just ts-test-sanity`
- Focused Gitplane coverage command: `pnpm --dir ts run test:sanity:gitplane-coverage`
- Current focused coverage after the production defect fix: statements 98.64% (146/148), branches
  95.55% (86/90), functions 100% (34/34), and lines 100% (133/133).
- Residual V8 locations are lines 126, 210, 246, and 249: comparator equality for duplicate sibling
  names that a real directory cannot produce, defensive fallback for a regex-required capture,
  candidate-root skipping, and a defensive missing-map invariant after complete blob parsing. The
  first two are impossible under their producing contracts; the latter two are defensive invariants
  whose forced mocks would provide false confidence.
- Existing integration coverage retained; no tests were deleted or moved from integration.

## Follow-Ups

- Keep sanity tests limited to concrete-adapter invocation with only low-level runtime/vendor module
  substitution; route actual external compatibility to integration and ambient product/runtime
  contracts to isolated.
