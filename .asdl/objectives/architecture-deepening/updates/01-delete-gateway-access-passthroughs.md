# Semantic Update: Delete `gateway_access.py` pass-throughs

## Summary

Deleted the brmem and pr-address `gateway_access.py` pass-through modules. Operation call sites now bind their typed CLI context once with `load_typed_context(...)` and read gateway fields from that binding directly.

## Objective Impact

This completes the roadmap's first deepening row. The branch-resolution helper in brmem collapsed into the documented inline `Ensure.ideal_state(...)` pattern for omitted branches, while explicit branch requests still pass through unchanged.

## Follow-Ups

No surprises emerged. The remaining roadmap rows stay parked for separate deletion-test passes.
