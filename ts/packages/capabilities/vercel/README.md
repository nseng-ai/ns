# @nseng-ai/vercel

Vercel-native cloud dispatch for ns. This package is both the Vercel deployable
and the home of the `ns dispatch` command family. Every dispatch starts a
**Vercel Workflow** that supervises an isolated **Vercel Sandbox** over an exact
repository revision. Results land through git on an anchor pull request opened
before the run starts.

The broader product contract is developed README-first in
`.ns/objectives/cloud-execution/references/README-draft.md`. This README records
the package's current prompt and Saved Plan dispatch contract.

> [!WARNING]
> **This is prototype-quality code.** We are deliberately racing toward an
> end-to-end prototype as quickly as possible so we can validate the complete
> dispatch path with real usage. Expect rapid changes, rough edges, incomplete
> hardening, and breaking internal contracts. Do not treat this package as
> production-ready or as evidence that its reliability, security, operational,
> or compatibility boundaries are settled.

> **Status: locally implemented, not deployed or live-proven in this form.**
> Prompt and plan use the same generic Branch Memory instruction delivery,
> locator-only workflow input, sandbox precheck, and harness bootstrap in local
> code with fake-driven coverage. The deployed dispatch service predates this
> wire contract. A new `build:deployable`, deployment, and controlled prompt and
> plan runs are still required. `build:deployable` is currently blocked in the
> implementing worktree because local Vercel Project Settings are absent. The
> earlier raw-prompt steel thread remains useful historical evidence, but it
> does not prove this redesigned path.

## Dispatch work

Dispatch a prompt from any shell:

```sh
ns dispatch prompt "Rename the widget gateway methods"
```

Dispatch an explicit Saved Plan:

```sh
ns dispatch plan ~/.local/state/ns/enriched-plan/nseng-ai--ns/main/add-cache.md
```

Pi also exposes `/ns:dispatch:plan`; with no argument it selects the current
session's most recent Saved Plan. That selection is Pi sugar—the kernel command
always receives an explicit plan reference.

Both commands require a clean worktree and an exact branch head that the remote
can fetch. Source publication follows the shared Graphite-aware dispatch policy,
then dispatch creates a `dispatch/...` anchor branch and opens its PR. The anchor
is the remote implementation branch and remains the durable success or failure
record.

## One generic instruction contract

Prompt and plan differ only while preparing local intent. The workflow receives
neither a raw prompt nor a plan body, and receives no `prompt`/`plan` work-kind
discriminator. It receives a Dispatch ID and a pinned locator for one required
Branch Memory Entry:

```text
Namespace: dispatch-context
Branch:    <dispatch-anchor-branch>
Key:       <dispatch-id>/instructions.md
```

For `ns dispatch prompt`, `instructions.md` contains the exact prompt.

For `ns dispatch plan`, dispatch first resolves the Saved Plan and ensures it is
a normal **Attached Plan** on the anchor branch:

```text
Namespace: branch-context
Branch:    <dispatch-anchor-branch>
Key:       <plan-slug>.md
```

An absent attachment is created, a byte-identical attachment is reused, and a
same-key attachment with different content is refused without overwrite. The
generic instruction Entry does not copy the plan; it directs the agent to load
and implement that Attached Plan and includes its exact pinned commit and Entry
Locator. Thus neither “latest plan” selection nor a mutable attachment can
change what the run executes.

Both Entries are anchor-scoped. Branch Context owns Attached Plan key,
Namespace, and collision policy; the Vercel capability consumes its curated API
rather than reproducing those invariants.

## Sandbox bootstrap

Branch Memory synchronization must be configured once:

```sh
brmem setup-git
```

Dispatch checks this before anchor mutation and prints the command when setup is
missing; it never silently changes Git configuration.

During sandbox setup, the workflow uses the ephemeral clone credential to fetch
all `refs/brmem/*` refs. It then verifies the exact pinned instruction Snapshot
commit and requires `<dispatch-id>/instructions.md` at that commit before the
agent launches. Every harness receives the same bootstrap direction: run the
exact `brmem get` for that pinned instruction Entry first, then follow all
returned instructions. The workflow does not inspect arbitrary sibling context
or interpret whether the instruction originated as a prompt or plan.

Fetching all Branch Memory refs makes instruction-referenced context available
without leaving a standing Git credential in the sandbox. The agent works
without clone or push credentials; the supervisor injects a freshly minted
landing credential only into the final landing command.

## Provenance and output

The Dispatch ID correlates command output, anchor provenance, and the
`dispatch.id` Vercel Workflow attribute. Vercel still assigns a `wrun_...` ID;
the local recovery path can look it up by exact Dispatch ID and refuses zero or
multiple matches.

Human output stays compact: Dispatch ID, anchor PR link, and Workflow link.
Prompt PRs retain only a short sanitized excerpt, not the complete prompt.
Machine output and marked PR provenance retain the recovery record:

- source branch and exact dispatched revision;
- Dispatch ID and anchor identity;
- instruction Namespace, anchor branch, key, Snapshot Ref, pinned commit, and
  Entry Locator;
- for plan dispatch, separate Attached Plan Namespace, branch, key, Snapshot
  Ref, pinned commit, and Entry Locator;
- Workflow run ID when submission succeeds.

Branch Memory is the authoritative exact instruction record. Entries are
retained as input evidence; automatic cleanup is intentionally deferred.

## Failure and recovery

Anchor creation precedes anchor-scoped Branch Memory delivery. A failure after
the anchor opens leaves that PR open and reports every durable artifact already
created; it must not be described as a started run unless workflow submission
actually succeeded.

- Missing Branch Memory setup fails before anchor mutation.
- Attached Plan conflict fails without overwriting the existing Entry.
- Instruction creation, Snapshot publication, or remote verification failure
  reports the Dispatch ID, anchor, and available attachment/instruction
  evidence; no workflow starts.
- Sandbox fetch, pinned Snapshot verification, or required instruction check
  failure is reported durably on the anchor PR before agent launch.
- Runtime failure leaves the anchor PR open and marked failed for triage.

Retries use a new dispatch identity rather than replacing retained input
evidence.

## Current evidence and remaining gates

The generic anchor-scoped implementation and its fake-driven tests are green
locally. The prior cloud program separately proved the Vercel Workflow/Sandbox
spine and completed one raw-prompt dispatch, but that deployment and witnessed
run predate this generic locator-only cutover.

Before this contract can be called deployed or live-proven, an authorized
operator must:

1. supply/link the local Vercel Project Settings needed by `build:deployable`;
2. pass the deployable build and deploy the new trigger/Workflow artifacts;
3. witness a prompt dispatch retrieving its exact instruction Entry and landing
   normally; and
4. witness a plan dispatch retrieving the pinned Attached Plan, producing an
   agent commit, and landing normally.

No public arbitrary-Entry command, automatic Entry cleanup, second harness, or
backend-neutral execution abstraction is part of this contract.
