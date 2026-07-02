# Pilot and Vocabulary Landed

## Summary

The manifest-driven topology pilot is committed on `manifest-driven-topology-circles` as `b7f4b2409`, with submit intentionally skipped by autopilot. The steer-first vocabulary slice was approved as a full bundle and implemented in root `CONTEXT.md` plus ADR 0022.

## Objective Impact

The Objective's enabling sequence has advanced past the pilot rename and vocabulary gates. Root vocabulary now canonizes **Subpackage**, **Container package**, **Remainder subpackage**, **Standalone package**, and **Local space**; it also reconciles **Published package**, **Topology circle**, **Topology overlay**, and **Package Tier** with manifest-driven topology and the live `capability-gateway-backend` tier. `CONTEXT-MAP.md` now references the package-topology cluster. ADR 0022 records `sdl.subpackages` as the architecture-unit source of truth and `sdl.remainder: true` as the explicit transitional state.

## Follow-Ups

Proceed to the rules-of-the-road guard row next: enforce declared-state conformance for packages that declare subpackages/remainder, without adding new import-graph analysis.
