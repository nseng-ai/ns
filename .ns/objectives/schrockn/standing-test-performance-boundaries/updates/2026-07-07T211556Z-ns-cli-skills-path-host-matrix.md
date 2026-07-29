# ns-cli skills path host matrix moved to integration

## Summary

Moved the composed `ns skills path` six-case host wiring matrix out of the default `@nseng-ai/ns` host test file and into the explicit integration lane at `ts/packages/hosts/ns-cli/test/integration/skills-path.test.ts`.

The default lane keeps one representative smoke in `ts/packages/hosts/ns-cli/test/ns-cli.test.ts`: `claude` + `user` through the real `runNsCli` path. That smoke still proves host command wiring, alias normalization to `claude-code`, user-scope `CLAUDE_CONFIG_DIR` handling, JSON envelope rendering, and empty stderr without multiplying the full host invocation matrix by six.

## Objective impact

This follows the standing boundary direction: composed host CLI wiring with real entrypoint/env propagation belongs in integration, while the default lane keeps cheap direct coverage and one narrow smoke. No runtime or production seams changed.

## Baseline evidence

Before edits, the targeted default host run passed and showed the full matrix in the default file:

```bash
corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest run packages/hosts/ns-cli/test/ns-cli.test.ts --reporter=verbose
```

Result: 1 file / 10 tests passed, duration 1.06s, test time 332ms. The old `resolves skill paths for harness aliases and both scopes` default-lane test took 108ms.

## Performance and coverage evidence

Post-change default targeted run:

```bash
corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest run packages/hosts/ns-cli/test/ns-cli.test.ts --reporter=verbose
```

Result: 1 file / 10 tests passed, duration 956ms, test time 255ms. The narrowed `smokes skills path host wiring for an alias user-scope case` test took 15ms.

Integration targeted run:

```bash
corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest run --config vitest.integration.config.ts packages/hosts/ns-cli/test/integration/skills-path.test.ts --reporter=verbose
```

Result: 1 file / 1 test passed, duration 755ms, test time 121ms. The integration test retains all six cases: `claude` user, `claude-code` project, `codex` user/project, `pi-dev` user, and `pi` project.

Cost handling: the six-case composed host matrix cost shifted to integration; one host smoke remains in default. Lower-level package coverage already covers canonical roots, aliases, `CLAUDE_CONFIG_DIR`, missing home, and kernel-provided home, so no harness-artifacts test expansion was needed.

## Lane placement evidence

The new file is directly under the package test root's `integration/` directory, matching `test/integration/**` from `ts/vitest.shared.ts`.

Discovery check used after noting Vitest's explicit-file behavior:

```bash
corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest list --config vitest.config.ts packages/hosts/ns-cli/test | rg 'skills-path|test/integration'
```

Result: no matches (`rg` exit 1), so the default lane does not discover the new integration file when listing the package test tree.

Integration discovery:

```bash
corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest list --config vitest.integration.config.ts packages/hosts/ns-cli/test/integration/skills-path.test.ts
```

Result: listed `packages/hosts/ns-cli/test/integration/skills-path.test.ts > ns CLI skills path integration > resolves skill paths for harness aliases and both scopes`.

Note: the plan's exact default-list command with the explicit integration file path listed the test under Vitest 4.1.9. The package-tree list above was used as the lane-discovery proof because explicit file filters can force a file even when normal default discovery excludes it.

## Validation

- `corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest run packages/hosts/ns-cli/test/ns-cli.test.ts --reporter=verbose` passed.
- `corepack pnpm@11.8.0 --config.verify-deps-before-run=false --dir ts exec vitest run --config vitest.integration.config.ts packages/hosts/ns-cli/test/integration/skills-path.test.ts --reporter=verbose` passed.
- `pnpm --dir ts run check` passed.

## Scope notes

Intentional edits were limited to the default host test, a new host integration test, and this Objective update. The real-Git `ns update` smoke remains in the default host test as an explicit follow-up boundary decision, not part of this slice.
