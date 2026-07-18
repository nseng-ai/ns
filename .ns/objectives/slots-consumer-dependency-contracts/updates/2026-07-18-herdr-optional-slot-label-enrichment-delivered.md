# Herdr optional Slot label enrichment delivered

**When:** 2026-07-18T20:52Z
**Evidence:** local branch `herdr-optional-slot-label-enrichment` (stacked on
`coordinate-slots-consumer-contracts`), completing partial commit `5fd5dc2fb`.

## Summary

Herdr goal (`/ns:herdr:space:goal`) and Objective sidebar
(`/ns:herdr:sidebar:objective-summary`) labels now add the compact Slot prefix only when
both facts hold: canonical managed-Slot path shape (`slotLabelInput()`) and a successful
Slots capability probe.

- One Herdr-owned injectable predicate: `HasHerdrSlotsCapability` in
  `ts/packages/capabilities/herdr/src/core/slots-capability.ts` (core stays Pi-host
  independent).
- One production implementation: `createHerdrSlotsCapabilityProbe` in
  `src/pi/slots-capability.ts` inspects Pi's registered commands for an `ns:slot:*`
  surface. Those commands are mirrored from the ns SDK effective extension registry,
  so this uses the SDK extension-presence fact without spawning a subprocess. The probe
  is constructed at both Pi composition roots (`src/pi/space-goal.ts`,
  `src/pi/sidebar.ts`) and injected into `handleHerdrSpaceGoal()` and
  `createHerdrSidebarController()`. The prior direct probe inside core goal logic was
  removed.
- Sidebar command description now promises the prefix only when the Slots command
  surface is available.

Decision recorded: absence of the SDK-mirrored `ns:slot:*` command surface is
optional-capability absence: the label stays unprefixed and the Herdr rename proceeds.

Tests and docs: workflow tests inject predicate state (goal: managed+available,
managed+unavailable, ordinary cwd; sidebar: available/unavailable split) and assert
early-return paths never invoke the predicate; focused adapter test
`test/herdr-slots-capability.test.ts` covers registered, absent, and similarly prefixed
command surfaces without subprocess execution. `README.md` and `CONTEXT.md` state the
two-fact prefix contract and add the **Slots capability probe** term, distinguishing path
identity from capability availability.

Validation: `pnpm --dir ts --filter @nseng-ai/herdr test` and full `just` (format, lint,
typecheck, TypeScript style guard, full Vitest suite, objective sweep) passed.

## Objective Impact

- Completes the roadmap row "Correct optional Herdr label enrichment" (marked `[x]`).
- Herdr dispatch and open-branch flows remain explicitly Slots-backed and required
  (`SlotClient`); label enrichment being optional does not weaken that contract.
  Pluggable dispatch stays future direction (Parked).
- Partially retires the "package resolution, extension presence, and path shape remain
  conflated" risk for the Herdr consumer: labels now use two independent facts.

## Follow-Ups

- None specific to Herdr labels; remaining consumers (cmux sidebar identity, Flow
  opt-in, skill prerequisites, Graphite topology ownership) continue on their existing
  roadmap rows.
