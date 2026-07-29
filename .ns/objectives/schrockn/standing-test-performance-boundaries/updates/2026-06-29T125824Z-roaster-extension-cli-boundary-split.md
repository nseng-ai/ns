# Roaster extension CLI boundary split

## Performance evidence

- Measured command: `pnpm --dir ts exec vitest run --config vitest.config.ts packages/kernel/test/scenario/roaster-extension-cli.test.ts --reporter verbose`
- Baseline timing: 13 tests passed in 1.32s; Vitest reported transform 217ms, import 344ms, tests 862ms. The slowest selected help case was 200ms in this local run; planning/user evidence also reported this file around 1067ms with the selected help case around 361ms in another run.
- Post-change timing: 7 default-lane tests passed in 425ms; Vitest reported transform 190ms, import 311ms, tests 13ms.
- Repetition/noise notes: transform/import remained the majority of wall time in the local targeted command. The stable signal is the default test-body cost dropped after replacing checked-in Roaster extension discovery/import with an injected fake registry.
- Cost handling: real checked-in `.sdl/extensions/roaster` manifest discovery, dynamic import/re-export, nested command mapping, hidden `exec` mounting, and selected schema availability moved to `pnpm --dir ts exec vitest run --config vitest.integration.config.ts packages/kernel/test/integration/roaster-extension-cli.test.ts --reporter verbose`, which passed 2 tests in 648ms with 240ms test time.
- Coverage retention: kernel default coverage now verifies SDL-owned extension catalog/routing/help/schema/invocation semantics through fake Roaster command metadata and selected fake commands. Roaster-owned domain behavior remains covered by existing `@sdl/roaster` unit/gateway/API tests, including review logs, review-run log-write failure behavior, record-findings invalid JSON, publication parsing/results, GitHub gateway behavior, and skill review listing.

## Boundary classification

`packages/kernel/test/scenario/roaster-extension-cli.test.ts` no longer uses the real SDL extension loader to scan `.sdl/extensions/roaster` or dynamically import checked-in Roaster command modules. That real loader path is an integration boundary under `ts/TESTING.md`; the retained smoke lives under `packages/kernel/test/integration/`.

Boundary grep after the split:

```bash
rg -n "repoRoot\(|\.sdl/extensions|installCheckedInRoaster|@sdl/roaster|loadSdlCommandCatalog|loadSelectedSdlCommand" ts/packages/kernel/test/scenario/roaster-extension-cli.test.ts
```

returned no matches.
