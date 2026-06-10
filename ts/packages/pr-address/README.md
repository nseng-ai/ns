# @asdl/pr-address

TypeScript migration scaffold for the public `pr-address` standalone CLI.

This package establishes the TypeScript package boundary, direct Node CLI entrypoint, and local wrapper routing for `pr-address`. It is **not** a full operation port yet: unported `pr-address exec ...` operations delegate directly to the legacy Python CLI until each operation is ported and covered by parity tests.

## Local usage

From the repo root:

```bash
node ts/packages/pr-address/src/cli.ts --help
skills/pr-address/scripts/pr-address-run --help
skills/pr-address/scripts/pr-address-run exec prepare-run --payload-session-id pr-address-demo --format json
```

In a local checkout, `skills/pr-address/scripts/pr-address-run` defaults to this TypeScript scaffold. Use `ASDL_PR_ADDRESS_MODE=python-local` (or `legacy-python`) to force the local legacy Python fallback for debugging. `ASDL_PR_ADDRESS_MODE=prod` remains the pinned PyPI Python path until a later npm/prod cutover.

## Validation

```bash
pnpm --dir ts --filter @asdl/pr-address run check
pnpm --dir ts --filter @asdl/pr-address run test
```

Broader workspace validation:

```bash
pnpm --dir ts run check
pnpm --dir ts run test
```

## Fallback retirement

The direct Python fallback exists only for the migration window. It must not call the `pr-address-run` wrapper, because the wrapper is now TypeScript-default in local checkouts and wrapper delegation would risk recursion. Remove the fallback once operation parity and distribution cutover are complete.
