# Dead-code sweep

## Summary

Completed the Group 3 dead-code sweep for `ts/packages/pr-address`.

Deleted stale TypeScript-only plumbing and exports that no runtime path used:

- `LEGACY_EXEC_OPERATIONS`
- `ExecOperationRegistry.isTsManaged`
- the `raw-exit` dispatch result variant and CLI switch arm
- the unused `isActionComplexity` helper
- the duplicate `getFeedbackInlineResultSchema` copy in `feedback-collection.ts`
- `validResolutionModesText`
- `stackFeedbackPrFixture`
- the copied `parseOptions` helper in `classification-core.ts`, replacing it with `parseManagedOptions`
- unreachable handler-level `--json-schema` skip branches
- speculative root `index.ts` barrel exports beyond the real embedding contract (`runCli`/`CliDeps`)

`writeTextArtifact` was deliberately retained. It has no production caller today, but the payload store still owns `log` artifact behavior: parity fixtures write text artifacts, and lookup-negative tests use a log artifact to prove JSON lookup rejects non-JSON roles. Keeping it preserves that store contract; deleting it would be a contract narrowing rather than a dead-code deletion.

Validation evidence:

- `pnpm --dir ts/packages/pr-address run check`
- `pnpm --dir ts/packages/pr-address run test`

## Objective Impact

This completes the roadmap row `Dead-code sweep` and starts Group 3 by deleting stale compatibility scaffolding before deeper structural decomposition.

The change does not alter public CLI behavior: `--json-schema` remains owned by the CLI before handlers run, unknown schema routes still fall back through the legacy path, and all package tests pass after the deletions.

The `writeTextArtifact` open question is resolved as retained-for-contract-coverage rather than removed.

## Follow-Ups

- Continue Group 3 with the shared operation-support layer, single operation table, required gateways, decomposition, shared thread-decision engine, stack prep split, and test-scaffolding consolidation rows.
- Revisit log artifact support only if the payload store contract itself is intentionally narrowed during Python deletion or post-cutover fixture simplification.
