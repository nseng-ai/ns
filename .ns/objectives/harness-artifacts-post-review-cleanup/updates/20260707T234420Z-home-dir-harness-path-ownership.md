# Home-dir and harness-path ownership resolved

## Summary

Implemented the home-dir / harness-path ownership slice for the review bucket tracked by PR #3158 thread `PRRT_kwDOR4YhMs6O7NTb`.

The kernel CLI no longer threads repeated `cwd` / `env` / `homeDir` option clumps through command loading, completion resolution, and command-context construction. `ts/packages/kernel/src/cli/index.ts` now resolves one `NsCliCommandContextInput` at ingress, then adapts it deliberately into:

- command execution context (`cwd`, `env`, compatibility `homeDir`), and
- catalog discovery context (`xdgHomeDir`) for XDG/global extension root resolution.

`LoadNsCommandCatalogOptions` now names the XDG-specific home value as `xdgHomeDir`, making the HOME remapping a catalog-discovery concern instead of a generic command SDK ownership signal.

Harness path semantics remain owned by `@nseng-ai/harness-artifacts` through `HarnessPathContext`. The user-scope missing-home diagnostic now points callers at the harness path context rather than `NsExtensionApi.homeDir`.

`@nseng-ai/ns-init` now adapts `NsExtensionApi` into a `SkillMaterializationContext` in its command/API adapter. `RealSkillMaterializer` no longer owns home fallback resolution; it receives the materialization context it needs and remains a thin adapter over `provisionFirstPartySkill()`.

`NsExtensionApi.homeDir` was not removed in this slice. It remains as a compatibility ingress field because full SDK removal would spill into unrelated command fakes and broader command-facing API migration. The SDK comment and reference docs now explicitly say command packages should adapt it into domain-specific contexts instead of treating it as the owner of harness path or XDG discovery semantics.

## Files changed

- `ts/packages/kernel/src/cli/index.ts`
- `ts/packages/kernel/src/extensions/registry.ts`
- `ts/packages/kernel/src/sdk/execution.ts`
- `ts/packages/kernel/docs/sdk-reference.md`
- `ts/packages/capabilities/harness-artifacts/src/harness-paths.ts`
- `ts/packages/capabilities/harness-artifacts/src/module-artifact-discovery.ts`
- `ts/packages/capabilities/ns-init/src/ns/context.ts`
- `ts/packages/capabilities/ns-init/src/real-skill-materializer.ts`
- related kernel, harness-artifacts, and ns-init tests

## Validation

Passed:

```bash
pnpm --dir ts --filter @nseng-ai/kernel run check
pnpm --dir ts --filter @nseng-ai/harness-artifacts run check
pnpm --dir ts --filter @nseng-ai/ns-init run check
just ts-format-check
pnpm --dir ts --filter @nseng-ai/kernel run test -- test/scenario/extension-options-cli.test.ts test/unit/extension-registry.test.ts test/integration/extension-registry-shim-loading.test.ts test/integration/flow-extension-registry.test.ts
pnpm --dir ts --filter @nseng-ai/harness-artifacts run test -- test/harness-paths.test.ts test/skills-path.test.ts test/module-artifact-discovery.test.ts test/first-party-skill-provisioning.test.ts
pnpm --dir ts --filter @nseng-ai/ns-init run test -- test/integration/real-skill-materializer.test.ts test/scenario/init-objectives.test.ts test/scenario/activate-objectives.test.ts
```

Also ran stale-symbol checks. Remaining `resolveHomeDir` hits are intentional:

- kernel CLI ingress / real command-context creation;
- ns-init adapter conversion from SDK context into `SkillMaterializationContext`.

No GitHub review-thread mutation was performed.

## Objective impact

The roadmap row **Resolve home-dir and harness-path ownership** is complete for this Objective. Remaining work stays in the provision/reconcile design cleanup and schema/source-of-truth cleanup buckets, followed by review-thread disposition and umbrella synthesis.
