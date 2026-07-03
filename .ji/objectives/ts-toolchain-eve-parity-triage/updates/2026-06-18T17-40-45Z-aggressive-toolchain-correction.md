# Aggressive Toolchain Correction

## Summary

The toolchain posture changed from conservative adoption to aggressive best-of-breed adoption after user steering. The earlier bulk verdict was too cautious about `tsgo` and chose Biome when the desired posture is closer to Eve's Oxc/native-TS stack.

Corrected verdicts:

- **Linter:** adopt oxlint, not Biome or eslint.
- **Formatter:** adopt oxfmt, not Biome formatting.
- **Compiler:** adopt `@typescript/native-preview` / `tsgo` as the primary typecheck command while keeping stock `tsc` as a named legacy fallback.
- **Target/lib:** adopt ES2024 for Node 24 parity.
- **Dependency governance:** keep the adopt-now catalog + syncpack decision.
- **Still deferred/rejected:** defer `minimumReleaseAge`, build-script allowlisting, broad Eve-scale invariant guard, and pre-commit hooks; keep rejecting Eve's test-tier split and publish-only machinery while `ts/` is unpublished and run-from-source.

## Objective Impact

This update supersedes the conservative parts of the prior bulk verdict. The Objective remains closed as a decision record, but the implementation landing spot is no longer merely parked: the aggressive toolchain rollout is being implemented in this branch as one chunk.

## Follow-Ups

- Validate oxlint, oxfmt, syncpack, tsgo, legacy tsc, and Vitest after installation.
- If `tsgo` exposes parity issues, keep the tool installed but use `check:legacy` as the rollback path while investigating.
