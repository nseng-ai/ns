# @asdl/brmem

`@asdl/brmem` is the TypeScript implementation of the public standalone `brmem` CLI and reusable library for the Branch Memory System.

It implements the current operation set:

- `put`
- `get`
- `delete`
- `list`
- `check`
- `copy`
- `export`
- hidden skill-facing `exec resolve-prompt`

## Distribution

Public local installation uses a run-from-source shim; this cutover does not require npm publishing or a checkout-free bundle.

```text
just install-brmem
# or as part of the normal tool install bundle
just install-tools
```

The recipe renders the shared TypeScript source CLI shim template to `$HOME/.local/bin/brmem`.

- Inside an asdl checkout, the shim runs that checkout's `ts/packages/brmem/src/cli.ts`.
- Outside an asdl checkout, it runs the checkout path baked in when the shim was installed.
- Requirements: Node 24+ matching workspace CI, plus `ts/node_modules` from `just ts-install` or `pnpm --dir ts install`.

## Local usage

```text
node ts/packages/brmem/src/cli.ts --help
brmem --runtime
brmem list --format json
```

Expected runtime diagnostics include:

```text
runtime: typescript
entry_point: @asdl/brmem bin brmem -> ts/packages/brmem/src/cli.ts
```

## Validation

Focused package validation:

```text
pnpm --dir ts/packages/brmem run check
pnpm --dir ts/packages/brmem run test
```

Broader workspace validation:

```text
pnpm --dir ts run check
pnpm --dir ts run test
```
