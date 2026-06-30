# Roaster Test Fake Helper Narrowing

## Summary

Normalized a focused `@sdl/roaster` internal test/fake helper slice by removing redundant explicit `| undefined` from omission-only optional helper properties. The scoped Roaster inventory moved from 84 to 70 matches for:

```bash
rg -n "\\?:[^\\n;=]*\\| undefined" ts/packages/roaster/src ts/packages/roaster/test --glob '*.ts'
```

Changed fields:

- `FindingsEnvelopeOptions.reviewName?: string`
- `FindingsEnvelopeOptions.reviewPath?: string`
- `FindingsEnvelopeOptions.modelProfile?: string`
- `FindingsEnvelopeOptions.model?: string`
- `FindingsEnvelopeOptions.baseRef?: string`
- `FakeReviewLogGatewayOptions.branch?: string`
- `FakeReviewLogGatewayOptions.entries?: readonly FakeReviewLogEntrySeed[]`
- `FakeReviewLogGatewayOptions.writeFailure?: ReviewLogFailure`
- `FakeReviewLogGatewayOptions.listFailure?: ReviewLogFailure`
- `FakeReviewLogEntrySeed.branch?: string`
- `FakeReviewLogEntrySeed.entryLocator?: string`
- `FakeReviewLogEntrySeed.reviewKey?: string | null`
- `FakeReviewLogEntrySeed.ranAt?: string | null`
- `FakeReviewLogEntrySeed.content?: string`

Construction-path evidence: `buildFindingsEnvelope` defaults omitted overrides with `??` before serializing concrete payload fields, and the fake review-log gateway constructor / `seededEntry` already convert omitted seed values into concrete fake branch, locator, review-key, ran-at, and content values. `null` remains preserved for `FakeReviewLogEntrySeed.reviewKey` and `ranAt`; only redundant explicit `undefined` was removed.

Validation passed:

- `pnpm --dir ts --filter @sdl/roaster test`
- `pnpm --dir ts run check`
- `pnpm --dir ts run lint`
- `pnpm --dir ts run fmt:check`

## Objective Impact

This advances the continuous cleanup row with a coherent Roaster helper/fake slice rather than a broad package sweep. The semantic claim is that these selected fields are test helper or fake-gateway seed/default shapes where absence is modeled by omitted keys and present-key `undefined` has no domain, compatibility, input, or external-conformance meaning.

Preserved/deferred categories in Roaster include public API option/input surfaces, `RoasterEnvironmentOptions`, `signal`/`env`/stdio/runtime/dependency bags, production gateway request surfaces, external command `ExecOptions`, Zod-derived external payload/result mirrors, and other test-local option bags that need separate local classification before narrowing.

## Follow-Ups

- Future Roaster slices should continue to separate fake/helper-only seeds from production request, environment, and public API surfaces.
- If review-log production request fields are considered later, treat them as compatibility/input surfaces and inspect downstream callers before narrowing.
