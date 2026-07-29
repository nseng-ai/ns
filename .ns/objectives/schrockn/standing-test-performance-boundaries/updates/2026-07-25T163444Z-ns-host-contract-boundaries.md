# ns host contracts separate static defaults from dynamic loading

## Summary

Corrected the first layering of the `@nseng-ai/ns` host suite after profiling showed that its supposedly default-safe composition contracts still dynamically imported every real preinstalled command module during root help.

Final ownership is explicit:

- `test/sdk-export-surfaces.test.ts` owns static checkout-source SDK barrel parity;
- `test/preinstalled-command-catalog.test.ts` owns static host registration/catalog integrity without invoking lazy loaders;
- package-owned default CLI contract tests in `@nseng-ai/ns-init` and `@nseng-ai/harness-artifacts` exercise real command objects through fake SDK registry/context seams;
- `test/integration/preinstalled-command-loading-host.test.ts` owns exactly three real preinstalled dynamic-loading smokes: root help, selected `init --help`, and selected `skills list --help`;
- the existing host integration files retain real non-Git and skills provisioning behavior.

The former `test/ns-cli-host-contracts.test.ts` was removed after its assertions were assigned to the static host test, package-owned contract suites, existing SDK coverage, or the three dynamic-loading smokes.

## Boundary lesson

A non-spawning command context does not make a default CLI test static or cheap when command discovery still calls lazy module loaders. Classify dynamic module import as an integration boundary independently from subprocess and filesystem behavior.

For descriptor-based preinstalled commands, default host tests should inspect the real registration/catalog source of truth without invoking loader thunks. Broad help, schema, usage, alias, envelope, and command behavior contracts belong with package-owned command objects and injected registry/context fakes. Retain a small host integration set to prove that the actual descriptor loaders compose correctly.

## Performance evidence

- Original mixed baseline retained from the first implementation: median test time 293 ms.
- Transitional baseline command: `corepack pnpm@11.8.0 --dir ts exec vitest run --config vitest.config.ts --reporter=verbose packages/hosts/ns/test/sdk-export-surfaces.test.ts packages/hosts/ns/test/ns-cli-host-contracts.test.ts`.
- Transitional baseline on 2026-07-25: combined test times 204/187/176 ms (median 187 ms); Vitest durations 692/840/555 ms; wall times 1.19/1.24/0.93 s. The first root-help contract alone cost 177/159/153 ms, while subsequent contracts cost 0–4 ms.
- Corrected default command: the same pinned toolchain and reporter targeting `sdk-export-surfaces.test.ts` and `preinstalled-command-catalog.test.ts`.
- Corrected result: combined test times 12/11/6 ms (median 11 ms); Vitest durations 386/353/291 ms; wall times 0.82/0.76/0.73 s.
- The corrected 11 ms median is below the directional 50 ms threshold, materially beats the transitional 187 ms median, and is a 282 ms reduction from the original 293 ms median. Transform/import and wall-time variance remain larger than test execution variance, so these are targeted default-file measurements rather than a repository-wide speed claim.
- Cost handling: real preinstalled module loading moved to explicit integration; package-owned default contracts use no dynamic loader or real subprocess/filesystem setup.

## Coverage and lane evidence

Static host coverage asserts exactly the `@nseng-ai/ns-init` and `@nseng-ai/harness-artifacts` registrations, their display paths, the full nine-command lazy inventory, built-in grouping metadata, no Objective path, and `hasStaticCommandInfo: false` without calling `.load()`.

`@nseng-ai/ns-init` now owns loaded init help plus extension install/list/uninstall help, schema, usage, and retired-alias contracts. `@nseng-ai/harness-artifacts` owns skills list/path help and machine contracts plus update help/schema/failure/retired-flag contracts. Existing SDK scenarios retain generic root grouping and extension point/points merging behavior. Existing host integration retains real non-Git mapping, path matrices, and skills install/manifest/conflict bytes.

Default host discovery lists nine tests across `pi-text-generation`, `sdk-export-surfaces`, and `preinstalled-command-catalog`, with no integration file. Integration discovery lists all three `preinstalled-command-loading-host` smokes. The selected focused run passed 14 default contract tests across four files and 11 integration tests across the new loader smoke plus the existing extension/skills host files.
