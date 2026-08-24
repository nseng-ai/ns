# @nseng-ai/gs

Provider-branded ns workflows for the official
[`github/gh-stack`](https://github.com/github/gh-stack) provider.

Today the package implements only local, read-only inventory through `ns gs list`. The lifecycle
contract below governs the preparation, reconciliation, publication, inventory-generation, and landing
commands as they are added. Unimplemented workflows are not available commands or compatibility
promises.

## Supported provider baseline

Lifecycle workflows initially support exactly `gh stack version 0.1.0`. Because gh-stack is pre-1.0,
every lifecycle workflow must verify the installed version before mutation and refuse an unqualified
version mismatch. A later version is not assumed compatible: widening support requires evidence for its
public commands, output, mutation boundaries, and recovery behavior.

The reproducible baseline and unresolved experiments are recorded in
[`docs/research/gh-stack-v0.1.0-workflow-baseline.md`](../../../../../docs/research/gh-stack-v0.1.0-workflow-baseline.md).
The architecture boundary is accepted in
[ADR 0061](../../../../../docs/adr/0061-gs-native-lifecycle-ownership.md).

## Lifecycle contract

GS owns a gh-stack-native everyday loop. It does not adapt gh-stack beneath Flow, reproduce Graphite
command parity, or expose a universal stack-provider transaction. Flow remains the owner of its existing
Graphite workflows.

The intended outcome loop is:

1. inspect work and local stack facts;
2. checkpoint work;
3. bootstrap a stack or extend its top;
4. optionally move the verified branch into a Slot;
5. reconcile local, remote, provider, and GitHub facts;
6. submit branches and pull requests;
7. prepare or apply GS PR inventories; and
8. land a verified stack or prefix and reconcile the result.

Only the local inspection step is implemented today. Before any later mutating step is implemented, its
focused provider experiment must settle the supported starting states, public provider operations,
observed postconditions, refusals, partial effects, and recovery guidance. The v0.1.0 help text for
`sync`, `submit`, `link`, and `merge` describes candidate capabilities; its remote effects, rollback,
atomicity, and failure boundaries are not yet ns guarantees.

Lifecycle code uses only supported public gh-stack commands. It never reads or mutates
`<git-common-dir>/gh-stack`; the existing inventory reader is a separately justified local inspection
feature and is not an authority for lifecycle mutation.

### Observed postconditions

A provider exit code, success message, or JSON response is evidence, not proof of completion. After each
mutation, GS verifies the facts relevant to the requested outcome:

- **Git:** checkout, branch refs, parent/commit SHAs, and worktree state;
- **gh-stack:** supported public command facts, such as `view --json`; and
- **GitHub:** authoritative branch, pull-request identity/base/state, remote-stack, queue, and merge facts.

A workflow reports completion only when every required postcondition is observed. It reports one of four
outcome classes:

- **refused:** no intended mutation began;
- **completed:** all required postconditions were observed;
- **known partial failure:** observations identify the completed effects and remaining work; or
- **ambiguous failure:** mutation may have occurred, but authoritative facts cannot establish its extent.

Known partial and ambiguous failures preserve observed durable state and return forward recovery facts.
GS does not blindly retry, infer rollback, delete a branch, run whole-stack `unstack`, or reconstruct
provider-private metadata. No-remote experiments show only that v0.1.0 preflight failures left tested
local refs and worktrees unchanged; they do not establish general rollback or transactionality.

### Optional Slots composition

Slots are not required for core GS operation. Optional autoslot composition begins only after the GS
branch, checkpoint, provider facts, and clean worktree are verified. It invokes Slots through the public
command boundary. Slot refusal or failure preserves the already verified GS state and does not replay or
roll back provider mutation.

## Implemented command: local inventory

### Prerequisites

- Node.js 24.12 or newer and ns;
- a current working directory inside a Git repository.

`ns gs list` does not require `gh`, GitHub authentication, or network access. It reads
`<git-common-dir>/gh-stack` and local Git branch refs, so linked worktrees share one repository-level
inventory.

### Install

Install this package through the supported ns extension source workflow. From an ns source checkout,
source-development discovery makes its descriptor available automatically. A local source installation
can be registered with:

```bash
ns extension install /path/to/ns/ts/packages/incubating/extensions/gs --scope user
```

### Quickstart

```bash
ns gs list
ns gs list --verbose
ns gs list --format json
ns gs list --json-schema
```

`ns gs list` reports each recorded stack that still has at least one recorded stack branch present as a
local Git branch. The base branch alone does not keep a stack in the inventory. A retained stack
preserves all provider-recorded branches, including branches that were deleted locally, because the
recorded shape remains useful context.

The command does not contact GitHub to verify current PR state, and it does not deduplicate repeated
stack numbers. A missing state file, an empty `stacks` array, or no recorded stack with a remaining local
branch returns a successful empty inventory.

The compact view has `NUMBER`, `STACK`, and `BASE` columns. A one-branch stack shows its branch once;
other stacks use `<bottom>...<top>`. `--verbose` (`-v`) renders each stack from its top branch down to
its base. JSON preserves the provider's bottom-to-top branch order and includes recorded PR numbers and
the recorded merged flag. `--verbose` cannot be combined with `--format json`.

Results are ordered deterministically: unnumbered stacks first, numbered stacks descending by number,
then the compact stack summary ascending. Unknown additive provider fields and unfamiliar
`schemaVersion` values are tolerated. Invalid JSON or any malformed consumed record fails the complete
inventory with `gh-stack-state-unsupported`; the command never returns a partial inventory.

This implemented command does not mutate Git, GitHub, or gh-stack state. Its recorded PR evidence is
local-only and does not establish current GitHub state.
