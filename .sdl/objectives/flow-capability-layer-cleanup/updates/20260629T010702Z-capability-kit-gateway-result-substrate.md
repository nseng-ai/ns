# Capability Kit Gateway Result Substrate

## Summary

Moved the shared capability gateway result/error substrate into Capability Kit while preserving `@sdl/core/result` as the generic implementation owner.

Changes:

- Added `@sdl/capability-kit/gateway-result` via `ts/packages/sdl-capability-kit/src/gateway-result.ts` and the package export map.
- The new Capability Kit subpath exposes capability-facing `ErrorInfo`, `GatewayResult`, and `Result` type aliases plus `ok`, `err`, `resultOk`, and `resultErr` as a facade over `@sdl/core/result`.
- Moved the generic command-result-to-`ErrorInfo` mechanics into Capability Kit as `commandFailure`, keeping caller-owned error codes/messages so Flow retains submit policy.
- Re-exported the new public surface from the Capability Kit root index for consistency with existing substrate modules.
- Repointed Flow submit substrate exports and `RealGithubPrGateway` to `@sdl/capability-kit/gateway-result`.
- Deleted the Flow-local `ts/packages/capabilities/flow/src/submit/result.ts` and `ts/packages/capabilities/flow/src/submit/command-failure.ts` compatibility files rather than keeping temporary re-exports.

Validation evidence:

- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/sdl-capability-kit/test/unit/gateway-result.test.ts` passed.
- `pnpm --dir ts exec vitest run --config vitest.config.ts packages/capabilities/flow/test/unit/github-pr-gateway.test.ts packages/capabilities/flow/test/unit/submit.test.ts` passed.
- Stale-edge searches verified Flow submit no longer imports `./result.ts`, `./command-failure.ts`, or direct `@sdl/core/result`; remaining `@sdl/core/result` hits are the Capability Kit facade itself and an unrelated Slot test.
- `rg -n "@sdl/core/submit|@sdl/graphite/submit|@sdl/autobranch" ts/package.json ts/pnpm-lock.yaml ts/packages -g 'package.json' -g '*.ts' -g 'pnpm-lock.yaml'` remained clean.
- `just ts-format-check` passed.
- `just ts-lint` passed with pre-existing kernel-test warnings only.
- `just ts-check` passed.
- `just ts-deps-check` passed.
- `just ts-test` passed.
- `just ts-test-integration` passed.

## Objective Impact

This completes the roadmap row to move shared capability gateway result/error substrate into `@sdl/capability-kit`. Capability-facing Flow submit code now depends on the Capability Kit substrate instead of Flow-local result facades or direct core result imports, while generic `@sdl/core/result` remains in place for non-capability and implementation-level reuse.

The change preserves the Objective boundary: Capability Kit owns only a capability-agnostic result facade and generic command failure conversion, while Flow keeps PR-description, submit, Graphite-submit, GitHub PR gateway behavior, error codes/messages, transcript policy, and user-facing workflow semantics.

## Follow-Ups

- Complete the final package-tier/import-guard/docs/context rebaseline and then evaluate the Closure Gate for this Objective.
- If closing this child Objective after rebaseline, consider whether parent `sdl-extension-architecture` needs a concise update summarizing the completed Flow/Capability Kit cleanup evidence.
