# Roadmap

## Work

- [~] Land the current consolidation stack under this Objective.
  Evidence to preserve: `extension-registry-shim-loading-coverage-split` (open PR #3052) moves real shim-loading checks to the integration lane; `subagent-fleet-dispatch-runner-subagent` (open PR #3069) consolidates explore, dispatch runner subagents, transcript viewing, and fleet navigation under the unified `@nseng-ai/ns-pi-subagents` extension; `stack-feedback/extension-workspace-helper` (open PR #3071) extracts the shared kernel extension-registry test workspace helper. Update this row with merge evidence when the stack lands.
  - Policy: human-owned. The Objective Runner never submits, pushes, or merges; runner steps for the rows below stack on top of these unlanded branches.
- [x] Rename the consolidated command surface to `ns:agents:*`.
      Completed 2026-07-06: `ns:subagents:fleet` → `ns:agents:fleet`; `ns:explore:transcript` → `ns:agents:transcript`; widget/status keys use `ns.agents.fleet`; shim `.pi/extensions/subagents.ts` moved to `.pi/extensions/agents.ts` while keeping the `.pi/lib/workspace-packages.ts` mapping unchanged. No compatibility aliases were added. Package name `@nseng-ai/ns-pi-subagents` and the `explore` / `dispatch_runner_subagent` tool names are unchanged. Updated `docs/pi/README.md`, `docs/pi/runner-subagent-helper.md`, package README/docs-site path references, and the `CONTEXT-MAP.md` `@nseng-ai/ns-pi-subagents` vocabulary line to record the agents-view vs. subagent-substrate split.
  - Policy: direct execution.
  - Evidence: `pnpm --dir ts/packages/extensions/ns-pi-subagents run test` passed (21 files, 191 tests); `pnpm --dir ts/packages/extensions/ns-pi-subagents run check` passed via tsgo; extension/package tests assert `ns:agents:fleet` and `ns:agents:transcript` are registered and old commands are absent; stale-name grep leaves only negative assertions and Objective history.
- [ ] Rebaseline package and shim documentation after the rename.
      Rename slice note 2026-07-06: the narrow command-surface changes already updated `docs/pi/README.md`, `docs/pi/runner-subagent-helper.md`, package README command/key names, and `docs-site/lib/extensions-catalog.ts` shim path. This row remains open for a broader consistency sweep of `docs/pi/`, the docs-site catalog, and package README now that the canonical entrypoint and `ns:agents:*` names are in place. Historical records (`docs/retros/*`, other objectives' reference files) stay untouched. No live code references `@internal/pi-tools/runner-subagents` (verified by audit).
  - Policy: direct execution; doc-wording judgment calls are runner-decidable with rationale in the step report.
- [ ] Audit package exports and test-helper ownership.
      Concrete inputs: the kernel test helper `ts/packages/kernel/test/helpers/extension-workspace.ts` (consumed by kernel unit and integration extension-registry tests) and the package-local testing subpath exports `@nseng-ai/ns-pi-subagents/explore/testing` and `.../runner-subagents/testing`. Decide for each piece whether it is production/package API, exported test-support API, or a local test fixture, and adjust exports accordingly. Keep real module-resolution coverage in the integration lane and fake-backed behavior coverage in default/package tests.
  - Policy: direct execution; ownership decisions are runner-decidable, recorded in a Semantic Update.
- [x] Decide compatibility posture for renamed fleet/explore surfaces.
      Resolved 2026-07-06: the consolidated surface is `ns:agents:*` only, with no compatibility aliases for older `ns:subagents:*` / `ns:explore:*` names — consistent with the standing no-aliases policy in `docs/pi/README.md`. Implementation is the rename row above.
- [ ] Assess and record external distribution readiness for `@nseng-ai/ns-pi-subagents`.
      Investigate whether internal substrate dependencies still block external package use (the package is currently `private: true`, ships raw `src/`, and its devDependency on `@internal/pi-tools` plus consumers like thermo-council are the suspected coupling). Record the findings as a Semantic Update: either the remaining blockers and a promotion path, or a statement that packaging is unblocked with a specified release slice for a human to pick up.
  - Policy: assess-and-record only. No packaging, bundling, version, or publish changes without an explicit human request.

## Parked

- Shared higher-level orchestration across explore, dispatch runner subagents, and thermo-council remains parked unless a new caller demonstrates a neutral abstraction that preserves each capability's result contract, progress model, and recovery semantics.
