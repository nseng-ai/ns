# Extension Architecture Rebaseline for TS Structural Cleanup

## Summary

Trunk-explicit, non-closing refresh against HEAD (`b18ffded5`) from the most recent Objective-history touch (`79ab6e3d`). The Objective directory itself had no diff since that baseline, but current repository probes showed several durable claims had drifted after the extension-architecture and package-layout work.

Decisive verification evidence:

- Current CLI entrypoints are 11, not the earlier 14/15 count: `find ts/packages -path '*/src/cli.ts'` lists address, aretro, branch-context, ccc, sdlcc, brmem, kernel, plans, areg, packagechk, and vibechk.
- The old `@asdl/*` package scope remains absent (`rg "@asdl/" ts` returned zero); current package homes include `@sdl/core` under `ts/packages/infra/core/`, `@sdl/kernel` under `ts/packages/kernel/`, `@sdl/slot` under `ts/packages/capabilities/slot/`, and `sdl-flow` under `ts/packages/capabilities/flow/`.
- The Branch-Memory completed rows remain true but the old "single hardcoded candidate" wording was stale: `@sdl/core/brmem-cli` exposes `runBrmem`, the removed public candidate/dead-export names grep to zero under `ts/packages`, and branch-context has no `src/brmem-gateway.ts` or `@sdl/core/brmem-cli` imports.
- Land-stack ownership shifted: `ts/packages/ccc/src/land-stack/landing-operations.ts` is a 14-line re-export, while `ts/packages/capabilities/flow/src/land-stack/landing-operations.ts` is 1222 lines and still contains `performGraphiteMaintenance`.
- Several path/package facts drifted: `extension-discovery.ts` is now under `ts/packages/kernel/`; `pi-jsonl-source.ts` is under `ts/packages/aretro/src/sessions/`; `@sdl/core` still exports `"."`, with a live bare importer in `ts/packages/hosts/pi/src/sessions/harness-session.ts`.
- `sdl-extension-architecture` has advanced but remains open: `@sdl/capability-kit`, `sdl-sdk`, `@sdl/domain-primitives-transitional`, `sdl-flow`, and multiple capability child migrations exist, while remaining child migrations, broader `ccc` clean-consumer work, and `@sdl/domain-primitives-transitional` deletion remain incomplete.

## Objective Impact

`objective.md`, `roadmap.md`, and `orientation.md` were re-authored from the verified contract. The refresh preserves completed structural-cleanup history (`defineCli`, rejected `execGroup`, branch-context BrmemGateway migration, `runBrmem`, brmem/core GitGateway composition), weakens original-review counts and paths into re-verify-before-pickup guidance, and explicitly routes Flow/ccc and capability-domain-sensitive work through the current ADR 0009 layering boundary.

No roadmap checkbox was flipped from open to done or done to open. The main semantic change is that remaining work is now phrased against current package ownership and current evidence rather than against stale original review locations.

## Follow-Ups

- Before implementing any open row, reclassify it as neutral structural cleanup, capability-owned migration work, or obsolete debt in light of `sdl-extension-architecture`.
- Treat the Flow land-stack row as Flow-owned unless a rebaseline proves a neutral `@sdl/graphite`/`@sdl/core` extraction is appropriate.
- Keep `runBrmem` fallback behavior and Branch Memory ref encoding compatibility covered if the entry-locator/plan-attachment rows are picked up.

Provenance: objective-refresh basis target=b18ffded5 from=79ab6e3d
