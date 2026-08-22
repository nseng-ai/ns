# @nseng-ai/gs

Read-only ns inventory for local state recorded by the official
[`github/gh-stack`](https://github.com/github/gh-stack) provider.

## Prerequisites

- Node.js 24.12 or newer and ns;
- a current working directory inside a Git repository.

The command does not require `gh`, GitHub authentication, or network access. It reads only
`<git-common-dir>/gh-stack`, so linked worktrees share one repository-level inventory.

## Install

Install this package through the supported ns extension source workflow. From an ns source checkout,
source-development discovery makes its descriptor available automatically. A local source installation
can be registered with:

```bash
ns extension install /path/to/ns/ts/packages/incubating/extensions/gs --scope user
```

## Quickstart

```bash
ns gs list
ns gs list --verbose
ns gs list --format json
ns gs list --json-schema
```

`ns gs list` reports every locally recorded stack. It does not contact GitHub to verify current PR or
branch state, and it does not filter fully merged records or deduplicate repeated stack numbers. A
missing state file and an empty `stacks` array both return a successful empty inventory.

The compact view has `NUMBER`, `STACK`, and `BASE` columns. A one-branch stack shows its branch once;
other stacks use `<bottom>...<top>`. `--verbose` (`-v`) renders each stack from its top branch down to
its base. JSON preserves the provider's bottom-to-top branch order and includes recorded PR numbers and
the recorded merged flag. `--verbose` cannot be combined with `--format json`.

Results are ordered deterministically: unnumbered stacks first, numbered stacks descending by number,
then the compact stack summary ascending. Unknown additive provider fields and unfamiliar
`schemaVersion` values are tolerated. Invalid JSON or any malformed consumed record fails the complete
inventory with `gh-stack-state-unsupported`; the command never returns a partial inventory.

This package provides provider-specific local inspection only. It does not mutate Git, GitHub, or
gh-stack state and does not implement Flow stack lifecycle capabilities.
