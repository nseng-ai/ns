# Autoslot Decoupling and Dual-Surface Gating Delivered

## Summary

The autoslot slice is implemented on the current branch in commit `f94abe726`. Flow now owns checkout domain logic that invokes `ns slot checkout --format json` through the existing injected command-exec seam for current-commit and named-branch modes, validates the command envelope, preserves valid Slots domain failures, and turns execution or malformed-protocol failures into Flow-owned typed outcomes. Because JSON mode suppresses Slots' ordinary navigation side effect, the domain logic writes the established parent-shell cd directive only after validated success. The initially delivered high-level checkout Gateway was subsequently removed so tests fake the external command capability beneath Flow-owned policy.

The ns command entry now requires exact effective-catalog presence of `@nseng-ai/slots`. The Pi mirror resolves the same package identity from the startup catalog and omits only `/ns:flow:autoslot` when Slots is absent. Flow production source no longer imports the Slots package, and the Flow manifest and generated lockfile importer edge no longer declare it.

Focused checkout-logic, autoslot scenario, Slots JSON checkout, SDK catalog, and ns/Pi registration tests cover success, domain refusal, execution/protocol failure, navigation, and present/absent catalogs without a real Slots backend in default tests. Full `just` passed on the implementing branch.

## Objective Impact

The autoslot roadmap row is complete. The direct package coupling and ns/Pi command-surface divergence risks are de-risked: installing Slots adds autoslot, while Flow remains loadable without Slots and crosses the CLI boundary only when the gated command is available.

The Objective remains open because land still needs invocation-time Slots presence and explicit stale-path degradation, and the README/code-adjacent contract still describes Slots as required.

## Follow-Ups

- Implement the land degradation slice: pass `hasExtension("@nseng-ai/slots")` at invocation time, block stale pre-merge conflicts with manual-detach guidance when absent, and report post-landing cleanup as skipped.
- Align the Flow README and code-adjacent guidance with the optional-Slots contract.
- Record completion evidence for the linked `slots-consumer-dependency-contracts` synthesis.
