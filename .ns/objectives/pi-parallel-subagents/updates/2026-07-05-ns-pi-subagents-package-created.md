# ns-pi-subagents Package Created

## Summary

The dogfooded explore/subagent capability has been extracted into a proper Pi extension package: `@nseng-ai/ns-pi-subagents` under `ts/packages/extensions/ns-pi-subagents`.

The package carries its own manifest with `pi.extensions`, README, public exports for the extension entrypoint and explore APIs, migrated explore source/tests, and package-level tests. The repo-local `.pi/extensions/explore.ts` shim now imports `@nseng-ai/ns-pi-subagents/extension` through the workspace resolver instead of reaching into `@internal/pi-tools` explore implementation code.

Boundary decision: ship as a private ns workspace package first. External distribution is intentionally not claimed yet because the package still depends on workspace/internal runner-subagent substrate that would need extraction or bundling for standalone installation.

Validation run during objective update:

```bash
pnpm --dir ts --filter @nseng-ai/ns-pi-subagents run check
pnpm --dir ts --filter @nseng-ai/ns-pi-subagents run test
# 5 test files, 29 tests passed
```

PR evidence:

- PR #2997: `Move explore into the @nseng-ai/ns-pi-subagents extension package` — current open PR evidence for the package extraction and review-feedback fixes.

## Objective Impact

The `ns-pi-subagents` package roadmap row is complete under the private-workspace-first boundary. The Objective's package-boundary open question is resolved with the caveat that external distribution remains future work, not part of this completion evidence.

The core explore completion criteria remain satisfied through the package entrypoint: read-only explorer children, direct bounded parent findings, session-file overflow/debug paths, live progress rendering, and package-level docs/registration are all preserved by moving the tested implementation into the extension package.

## Follow-Ups

- Keep the dogfood row open until the Objective has a sufficiently concrete real-task transcript/evidence trail and any prompt/contract tuning from that dogfood is recorded.
- Treat standalone external distribution as a future packaging/distribution slice if needed; it would need to address the runner-subagent substrate boundary rather than merely flipping `private`.
- Continue to evaluate whether fleet/transcript viewer, in-process runtime adapter, and consolidation assessment are worth doing before closure or parking.
