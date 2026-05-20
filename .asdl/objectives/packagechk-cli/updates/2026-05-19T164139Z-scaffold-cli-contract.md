# packagechk Scaffold and CLI Contract

## Summary

Created the `packages/packagechk` workspace package with a standalone `packagechk` CLI skeleton, registry result models, fake-driven scenario tests, and initial human/JSON rendering. The CLI defaults to PyPI and npm, supports explicit registry selection, and rejects the parked `brew` registry with exit code `2` rather than returning an ambiguous result.

## Objective Impact

This completes the package/CLI scaffold and establishes the result vocabulary for available, taken, invalid, unsupported, and operational-error outcomes. The output and scenario-test roadmap items are now partially complete because the rendering and exit-code aggregation exist before real registry lookups are implemented.

The implementation keeps the registry boundary injectable so PyPI and npm behavior can be added in separate stack slices without network access in ordinary scenario tests.

## Follow-Ups

- Implement PyPI normalization and registry lookup behind the registry gateway.
- Implement npm unscoped-name validation and lookup behind the same CLI contract.
- Use the full repo validation result from this slice as a baseline for later registry slices.
