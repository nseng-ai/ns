# Roadmap

## Work

- [x] Spawn the Clinkr Readme-Driven-Development Subobjective as the gate dry run. `clinkr-readme-driven-development` owns the contract draft, audit, reconciliation, promotion, and gate-calibration work.
- [x] Hard-cut Foundation to `@nseng-ai/ns-foundation` as the immediate prerequisite slice. The package path/name, workspace consumers, lockfile, release/tool fixtures, current guidance, and superseding ADR now use the ns-foundation identity; exports, version, behavior, and the Clinkr dependency remain unchanged. Follow-up ADR 0050 provisionally classifies ns-foundation in the existing `sdk` tier.
- [ ] Receive and synthesize the Clinkr dry run's lessons and process amendments here before starting the ns-foundation README package pass.
- [ ] Run the ns-foundation package Subobjective after Clinkr synthesis. ns-foundation depends on Clinkr and still has no package README or draft.
- [ ] Run the Brmem package Subobjective after ns-foundation. Brmem already has a README, but file presence is not completion evidence for this process.
- [ ] Run the SDK package Subobjective after ns-foundation. The extension vocabulary gate is satisfied; SDK already has a README, but no package child or draft exists.
- [ ] Run the Extension Kit package Subobjective after SDK. The former Capability Kit has already been renamed to `ts/packages/public/extension-kit`; it currently has no package README or draft.
- [ ] Synthesize cross-package lessons and the calibrated gate definition, then hand the result to `professional-repo-curation` for future incubator graduations.

## Parked

- ns-foundation module redistribution or export redesign; split focused ownership work from the identity cutover and discuss it before implementation.
- A distinct package-tier taxonomy for ns-foundation; ADR 0050 uses the existing `sdk` tier for now, pending contrary evidence from later package work.
- ns-foundation refactoring proposals that exceed later README contract reconciliation; split them into separate records after discussion with the user.
