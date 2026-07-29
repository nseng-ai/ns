# Roadmap

## Work

- [x] Restore integration-lane placement after the package restructure. Current representative files are `ts/packages/infra/foundation/test/integration/exec/exec-run-command.test.ts`, two Extension Kit smokes under `ts/packages/extension-kit/test/integration/`, and Branch Context's real-Brmem smoke under `ts/packages/incubator/branch-context/test/integration/`. Shared globs cover top-level packages, grouped packages, and review tools.
- [x] Establish the isolated lane and guard the package-test shared-cache contract. `just ts-test-isolated`, a separate CI job, lane-specific Vitest config, and source guards exist; default `just` deliberately omits the isolated lane. This was containment and determinism work, not a measured speedup.
- [~] Periodically migrate one evidenced boundary family at a time. Preserve application behavior through fake-driven default tests, retain focused real-adapter coverage in integration, and record measured timing only when claiming performance improvement.
- [~] Rebaseline after package/test-tree restructures and choose fresh candidates from real Git, subprocess/cold runtime, sqlite/metadata, loader, network, time, or repeated integration-setup evidence. The latest landed host-contract slice separated static host/catalog contracts from dynamic loading and reduced its targeted default median from 187 ms to 11 ms; `updates/2026-07-25T163444Z-ns-host-contract-boundaries.md` carries the evidence.
- [ ] Decide whether to add a structural lane-placement guard. Current glob tests prove configured inclusion/exclusion but do not scan the filesystem for nested `test/*/integration/` or equivalent misplaced specialized directories.
- [ ] Resolve the shared-cache guard scope mismatch: source rules currently cover `ts/packages/` tests, while shared Vitest globs also include `.ns/reviews/*/tools/*`. Either extend enforcement with adversarial coverage or narrow documentation explicitly.
- [ ] Extract repeated seams or repository-wide rules only after multiple slices prove the same shape; keep package-local seams preferred.

## Parked

- [ ] Automated slow-test inventory or threshold gate, until repeated manual samples establish a stable low-noise signal.
