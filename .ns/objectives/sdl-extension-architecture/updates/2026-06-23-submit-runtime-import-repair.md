# Submit Runtime Import Repair

## Summary

The current checkout includes commit `05c5e5a82` (`Fix SDL submit imports to use Graphite submit gateway`), which repairs the stale `@sdl/sdl/submit` runtime seam noted in the prior package-seam update. `ts/packages/sdl/src/submit.ts` now imports submit orchestration symbols from `@sdl/graphite/submit` while keeping `RealGithubPrGateway` sourced from `@sdl/core/submit`, matching the Graphite package extraction boundary.

Local validation was attempted with `pnpm --dir ts/packages/sdl run check && pnpm --dir ts run test -- packages/sdl/test/scenario/submit-cli.test.ts`, but pnpm stopped before package checks/tests because ignored build scripts require approval for `@google/genai` and `protobufjs`. This records the code-state correction without claiming fresh green validation from this checkout.

## Objective Impact

The readable submit command row is no longer blocked on the stale runtime-import repair. Its remaining uncertainty is validation evidence, not additional semantic submit-bundle rewrite work. The row remains partial until clean `just` or submit scenario evidence is collected in an environment where pnpm can run.

This update does not change the no-new-public-`@sdl/sdl/sdk` boundary: the repair uses the package-owned Graphite submit seam rather than promoting submit orchestration into the public SDL extension SDK.

## Follow-Ups

- Collect clean `just` and/or focused submit scenario validation after pnpm build-script approval is resolved.
- Continue with the remaining flow shared-code semantic rows rather than treating routine validation as the next Objective work item.
- Preserve the package-owned `@sdl/graphite/submit` boundary unless a later steer-first decision changes Graphite/stack-ops ownership.
