# Branch Context Test Helper Options Narrowing

## Summary

Removed redundant explicit `| undefined` from six omission-only optional fields on private branch-context saved-plan test helper parameter bags:

- `ts/packages/branch-context/test/attach.test.ts`: `slug`, `branch`, and `content` in the local `writeSavedPlan` helper params.
- `ts/packages/branch-context/test/support/cli-harness.ts`: `slug`, `branch`, and `content` in the scenario test-support `writeSavedPlan` helper params.

Scoped inventory for the two touched files went from 6 optional-undefined matches to 0:

```text
rg --glob '*.ts' '\?:[^\n;=]*\| undefined' ts/packages/branch-context/test/attach.test.ts ts/packages/branch-context/test/support/cli-harness.ts
```

## Objective Impact

This advances the standing optional-undefined cleanup loop with a small branch-context test-fixture slice. The semantic claim is that these helper params model omission-only fixture overrides: callers either omit the field or provide a concrete string, and the helpers immediately normalize with `??` defaults before constructing file paths or content. Present-key `undefined` has no separate domain, compatibility, input, or external-conformance meaning for these internal test helper shapes.

Classification preserved/deferred for future runners:

- Preserved `ts/packages/branch-context/src/**` production and operation option surfaces in this slice because they include command inputs, dependency bags, abort signals, and public-ish branch-context API boundaries that need separate semantic classification.
- Deferred `ts/packages/branch-context/src/testing/index.ts` fake/testing helper fields because exported testing-gateway helpers may have compatibility-fixture semantics and were outside this private saved-plan-helper cluster.

Validation evidence:

- `pnpm --dir ts run check` passed.
- `pnpm --dir ts run test -- --run ts/packages/branch-context/test/attach.test.ts ts/packages/branch-context/test/scenario/cli-entry-ops.test.ts` passed. Vitest interpreted the invocation as a full configured test run; all 379 test files / 3671 tests passed.

## Follow-Ups

Continue selecting coherent package/subsystem clusters. Branch-context production option and signal surfaces should remain preserved until a future slice can justify a normalized internal boundary rather than tightening inputs mechanically.
