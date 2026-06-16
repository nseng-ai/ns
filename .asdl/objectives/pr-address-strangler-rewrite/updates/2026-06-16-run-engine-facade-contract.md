# RunEngine Façade Contract Defined

## Summary

The `pr-address` app zone now has a self-contained `PrAddressRunEngine`/RunKernel contract. The contract names the full target verb vocabulary (`feedback`, `details`, `plan`, `batch`, `status`, and `reply`) while exposing only the read-only callable subset for this slice: `feedback`, `details`, and `status`.

The new detail handles use stable GitHub-domain identities (`reviewId`, `threadId`, and `commentId` with `prNumber`) rather than run-local storage references.

## Objective Impact

The RunEngine façade roadmap row is complete. Future slices can implement the read-only primitives through this app boundary without importing bootstrap-root production modules into `src/app` or exposing premature CLI/exec commands.

Verification: package-local TypeScript check/test passed, and the app contract test now rejects old storage vocabulary in `src/app` identifiers.

## Follow-Ups

- Carve the minimum needed GitHub feedback capabilities into `core/` before wiring real `feedback`, `details`, or `status` behavior.
- Keep production `plan`, `batch`, and `reply` as later primitive-specific slices.
- Preserve stateless re-fetch semantics unless a future implementation proves hidden internal state is necessary and keeps it out of the public app contract.
