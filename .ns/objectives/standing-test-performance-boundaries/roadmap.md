# Roadmap

## Work

- [x] Restore integration-lane placement after the package restructure. Current representative files are `ts/packages/infra/foundation/test/integration/exec/exec-run-command.test.ts`, two Extension Kit smokes under `ts/packages/extension-kit/test/integration/`, and Branch Context's real-Brmem smoke under `ts/packages/incubator/branch-context/test/integration/`. Shared globs cover top-level packages, grouped packages, and review tools.
- [x] Establish the isolated lane and guard the package-test shared-cache contract. `just ts-test-isolated`, a separate CI job, lane-specific Vitest config, and source guards exist; default `just` deliberately omits the isolated lane. This was containment and determinism work, not a measured speedup.
- [x] Establish the sanity lane for code-unchanged concrete-adapter testing that mocks only low-level runtime/vendor modules. `test/sanity/` runs with `isolate: true` through `just ts-test-sanity`, is included in default `just` / `just check` as a separate invocation, and is reported in a separate non-draft CI job. Gitplane's initial suite has 24 tests; existing integration tests remain for actual Git/filesystem/process compatibility. No speedup is claimed.
- [x] Make the local aggregate boundary explicit. Default `just` / `just check` runs core validation plus sanity as a separate isolated invocation, without integration, isolated, or the TypeScript style guard. The omitted lanes remain available through dedicated recipes; opt-in `just ci` additionally includes integration and the style guard, while isolated remains explicit. This records command topology, not a measured speedup.
- [~] Periodically migrate one evidenced boundary family at a time. Preserve application behavior through fake-driven default tests, retain focused real-adapter coverage in integration, and record measured timing only when claiming performance improvement.
- [~] Rebaseline after package/test-tree restructures and choose fresh candidates from real Git, subprocess/cold runtime, sqlite/metadata, loader, network, time, or repeated integration-setup evidence. The latest landed host-contract slice separated static host/catalog contracts from dynamic loading and reduced its targeted default median from 187 ms to 11 ms; `updates/2026-07-25T163444Z-ns-host-contract-boundaries.md` carries the evidence.
- [ ] Decide whether to add a structural lane-placement guard. Current glob tests prove configured inclusion/exclusion but do not scan the filesystem for nested `test/*/integration/`, `test/*/isolated/`, `test/*/sanity/`, or equivalent misplaced specialized directories.
- [ ] Resolve the shared-cache guard scope mismatch: source rules currently cover `ts/packages/` tests, while shared Vitest globs also include `.ns/reviews/*/tools/*`. Either extend enforcement with adversarial coverage or narrow documentation explicitly.
- [ ] Extract repeated seams or repository-wide rules only after multiple slices prove the same shape; keep package-local seams preferred.

## Parked

- [ ] Automated slow-test inventory or threshold gate, until repeated manual samples establish a stable low-noise signal.
