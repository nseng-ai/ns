# @nseng-ai/gs

Native ns workflows for
[`github/gh-stack`](https://github.com/github/gh-stack).

Today the package implements local inventory through `ns gs list` and one state-driven local mutation
through `ns gs restack-resolve`. The lifecycle contract below governs later preparation, reconciliation,
publication, inventory-generation, and landing commands. Unimplemented workflows are not available
commands or compatibility promises.

## Supported gh-stack baseline

Lifecycle workflows initially support exactly `gh stack version 0.1.0`. Because gh-stack is pre-1.0,
every lifecycle workflow must verify the installed version before mutation and refuse an unqualified
version mismatch. A later version is not assumed compatible: widening support requires evidence for its
public commands, output, mutation boundaries, and recovery behavior.

The reproducible baseline and unresolved experiments are recorded in
[`docs/research/gh-stack-v0.1.0-workflow-baseline.md`](../../../../../docs/research/gh-stack-v0.1.0-workflow-baseline.md).
The linked-worktree inventory storage evidence is recorded in
[`docs/research/gh-stack-v0.1.0-linked-worktree-inventory.md`](../../../../../docs/research/gh-stack-v0.1.0-linked-worktree-inventory.md).
The dirty-work initialization, extension, and recovery evidence is recorded in
[`docs/research/gh-stack-v0.1.0-autobranch-contract.md`](../../../../../docs/research/gh-stack-v0.1.0-autobranch-contract.md).
The architecture boundary is accepted in
[ADR 0061](../../../../../docs/adr/0061-gs-native-lifecycle-ownership.md).

## Lifecycle contract

GS owns a gh-stack-native everyday loop. It does not adapt gh-stack beneath Flow, reproduce Graphite
command parity, or expose a universal stack-tool transaction. Flow remains the owner of its existing
Graphite workflows.

The intended outcome loop is:

1. inspect work and local stack facts;
2. checkpoint work;
3. bootstrap a stack or extend its top;
4. optionally move the verified branch into a Slot;
5. reconcile local Git, remote Git, gh-stack, and GitHub facts;
6. submit branches and pull requests;
7. prepare or apply GS PR inventories; and
8. land a verified stack or prefix and reconcile the result.

Local inspection and the local inter-branch `restack-resolve` CLI are implemented. Before any later
mutating step is implemented, its focused gh-stack experiment must settle the supported starting states,
public gh-stack operations, observed postconditions, refusals, partial effects, and recovery guidance.
The v0.1.0 help text for `sync`, `submit`, `link`, and `merge` describes candidate capabilities; its
remote effects, rollback, atomicity, and failure boundaries are not yet ns guarantees.

Lifecycle code uses only supported public gh-stack commands. It never reads or mutates private
`gh-stack` state; the existing inventory reader is a separately justified current-worktree inspection
feature and is not an authority for lifecycle mutation.

### Observed postconditions

A gh-stack exit code, success message, or JSON response is evidence, not proof of completion. After each
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
gh-stack private metadata. No-remote experiments show only that v0.1.0 preflight failures left tested
local refs and worktrees unchanged; they do not establish general rollback or transactionality.

### Implemented command: restack-resolve

```bash
ns gs restack-resolve --yes
ns gs restack-resolve --full --yes
```

`ns gs restack-resolve` is a local inter-branch workflow pinned to exactly `gh stack` v0.1.0. A start
defaults to the narrower downstack scope (`gh stack rebase --no-trunk --downstack`) and widens to the
full inter-branch scope (`gh stack rebase --no-trunk`) only when `--full` is explicitly requested. An active,
resolved rebase with a staged resolution selects exactly one `gh stack rebase --continue`; there is no
public `--continue` flag. Every gh-stack call disables prompts and editors with a per-command environment
overlay. The command never uses `env`, `sync`, network APIs, raw Git continue/abort, or gh-stack
private state.

This command deliberately does **not** update trunk or rebase the bottom stack branch onto a changed
trunk. Fetching, trunk integration, pushing, and GitHub reconciliation remain part of the unsettled
reconciliation workflow. Plain `gh stack rebase` is not used because it pulls from the remote by default.
A GS-owned raw-Git cascade is also rejected for the normal path because it duplicates gh-stack recovery
and leaves public gh-stack base facts stale until gh-stack reconciliation.

Before starting, the command verifies the exact gh-stack version, a clean worktree, a named branch, no
active Git operation, and Tier-2 authorization through `--yes`/`-y` or a TTY confirmation. Continuation
requires an active rebase, no unresolved paths, at least one staged resolution, no `--full`, and the
same authorization. Other operations are refused. A non-interactive invocation without `--yes` is a
usage error.

The command invokes `gh stack rebase` at most once. It then reinspects only minimal Git state and
reports `completed`, `conflict-stopped`, or `refused`, with bounded paths and diagnostics plus a concise
recovery action. A second conflict stop requires another resolution and invocation. A gh-stack refusal
and a safety refusal exit 1; request, protocol, and inspection failures exit 2. Recovery is rendered last
for humans.

A conflict is durable, resumable partial state: already-rebased lower branches may have moved while the
current and later branches remain pending. Resolution stays in the initiating worktree, handles one stop
at a time, stages only an accepted resolution, runs relevant project checks, and invokes continue at most
once before observing the next state. Ambiguous resolutions escalate and remain stopped. GS never
implicitly aborts, skips, replays the start command, or switches an operation started by gh-stack to raw Git;
`gh stack rebase --abort` requires explicit user authorization.

The CLI owns deterministic version and Git-state preflight, one `gh stack rebase` invocation, and
structured outcome classification. The portable skill owns sequential conflict-resolution policy,
validation choice, human escalation, and recovery narration. The directly discovered
`/ns:gs:restack-resolve` router captures exactly one effective skill before mutation, delegates one
fresh `ns gs restack-resolve --format json --yes` step, returns without an LM turn on completion, and
hands only a trustworthy conflict stop to that captured skill. It fails closed for refusals, usage or
protocol failures, malformed envelopes, process/envelope exit mismatch, and process failure.

Neither the skill nor Pi adapter adds gh-stack mechanics or edits/loops on Pi's behalf. This slice
explicitly excludes trunk integration, push or GitHub mutation, Slot release, and automatic abort.
Reproducible observations and rejected alternatives are recorded in
[`docs/research/gh-stack-v0.1.0-restack-resolve-contract.md`](../../../../../docs/research/gh-stack-v0.1.0-restack-resolve-contract.md).

### Proposed command: autobranch (provisional — not yet implemented)

> **Provisional.** This section is an accepted contract proposal only. `ns gs autobranch` is not a
> registered or available command, and nothing in this section is a compatibility promise until an
> implementation slice removes this marker.

Autobranch turns dirty pending work into a new gh-stack child branch. It is specified as a Tier-2
local mutation pinned to exactly gh-stack v0.1.0. A TTY user receives a prepared preview and
confirmation; a non-interactive caller must pass `--yes`/`-y`. `--slug`/`-s` is optional. Explicit
invalid or colliding child names are refused; the command does not silently suffix them.

Preflight requires a named HEAD, readable source SHA, nonempty porcelain including untracked files,
no active Git operation, a valid absent child ref, and cached `refs/remotes/origin/HEAD`. It never
fetches. Pending work can be staged, unstaged, untracked, or mixed; the checkpoint stages all pending
work.

The contract supports exactly two paths:

1. **dirty cached-trunk bootstrap:** ordinary Git creates and switches to the child, GS proves the
   dirty transfer, checkpoints all pending work, proves a clean committed child and an unchanged
   trunk, then runs exactly `gh stack init <child>` and verifies a one-layer invoking-worktree
   provider view;
2. **dirty tracked-top extension:** the invoking worktree's public `gh stack view --json` must prove
   the current non-trunk branch occurs exactly once and is current/topmost. GS runs exactly
   `gh stack add <child>`, reinspects even after provider failure, proves source/child adjacency and
   dirty transfer, then checkpoints and reverifies clean current/top facts.

A branch tracked only by a peer worktree is refused as untracked in the invoking provider view.
Runtime never enumerates peers. Provider exit status is evidence, not authority: fresh observations
can prove completion after a nonzero exit. Results are `refused`, `completed`,
`known-partial-failure`, or `ambiguous-failure`, with bounded effects, preserved SHA/dirtiness/
provider facts, and one recovery action. There is no automatic retry, rollback, child deletion,
`unstack`, provider-private state access or repair, peer scan, Slot movement, push, or GitHub
mutation.

The supporting provider evidence and the stable contract clause identifiers (`AB-*`) that later
implementation slices cite are recorded in
[`docs/research/gh-stack-v0.1.0-autobranch-contract.md`](../../../../../docs/research/gh-stack-v0.1.0-autobranch-contract.md).

### Optional Slots composition

Slots are not required for core GS operation. Optional autoslot composition begins only after the GS
branch, checkpoint, gh-stack facts, and clean worktree are verified. It invokes Slots through the public
command boundary. Slot refusal or failure preserves the already verified GS state and does not replay or
roll back a gh-stack mutation.

For restack-resolve, every branch in the selected range must be free in other worktrees before mutation.
Releasing occupied Slots is optional composition through the public Slots command boundary and requires
user authorization. An interrupted rebase keeps its initiating Slot occupied until it completes or the
user explicitly authorizes abort.

## Implemented command: local inventory

### Prerequisites

- Node.js 24.12 or newer and ns;
- a current working directory inside a Git repository.

`ns gs list` does not require `gh`, GitHub authentication, or network access. It asks Git for
`--git-path gh-stack`, reads exactly that invoking-worktree state file, and checks repository-shared
local branch refs. Linked worktrees can therefore report missing or divergent provider inventories over
the same refs; the command does not enumerate, merge, or fall back to peer worktree state.

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

`ns gs list` reports each stack recorded by gh-stack in the invoking worktree that still has at least one
recorded stack branch present as a local Git branch. The base branch alone does not keep a stack in the
inventory. A retained stack preserves all branches recorded by gh-stack, including branches that were
deleted locally, because the recorded shape remains useful context.

Every successful result includes `providerWorktreeGitDir`, the canonical worktree Git directory derived
from Git's absolute `--git-path gh-stack` result. Human output renders this provenance before the stacks,
including for an empty inventory. It identifies the inspected provider view; it does not claim that this
worktree owns every branch or that peer provider state agrees.

The command does not contact GitHub to verify current PR state, and it does not deduplicate repeated
stack numbers. A missing state file, an empty `stacks` array, or no recorded stack with a remaining local
branch returns a successful empty inventory.

The compact view has `NUMBER`, `STACK`, and `BASE` columns. A one-branch stack shows its branch once;
other stacks use `<bottom>...<top>`. `--verbose` (`-v`) renders each stack from its top branch down to
its base. JSON preserves gh-stack's bottom-to-top branch order and includes recorded PR numbers and the
recorded merged flag. `--verbose` cannot be combined with `--format json`.

Results are ordered deterministically: unnumbered stacks first, numbered stacks descending by number,
then the compact stack summary ascending. Unknown additive gh-stack fields and unfamiliar
`schemaVersion` values are tolerated. Invalid JSON or any malformed consumed record fails the complete
inventory with `gh-stack-state-unsupported`; the command never returns a partial inventory.

This implemented command does not mutate Git, GitHub, or gh-stack state. Its recorded PR evidence is
current-worktree-local only and does not establish current GitHub state.
