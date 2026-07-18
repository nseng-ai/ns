# Herdr optional Slot label enrichment corrected

**When:** 2026-07-18
**Evidence:** local branch `herdr-optional-slot-label-enrichment` (stacked on
`coordinate-slots-consumer-contracts`).

## Summary

Herdr goal (`/ns:herdr:space:goal`) and Objective sidebar
(`/ns:herdr:sidebar:objective-summary`) labels add the compact Slot prefix only when both
facts hold: canonical managed-Slot path shape (`slotLabelInput()`) and exact Slots extension
presence through `NsExtensionApi.hasExtension("@nseng-ai/slots")`.

- Herdr core retains the narrow injectable `HasHerdrSlotsCapability` predicate in
  `ts/packages/capabilities/herdr/src/core/slots-capability.ts` and remains Pi-host independent.
- The SDK owns one canonical complete-API constructor shared by normal CLI/completion execution
  and the ns-host factory.
- `createRealNsExtensionApi()` in `@nseng-ai/ns/cli` creates fresh real services, loads the same
  effective preinstalled/project extension catalog as the CLI, and returns a complete API.
- `.pi/extensions/herdr.ts` is the explicit composition root. It snapshots the current environment
  and forwards the command handler's cwd to the ns-host factory for each relevant invocation.
- Herdr's invocation context retains the complete API, while both core workflows receive only the
  narrow predicate. Construction is lazy, so existing validation/model early returns do not load
  the registry.
- API-construction failure and normal Slots absence both degrade optional label enrichment to an
  unprefixed successful rename. No fake partial API encodes failure.
- No Pi command-name inference, subprocess probe, package-resolvability check, or private registry
  inspection remains in Herdr.

Herdr dispatch and open-branch flows remain explicitly Slots-backed and require `SlotClient`;
optional label enrichment does not weaken that product contract.

## Validation

Focused SDK, ns-host, and Herdr package typechecks and tests pass. The final repository-gate results
for this correction are reported with the branch implementation.

## Objective Impact

- Corrects the completed roadmap row's stale claim that Pi's mirrored `ns:slot:*` command surface
  was the supported presence fact.
- Records explicit project-adapter composition as the Pi-host ownership boundary.
- Retires command-surface inference for Herdr while preserving the two-fact prefix contract and
  silent optional fallback.

## Follow-Ups

Remaining consumers (cmux sidebar identity, Flow opt-in, skill prerequisites, and Graphite topology
ownership) continue on their existing roadmap rows.
