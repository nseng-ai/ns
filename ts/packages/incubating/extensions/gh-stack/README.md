# @nseng-ai/gh-stack

Read-only ns inventory for the official GitHub [`github/gh-stack`](https://github.com/github/gh-stack)
provider.

## Prerequisites

- Node.js 24.12 or newer and ns;
- the GitHub CLI (`gh`) authenticated for the current repository;
- the official extension, installed with `gh extension install github/gh-stack`;
- a current working directory inside a Git repository.

The extension is pre-1.0. This package validates every provider field it consumes, tolerates unknown
additive fields and unfamiliar local schema versions, and fails rather than guessing when local and
remote identities or compositions are unsafe.

## Install

Install the package as an ns extension through the supported extension source workflow. From an ns
source checkout, source-development discovery makes its descriptor available automatically. A local
source installation can be registered with:

```bash
ns extension install /path/to/ns/ts/packages/incubating/extensions/gh-stack --scope user
```

## Usage

```bash
ns gs list
ns gs list -L 25
ns gs list --format json
ns gs list --json-schema
```

`ns gs list` combines unpublished and tracked local state from `<git-common-dir>/gh-stack` with every
stack returned by GitHub's Stacks endpoint. It reconciles duplicates, omits fully merged stacks, sorts
deterministically, and then applies the output limit. A stack available locally is labeled `Local` even
when it also exists on GitHub; `Remote` means GitHub-only.

The default limit is 100 and the maximum is 1,000. A truncated human result reports the returned and
total counts and prints a larger `ns gs list --limit ...` recovery command. JSON output uses Clinkr's
canonical envelope and contains complete bottom-to-top branch arrays plus `limit`, `returned`, `total`,
and `truncated` metadata.

Inventory is strict and complete: installation verification, Git repository resolution, local state,
and authenticated GitHub discovery must all succeed. A source failure returns a typed failure and no
partial stack inventory. Missing local state means there are no local stacks. Malformed or unreadable
existing state, an unavailable Stacks API, and an unsupported API response are failures.

This package provides provider-specific read-only inspection only. It does not mutate Git, GitHub, or
gh-stack state, prompt, page output, open an interactive picker, add Flow aliases, or implement Flow
stack lifecycle capabilities.

See [`reference/provider-contract.md`](reference/provider-contract.md) for fixture provenance and the
revalidated gh-stack v0.1.0 assumptions.
