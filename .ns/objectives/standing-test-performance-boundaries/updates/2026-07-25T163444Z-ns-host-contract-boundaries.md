# ns host contracts now enforce non-spawning default execution

## Summary

Re-layered the mixed `@nseng-ai/ns` host suite into explicit responsibility and performance boundaries:

- `test/sdk-export-surfaces.test.ts` owns static checkout-free SDK barrel parity;
- `test/ns-cli-host-contracts.test.ts` owns default-lane host composition and CLI contracts through the real `runNsCli` entrypoint and real preinstalled registrations;
- `test/integration/extension-install-host.test.ts` now includes one narrow real-context non-Git repository smoke;
- `test/integration/skills-install-host.test.ts` owns the two selected real-filesystem skills smokes: successful install/manifest creation and local-edit refusal/preservation.

The mixed `test/ns-cli.test.ts` was removed after its contracts were assigned explicit owners.

## Boundary lesson

Host composition tests should inject a non-spawning `NsCliBaseContext` unless real adapter behavior is the explicit subject. The host-local fake records semantic exec attempts, scripts only the expected `git rev-parse --show-toplevel` outside-repository probe used by three contracts, and throws for every other attempted command. This preserves proof that tests traverse `runNsCli` and its real `ns-init`/harness-artifacts registrations without permitting accidental subprocess execution.

Implementation revealed that skills list/path and bare update perform a repository-root probe even though they continue outside a repository. The default tests therefore assert the exact fake probe rather than incorrectly asserting that these commands never call the injected exec seam.

## Performance evidence

- Measured baseline command: `node ~/.cache/node/corepack/v1/pnpm/11.8.0/bin/pnpm.cjs --dir ts exec vitest run --config vitest.config.ts packages/hosts/ns/test/ns-cli.test.ts`.
- Baseline: 16 tests; file test times 321/293/286 ms (median 293 ms, range 286–321 ms); total Vitest durations 774/780/690 ms; command wall times 1.20/1.22/1.03 s.
- Measured post-change command: the same pinned pnpm/Vitest config targeting `sdk-export-surfaces.test.ts` and `ns-cli-host-contracts.test.ts`.
- Post-change: 13 tests; combined test times 273/188/163 ms (median 188 ms, range 163–273 ms); total Vitest durations 897/667/534 ms; command wall times 1.41/1.10/0.91 s.
- Repetition/noise: both measurements used three consecutive local runs. Transform/import and wall-time variance is large; the narrower test-time median improved by 105 ms, but this is not evidence of a repository-wide speedup.
- Cost handling: subprocess cost was eliminated from the retained default host contracts through the injected context. One real non-Git adapter smoke and two real skills filesystem smokes shifted to integration. The old dry-run filesystem assertion was not duplicated at host level because `@nseng-ai/harness-artifacts` already owns fake-driven dry-run/no-write semantics; host registration remains covered by list/path plus the real install smokes.
- Coverage retention: static export parity, help/grouping/registration, extension metadata/schema/usage/alias behavior, skills list/path wiring, update contracts, stable real non-Git mapping, successful skills provisioning/manifest creation, and local-edit preservation all remain represented.

## Lane evidence

Normal package-tree discovery with `vitest list` showed both new default files and no `test/integration/` files under the default config. Integration discovery listed `extension-install-host.test.ts`, `skills-install-host.test.ts`, and the existing `skills-path.test.ts` under `vitest.integration.config.ts`.

Targeted validation passed 13 default tests and 9 selected integration tests. The package default test script passed 3 files / 18 tests and did not include integration files.
