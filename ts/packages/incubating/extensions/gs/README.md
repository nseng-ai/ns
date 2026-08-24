# @nseng-ai/gs

Provider-branded ns workflows for the official
[`github/gh-stack`](https://github.com/github/gh-stack) provider.

Today the package implements local inventory through `ns gs list` and one state-driven local mutation
through `ns gs restack-resolve`. The lifecycle contract below governs later preparation, reconciliation,
publication, inventory-generation, and landing commands. Unimplemented workflows are not available
commands or compatibility promises.

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

Local inspection and the local inter-branch `restack-resolve` CLI are implemented. Before any later
mutating step is implemented, its focused provider experiment must settle the supported starting states,
public provider operations, observed postconditions, refusals, partial effects, and recovery guidance.
The v0.1.0 help text for `sync`, `submit`, `link`, and `merge` describes candidate capabilities; its
remote effects, rollback, atomicity, and failure boundaries are not yet ns guarantees.

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

### Implemented command: restack-resolve

```bash
ns gs restack-resolve --yes
ns gs restack-resolve --downstack --yes
```

`ns gs restack-resolve` is a local inter-branch workflow pinned to exactly `gh stack` v0.1.0. A start
uses public `gh stack rebase --no-trunk` and adds `--downstack` only when explicitly requested. An active,
resolved rebase with a staged resolution selects exactly one `gh stack rebase --continue`; there is no
public `--continue` flag. Every provider call disables prompts and editors with a per-command environment
overlay. The command never uses `env`, `sync`, network APIs, raw Git continue/abort, or provider-private
state.

This command deliberately does **not** update trunk or rebase the bottom stack branch onto a changed
trunk. Fetching, trunk integration, pushing, and GitHub reconciliation remain part of the unsettled
reconciliation workflow. Plain `gh stack rebase` is not used because it pulls from the remote by default.
A GS-owned raw-Git cascade is also rejected for the normal path because it duplicates provider recovery
and leaves public provider base facts stale until provider reconciliation.

Before starting, the command verifies the exact provider version, a clean worktree, a named branch, no
active Git operation, and Tier-2 authorization through `--yes`/`-y` or a TTY confirmation. Continuation
requires an active rebase, no unresolved paths, at least one staged resolution, no `--downstack`, and the
same authorization. Other operations are refused. A non-interactive invocation without `--yes` is a
usage error.

The command invokes at most one provider mutation. It then reinspects only minimal Git state and reports
`completed`, `conflict-stopped`, or `refused`, with bounded paths/diagnostics and a concise recovery
action. A second conflict stop requires another resolution and invocation. Provider refusal and safety
refusal exit 1; request/protocol/inspection failures exit 2. Recovery is rendered last for humans.

A conflict is durable, resumable partial state: already-rebased lower branches may have moved while the
current and later branches remain pending. Resolution stays in the initiating worktree, handles one stop
at a time, stages only an accepted resolution, runs relevant project checks, and invokes continue at most
once before observing the next state. Ambiguous resolutions escalate and remain stopped. GS never
implicitly aborts, skips, replays the start command, or switches a provider-started operation to raw Git;
`gh stack rebase --abort` requires explicit user authorization.

The CLI owns deterministic version and Git-state preflight, one provider invocation, and structured
outcome classification. The portable skill and `/ns:gs:restack-resolve` Pi router remain pending; they
will own sequential conflict-resolution policy, validation choice, human escalation, and recovery
narration without adding provider or Slot mechanics. Reproducible observations and rejected alternatives are recorded in
[`docs/research/gh-stack-v0.1.0-restack-resolve-contract.md`](../../../../../docs/research/gh-stack-v0.1.0-restack-resolve-contract.md).

### Optional Slots composition

Slots are not required for core GS operation. Optional autoslot composition begins only after the GS
branch, checkpoint, provider facts, and clean worktree are verified. It invokes Slots through the public
command boundary. Slot refusal or failure preserves the already verified GS state and does not replay or
roll back provider mutation.

For restack-resolve, every branch in the selected range must be free in other worktrees before mutation.
Releasing occupied Slots is optional composition through the public Slots command boundary and requires
user authorization. An interrupted rebase keeps its initiating Slot occupied until it completes or the
user explicitly authorizes abort.

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
