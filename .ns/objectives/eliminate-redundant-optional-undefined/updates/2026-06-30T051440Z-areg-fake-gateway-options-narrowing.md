# AREG Fake Gateway Options Narrowing

## Summary

Narrowed a cohesive `@sdl/areg` fake-gateway/test-support cluster from explicit-undefined optional properties to omission-only optional properties in `ts/packages/tools/areg/src/fake-gateways.ts`, with one adjacent scenario harness forwarding fix in `ts/packages/tools/areg/test/scenario/update-skills-cli.test.ts`.

Scoped inventory:

```bash
rg -n "\\?:[^\\n;=]*\\| undefined" ts/packages/tools/areg/src/fake-gateways.ts
```

Before editing, the scoped inventory found 45 candidates. After editing, it finds 1 candidate: the preserved real `AregGithubGateway.listSkillDirectoryNames` request option `ref?: string | undefined`, which remains a gateway method input surface.

Changed omission-only fields:

- `FakeAregCheckSkillOptions`: `skillsPath`, `agentsPath`, `claudePath`, `localSkillMd`, `remoteSkillMd`, and `openaiPolicy`.
- `FakeAregSkillKindSkillOptions`: `sourceType`, `baseRelativePath`, `skillDir`, `skillMd`, and `openaiPolicy`.
- `FakeAregProjectGatewayOptions`: project directory/path, seed file states, inventory arrays, fake skill arrays, pairing directories, failure maps, and `applyFailure`.
- `FakeAregHostGatewayOptions.tools`.
- `FakeAregGithubOperation.ref` and `FakeAregGithubGatewayOptions.repos`.
- `FakeAregNpxSkillsGatewayOptions.failure` and `failures`.
- `FakeAregPromptGatewayOptions.responses` and `shouldConfirmByDefault`.
- `FakeAregSkillxWorkspaceGatewayOptions.workspaceRoot`, `installedSkills`, `failure`, and `cleanupFailure`.

Forwarding normalization now omits absent GitHub operation `ref` values and absent `npx` failure options in the update-skills scenario harness instead of materializing present-key `undefined`.

## Objective Impact

This advances the standing optional-undefined cleanup loop with a package-local fake/test-support slice. The semantic claim is that present-key `undefined` has no domain, compatibility, input, or external-conformance meaning for these fake seed/options and operation-log helper fields: constructors and copy helpers already model absence through defaults, optional access, generated fake values, or explicit `=== undefined` checks.

Preserved/deferred categories:

- The real `AregGithubGateway` method request option `ref?: string | undefined` remains loose as a gateway input/compatibility surface.
- `NodeJS.ProcessEnv` / environment-like value types and real AREG gateway interfaces, operation requests, CLI context/dependency bags, and production command input surfaces were not tightened.
- The adjacent scenario harness edit was limited to omission-preserving forwarding required by `exactOptionalPropertyTypes` after narrowing `FakeAregNpxSkillsGatewayOptions`.

Validation passed:

- `pnpm --dir ts --filter @sdl/areg run check`
- `pnpm --dir ts --filter @sdl/areg test`
- `pnpm --dir ts run fmt:check`
- `pnpm --dir ts run lint`

## Follow-Ups

Continue treating first-party fake-builder/test-support option bags as good omission-only candidates when construction evidence shows defaults are omission-based. Preserve real gateway contracts, command/context dependency options, environment/process records, and external input surfaces unless a future slice introduces a normalized internal boundary or stronger compatibility analysis.
