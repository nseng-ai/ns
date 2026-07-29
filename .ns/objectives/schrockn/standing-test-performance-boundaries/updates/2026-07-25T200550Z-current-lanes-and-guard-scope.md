# Current Lanes and Guard Scope

## Summary

The default, integration, isolated, and TypeScript style-guard lanes remain present and correctly configured. Current integration globs cover top-level packages, grouped packages, and `.ns/reviews/*/tools/*`; representative moved tests now live under Foundation, Extension Kit, incubating Branch Context, and SDK paths rather than the pre-rename paths in the record. The latest host-contract slice remains the newest progress event and records a targeted default median reduction from 187 ms to 11 ms after static catalog coverage replaced unnecessary dynamic imports.

Two concrete guard gaps remain. The existing Vitest-lane tests verify configured globs but do not scan for specialized directories nested outside those globs. Separately, shared-cache source guards apply to `ts/packages/` test paths while the shared Vitest roots also admit review-tool tests; broad documentation should not imply identical enforcement there without a decision.

Provenance: objective-refresh basis target=5d52b257cc380143528f8353e3712e3cf63152fe from=trunk-HEAD

## Objective Impact

The standing contract and roadmap were rewritten around current paths and current lane semantics. Stale pre-incubator and pre-SDK-registry examples were removed, and the structural-placement and review-tool enforcement questions are now explicit actionable rows rather than latent caveats.

## Follow-Ups

- Decide whether to add a filesystem structural guard for misplaced integration/isolated directories.
- Decide whether to extend shared-cache source guards to review-tool tests or narrow the documentation.
- Continue selecting one fresh evidenced boundary slice at a time.
