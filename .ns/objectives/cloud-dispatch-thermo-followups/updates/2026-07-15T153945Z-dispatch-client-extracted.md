# Dispatch Client Extracted

## Summary

The behavior-preserving M4+M5 prerequisite moved the local dispatch feature from the
`ns` host surface into the manifest-declared `dispatch-client` feature subpackage. The
entire former `src/ns/dispatch-prompt/` tree and the `[dispatch]` project-config parser
now live there. `src/ns/extension.ts` and `src/ns/commands/prompt.ts` remain the host
descriptor and command adapter, while `src/api/index.ts` preserves the curated
`@nseng-ai/vercel/api` parser re-export. No public `./dispatch-client` export was added.

Feature-owned tests and support moved from `test/ns/` to `test/dispatch-client/`; the
actual `ns dispatch prompt` command scenario remains under `test/ns/` and imports the
feature through its intra-package source boundary.

H9 rode the same slice: the harness registry now exports one
`DISPATCH_CHECKOUT_PACKAGE_ROOT`, and both `PI_RUNNER_ENTRY_PATH` and the checkout-local
Pi bin path derive from it.

Validation passed:

- `pnpm --dir ts --filter @nseng-ai/vercel run check`
- `pnpm --dir ts --filter @nseng-ai/vercel run test` (51 files, 622 tests)
- `just ts-format-check`
- `just ts-lint`
- `just ts-test-typescript-style-guard`
- `just` (605 files, 6502 tests; objective sweep clean)

`pnpm --dir ts --filter @nseng-ai/vercel run build:deployable` was also attempted but
stopped before building because this checkout has no local Vercel project settings and
no non-interactive authentication. No `vercel pull`, deployment, dispatch, or other
external write was performed.

## Objective Impact

M4+M5 and H9 are complete with local evidence. The extraction preserves the command,
config, Capability API facade, workflow/deploy inventory, and package export surface
while removing feature ownership from the `ns` host-surface directory. The
checkout-root duplication risk is removed by derivation from one constant. This update
does not claim live deployment or dispatch verification and does not advance any
unrelated roadmap row.

The sequencing question is resolved in favor of extracting before future
`dispatch plan|handoff` work, so those commands can be born in the feature home.

## Follow-Ups

- Re-run `build:deployable` only in an appropriately configured local Vercel checkout;
  this slice does not authorize pulling settings or performing a deployment.
- Keep follow-on dispatch behavior out of this prerequisite slice; it remains separate
  work.
- Continue the remaining thermo-review rows independently; none is implied complete by
  this move.
