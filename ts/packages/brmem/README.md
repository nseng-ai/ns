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
- `setup-git`
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

## Git setup for Branch Memory Snapshot Refs

`brmem setup-git` configures the current clone's local Git config so ordinary remote operations include Branch Memory Snapshot Refs under `refs/brmem/*`.

```text
brmem setup-git
brmem setup-git --remote upstream
brmem setup-git --dry-run --format json
```

The command is safe to rerun. It preserves existing `remote.<remote>.push` and `remote.<remote>.fetch` entries and only adds missing Branch Memory refspecs.

When a remote has no explicit push refspecs, `setup-git` first adds:

```text
remote.<remote>.push = HEAD
```

This preserves normal `git push <remote>` current-branch behavior after Git switches to explicit configured push refspecs. Existing custom push policies are preserved; if push refspecs already exist, `setup-git` does not add `HEAD`.

Fetch setup uses a non-force refspec:

```text
remote.<remote>.fetch = refs/brmem/*:refs/brmem/*
```

Divergent local Branch Memory Snapshot Refs therefore produce an ordinary Git fetch failure instead of being silently overwritten. The command only edits clone-local `.git/config`; it does not push, fetch, create hooks, or mutate Branch Memory Entries.

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
