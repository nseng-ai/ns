# Post-submit downstack feedback follow-up

## Summary

After the closure PR was submitted, a new top follow-up branch refreshed unresolved downstack review threads for PRs #3222, #3226, and #3229 and addressed the remaining feedback without rewriting historical downstack commits.

Refreshed thread commands:

```bash
ns address exec pr-review-threads --pr-number 3222 --format json > /tmp/ns-pr-3222-threads.json
ns address exec pr-review-threads --pr-number 3226 --format json > /tmp/ns-pr-3226-threads.json
ns address exec pr-review-threads --pr-number 3229 --format json > /tmp/ns-pr-3229-threads.json
```

Disposition before submit/thread mutation:

- PR #3222 `PRRT_kwDOR4YhMs6PFJOT` (`schrockn`): fixed/answered by comments on `DiscoverExtensionModuleHarnessArtifactsRequest`; `env` is required-present and `homeDir` may be undefined only to mean no explicit HOME override.
- PR #3222 `PRRT_kwDOR4YhMs6PFJut` (`schrockn`): fixed/answered by the shared XDG HOME merge contract; undefined `xdgHomeDir` preserves inherited/caller HOME.
- PR #3222 `PRRT_kwDOR4YhMs6PFKXg`, `PRRT_kwDOR4YhMs6PFKXi`, `PRRT_kwDOR4YhMs6PFLHd`, `PRRT_kwDOR4YhMs6PFO-J`, `PRRT_kwDOR4YhMs6PFPS_`, `PRRT_kwDOR4YhMs6PFPzK`: fixed by `mergeXdgHomeEnv` in `@nseng-ai/foundation/xdg-path`, used by both kernel catalog discovery and module artifact discovery, with tests for HOME preservation/override semantics.
- PR #3222 `PRRT_kwDOR4YhMs6PFO-M`: fixed by `NsCliRawContextInputs`, replacing duplicate raw parameter object shapes in the kernel CLI context helpers.
- PR #3226 `PRRT_kwDOR4YhMs6PHIlc`: fixed by `matchProvisionFirstPartySkillFailure`, exported through the harness-artifacts API and used by both `ns skills install` and ns-init materialization adapters.
- PR #3229 `PRRT_kwDOR4YhMs6PHuhK`, `PRRT_kwDOR4YhMs6PHvQ-`: fixed by restoring explicit `optionalEntry` spreads in `normalizeModuleArtifactDiscoveryDiagnostic` and removing the speculative generic optional-field loop.

Thread mutation status: completed after follow-up PR #3243 became visible. `ns address exec close-review-threads` replied/resolved all refreshed unresolved threads for PRs #3222, #3226, and #3229; final refresh showed zero unresolved threads across those PRs.

## Objective Impact

This is post-closure hygiene for the closed child Objective. It keeps the closure narrative truthful by recording that downstack review feedback discovered after PR #3241 submission was handled in a top follow-up branch rather than by mutating downstack commits.

Code evidence:

- `ts/packages/infra/foundation/src/config/xdg-path.ts` now owns `mergeXdgHomeEnv`.
- `ts/packages/infra/foundation/test/xdg-path.test.ts` covers base HOME preservation, caller HOME override, XDG HOME override precedence, and unrelated env preservation.
- `ts/packages/capabilities/harness-artifacts/src/module-artifact-discovery.ts` uses the shared helper, documents required-present env/homeDir semantics, and restores canonical optional-entry diagnostic normalization.
- `ts/packages/kernel/src/extensions/registry.ts` uses the shared helper and deletes the local XDG env helper/middle-man.
- `ts/packages/kernel/src/cli/index.ts` uses `NsCliRawContextInputs` for both adjacent context resolution helpers.
- `ts/packages/capabilities/harness-artifacts/src/first-party-skill-provisioning.ts` exports a matcher over `ProvisionFirstPartySkillFailure`; `src/api.ts` re-exports it.
- `ts/packages/capabilities/harness-artifacts/src/ns/skills-install.ts` and `ts/packages/capabilities/ns-init/src/real-skill-materializer.ts` consume the matcher while preserving adapter-owned messages/output shapes.

Validation performed before this update:

```bash
pnpm --dir ts --filter @nseng-ai/foundation run check
pnpm --dir ts --filter @nseng-ai/foundation run test
pnpm --dir ts --filter @nseng-ai/kernel run check
pnpm --dir ts --filter @nseng-ai/kernel run test -- test/unit/extension-registry.test.ts test/integration/extension-registry-shim-loading.test.ts test/integration/flow-extension-registry.test.ts
pnpm --dir ts --filter @nseng-ai/harness-artifacts run check
pnpm --dir ts --filter @nseng-ai/harness-artifacts run test -- test/module-artifact-discovery.test.ts test/provision-apply.test.ts test/skills-path.test.ts
pnpm --dir ts --filter @nseng-ai/ns-init run check
pnpm --dir ts --filter @nseng-ai/ns-init run test -- test/integration/real-skill-materializer.test.ts
pnpm --dir ts run lint
just ts-format-check
just dprint-check
```

All commands passed after one local exact-optional/type-inference fix. Historical Semantic Updates were not rewritten; the known pre-existing heading issue in `20260707T234420Z-home-dir-harness-path-ownership.md` remains intentionally untouched.

## Follow-Ups

- Follow-up PR submitted as #3243: https://github.com/nseng-ai/ns/pull/3243.
- Thread mutation completed with `ns address exec`; final refresh showed zero unresolved threads for PRs #3222/#3226/#3229.
- No refreshed threads were left open.
