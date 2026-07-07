# Live review feedback and branch context rebaselined

## Summary

Rebaselined the harness-artifacts post-review cleanup Objective from merged PR / review-thread evidence on 2026-07-07. Current branch context is `master`; `git status --short` is clean; `gt ls` shows no active local harness-artifacts stack above `master`. The relevant harness-artifacts branches are already merged:

- PR #3172 `harness-artifacts-api-reexport-force-rename` — merged; no unresolved review threads returned.
- PR #3140 `harness-artifacts-review-feedback-remediation` — merged; four unresolved threads returned.
- PR #3137 `harness-artifacts-stack-feedback-auto-remediation` — merged; one unresolved thread returned.
- PR #3121 `harness-artifacts-root-migration-conflict-remediation` — merged; one unresolved thread returned.
- PRs #3158–#3163 from the `harness-thermo/*` remediation stack — merged; unresolved threads returned on #3158, #3159, #3161, #3162; none on #3160/#3163.

Live/stale review-thread inventory by cleanup bucket:

### Home-dir / harness-path ownership

- **Live:** PR #3158 thread `PRRT_kwDOR4YhMs6O7NTb` (`ts/packages/kernel/src/cli/index.ts`) flags the `cwd` / `env` / `homeDir` clump duplicated across `handleCompletionResolverInvocation`, `buildNsCliContext`, and `RealNsCommandContextOptions`. Current code still repeats those option fields in `ts/packages/kernel/src/cli/index.ts` and `ts/packages/kernel/src/cli/context.ts`.
- **Resolved by merged work, no open thread:** PR #3172 has no unresolved threads. Current code has centralized `resolveHomeDir` usage in kernel/ns-init paths and explicit `homeDir` propagation into harness-artifacts command contexts; the remaining home-dir work is the option-shape ownership cleanup above, not the earlier fallback-sentinel issue.

### Provision/reconcile design seams

- **Live:** PR #3137 thread `PRRT_kwDOR4YhMs6Oxej4` (`reconcileOutcomeFromProvision`) flags mixed ownership of reconcile action classification. Current `reconcileOutcomeFromProvision` still accepts optional `action` and otherwise calls `classifyReconcileAction`.
- **Live:** PR #3121 thread `PRRT_kwDOR4YhMs6O0MTk` flags duplicated conflict-file extraction. Current dry-run reconcile still filters `prepared.value.decisions.files` inline while `applyPreparedProvision` also filters conflicts.
- **Live:** PR #3159 threads `PRRT_kwDOR4YhMs6OzS1q`, `PRRT_kwDOR4YhMs6OzS1u`, `PRRT_kwDOR4YhMs6O0K-1`, and `PRRT_kwDOR4YhMs6O54-H` flag duplicated outcome builders, a bare throw in `skippedCollisionOutcomes`, dead/pass-through preview wrapper vs duplicated preview shape, and conflict-message construction spread across callers. Current code still has `skippedCollisionOutcomes`, `reconcileConflictedOutcome`, `reconcileOutcomeFromProvision`, exported `previewHarnessArtifactProvision`, and separate conflict messages in `skills-install.ts` / `real-skill-materializer.ts`.
- **Live, lower urgency:** PR #3161 thread `PRRT_kwDOR4YhMs6OzSl6` flags repeated switches over `ProvisionFirstPartySkillOutcome` in two adapters; review text says not urgent until a third adapter appears.
- **Live:** PR #3161 thread `PRRT_kwDOR4YhMs6O6UXL` flags repeated `plan` / `decisions` / `manifestPath` outcome clump. Current `ProvisionFirstPartySkillOutcome` and `provisionFirstPartySkill()` still repeat and hand-assemble the trio.
- **Verified stale:** PR #3161 thread `PRRT_kwDOR4YhMs6O66dc` says `ns/preinstalled-catalog.ts` reinvented canonical catalog entry construction. Current code already uses `repoLocalNsExtensionToPreinstalledCatalog`, `repoLocalNsCommandDescriptor`, and `repoLocalNsCommandDescriptorToPreinstalledCatalogEntry`, so this thread is stale on `master`.

### Schema / source-of-truth duplication

- **Live:** PR #3140 thread `PRRT_kwDOR4YhMs6Oxehs` flags readonly-vs-mutable spread boilerplate from zod array outputs. Current reconcile schemas still use `z.array(...)` without `.readonly()`, and report construction still spreads `plan.orphans`, `moduleDiscovery.diagnostics`, and `plan.skippedCollisions`.
- **Live:** PR #3140 threads `PRRT_kwDOR4YhMs6Oxr-l` and `PRRT_kwDOR4YhMs6O6Vsp` flag duplicate harness/scope/source-type schema literals. Current `reconcile.ts` has local `harnessSchema`, `scopeSchema`, and repeated `z.enum(["first-party", "npm-module"])` source type schemas.
- **Live:** PR #3140 thread `PRRT_kwDOR4YhMs6Oxr-n` flags repeated diagnostic field enumeration in `module-artifact-discovery.ts`. Current transform still re-enumerates every optional field via `optionalEntry`.
- **Live:** PR #3161 thread `PRRT_kwDOR4YhMs6O2k90` flags duplicated `ProvisionPlanFile` / `ProvisionFileDecision` interfaces and zod schemas. Current `provision-plan.ts` still hand-authors both.
- **Out of this Objective unless a cleanup slice deliberately includes areg tail:** PR #3162 thread `PRRT_kwDOR4YhMs6O67Wa` flags repeated AREG project-fs error-code string literals. The issue appears live in `ts/packages/tools/areg/src/gateways/project-fs.ts`, but it is AREG-tail cleanup rather than core harness-artifacts cleanup.
- **Verified stale:** PR #3162 thread `PRRT_kwDOR4YhMs6O7Nmh` says `ManifestSourceFinding` should be an interface. Current code has `export interface ManifestSourceFinding` in `ts/packages/tools/areg/src/operations/manifest-source-findings.ts`, so this thread is stale on `master`.

No GitHub review-thread mutations were performed.

## Objective Impact

The first roadmap row, **Rebaseline live review feedback and branch context**, is substantively complete: the merged stack and unresolved thread inventory are known, and the remaining cleanup work is now bucketed. The next useful implementation slice is **Resolve home-dir and harness-path ownership** by factoring the kernel CLI caller context / option clump around `cwd`, `env`, and `homeDir`, because it is the smallest single-bucket cleanup and directly exercises the Objective's cross-package ownership risk.

## Follow-Ups

- Implement the home-dir / harness-path ownership slice first; then validate and update the Objective.
- After implementation and validation, only close/reply to review threads with explicit user authorization; candidates for stale closure include `PRRT_kwDOR4YhMs6O66dc` and `PRRT_kwDOR4YhMs6O7Nmh`.
- Keep AREG-only tail findings separate unless they are deliberately parked back to `skill-management-subsystem` or included in a scoped cleanup slice.
