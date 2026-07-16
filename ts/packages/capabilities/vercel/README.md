# @nseng-ai/vercel

Vercel-native cloud dispatch for ns. This package is the dispatch deployable —
the Vercel project's Root Directory — and the home of the `ns dispatch`
command family. A dispatch runs as a **Vercel Workflow** that durably
supervises an isolated **Vercel Sandbox** with a fresh checkout of your
repository; the agent's results land through git on an anchor pull request
that opens the moment you dispatch. Your session never blocks.

The broader cloud-dispatch contract — `ns dispatch prompt`, one-time project
setup and credentials, the anchor-PR lifecycle, and scheduled work — is being
settled README-first by the `cloud-execution` objective. Its canonical draft
lives at `.ns/objectives/cloud-execution/references/README-draft.md` and
merges into this README as that objective completes; nothing below replaces
or overrides it. This README currently documents the **Saved Plan dispatch**
contract, which is settled and locally implemented.

## Dispatch a Saved Plan

`ns vercel` has the ability to dispatch long-running work remotely. Long-running
autonomous sessions are what make this useful.

Many harnesses directly support the creation of plans or have a norm of doing
so, and those plans are often the basis of long-running sessions. This system
stacks on that norm, and allows the user to create plans interactively and
then dispatch them for autonomous execution.

```
/ns:dispatch:plan
```

A remote agent gets your repository at the exact commit you're sitting on,
retrieves the exact plan you saved, and executes it. The results — commits
and a decision log — land on a pull request that opens the moment you
dispatch. Your session never blocks.

> **Status: locally implemented, not yet live-proven.** The
> `ns dispatch plan` kernel command, the `/ns:dispatch:plan` Pi command, the
> portable `dispatch-plan` skill, Branch Memory delivery, the locator-only
> workflow input, the sandbox plan precheck, and Dispatch ID recovery lookup
> are implemented and covered by fake-driven tests. No real Saved Plan
> dispatch has been witnessed end to end, and the deployed dispatch
> deployable predates the plan path: a `build:deployable` rebuild and
> deployment are still required, and that rebuild is currently blocked in the
> implementing worktree because it has no local Vercel Project Settings.
> Until the live proof exists, everything below describes the implemented
> local contract, not witnessed cloud behavior.

### One-time setup

Dispatch delivers the plan through Branch Memory, so the clone needs Branch
Memory synchronization configured once:

```sh
brmem setup-git
```

Dispatch checks this before doing anything. It never silently edits your
Git configuration — if setup is missing, it stops before any cloud work
starts and prints exactly this command.

### Pi walkthrough

#### 1. Plan in your session

Work through a plan the way you normally do — for example, stress-test it
with `/ns:plan:grill-and-save`, or write it up and run `/ns:plan:save`.
Either way you end with a **Saved Plan**: a self-contained Markdown plan
file in the local plan store, written for a completely fresh implementing
session. That "fresh session" is about to be a cloud one.

#### 2. Dispatch

```
/ns:dispatch:plan
```

With no argument, the Pi command selects the most recent Saved Plan from
your current session — the one you just finished. Pass an explicit plan
reference to select a different one.

The standard per-dispatch prerequisites shared with `ns dispatch prompt`
apply: a clean worktree and a branch head the remote can see. If your tree
is dirty, dispatch refuses and lists the files; if your branch isn't
pushed, dispatch pushes it first so the remote agent sees exactly what you
see.

Latest-plan selection is Pi session sugar. The underlying command
always takes an explicit Saved Plan reference, and works from any shell:

```sh
ns dispatch plan ~/.local/state/ns/enriched-plan/nseng-ai--ns/main/add-cache.md
```

#### 3. Keep working, then review

The run executes remotely under workflow supervision. When it finishes, the
agent's commits land on the anchor PR alongside its decision log — every
judgment call it made where it would normally have asked you. Review it
like any other PR: check out the branch, continue it, stack on it, or
discard it.

### What the remote agent does

The remote agent receives your repository at the exact dispatched commit
and a locator for the dispatch's context envelope — not a paraphrase of
the plan. Its first action is `brmem get` for the plan member in that
envelope; its task is to execute the retrieved plan.

Precision is the contract:

- It executes **the plan you dispatched** — it does not pick a different
  plan, fall back to "the latest one," or infer work from the branch.
- Before the agent even launches, the workflow supervisor fetches and
  checks that the exact plan entry is readable in the sandbox. If it
  isn't, the run fails deterministically and reports on the anchor PR —
  the agent is never asked to improvise around missing input.
- Like every dispatch, the run is strictly non-interactive: where the
  agent would ask you, it makes the call and records it in the decision
  log.

### Under the hood: Branch Memory delivery

The Saved Plan is what you select; Branch Memory is how it travels. Before
starting the cloud workflow, dispatch:

1. resolves your explicit Saved Plan and creates a **Dispatch ID** for the
   dispatch;
2. stores a dispatch-owned copy in the Branch Memory namespace
   `dispatch-context`, under `<dispatch-id>/plan/<plan-slug>.md`;
3. publishes that snapshot to the remote and verifies the exact ref is
   reachable; and
4. hands the workflow a typed locator for the Dispatch ID context — never
   the plan body.

The Dispatch ID is the correlation key across the dispatch. It appears in
the anchor branch, normal command output, anchor-PR provenance, and as the
`dispatch.id` attribute on the Vercel Workflow run. Vercel still
assigns its own `wrun_...` ID; if that ID needs to be recovered, dispatch
can find the run by its Dispatch ID attribute and refuses to guess if the
lookup returns zero or multiple runs. (The recovery lookup is implemented
locally against a typed Workflow Analytics gateway; live Analytics behavior
is part of the pending end-to-end proof.)

The context envelope is intentionally a Branch Memory key convention in
this version, not a manifest. A plan lives under the `plan/` path; future
typed context can use sibling paths under the same Dispatch ID. The
supervisor checks the expected plan member before launch, and the agent is
instructed how to read it.

The plan content never rides in an HTTP request or workflow payload. It
moves the same way everything else in ns moves: through git. That makes the
dispatched input inspectable (`brmem get` shows exactly what the agent
received), reproducible, and durable — the delivery entry is retained after
the run as input evidence.

The context entries are dispatch-owned plumbing: they are not an Attached
Plan and do not touch the `branch-context` namespace your own branch
planning uses.

### What you see

Pi and human-readable CLI output keep provenance compact: the Dispatch ID and
clickable links to the anchor PR and Vercel Workflow run. The anchor PR
includes the same Dispatch ID in a marked provenance section.

Machine output and the marked PR provenance retain the full recovery
record: Dispatch ID, Vercel run ID, Branch Memory namespace, context prefix,
source branch, exact Snapshot Ref, and links. You get the details when you
need them without turning the normal dispatch flow into transport output.

### If something goes wrong

- **Setup preflight fails** — run the printed `brmem setup-git` command and
  dispatch again.
- **Remote verification fails** — the command reports the snapshot ref and
  the Git error; inspect and retry. Dispatch tells you which durable
  artifacts it already created (a Branch Memory entry or published ref may
  exist even though no workflow started), so retrying is safe: a retry uses
  a new dispatch identity rather than silently replacing another dispatch's
  input evidence.
- **The run fails after the anchor PR exists** — the failure is reported
  durably on that PR, including sandbox-side retrieval failures. A dispatch
  cannot disappear silently: if it got far enough to have an anchor, the
  anchor tells the story.

### Current status

The workflow supervisor and anchor-PR result path already exist and are
proven by `ns dispatch prompt`; Saved Plan dispatch adds plan input to
that spine without creating another cloud backend. The plan path itself is
locally implemented — command, wrappers, Branch Memory delivery, workflow
locator, sandbox precheck, and recovery lookup, all under fake-driven
tests — but three pieces of evidence remain outstanding:

- **Deployable rebuild.** The plan-aware workflow code has not shipped: the
  package's `build:deployable` gate is blocked in the implementing worktree
  (no local Vercel Project Settings), so no deployment carries the plan
  path yet.
- **Live end-to-end proof.** No real Saved Plan dispatch has been witnessed:
  exact remote Snapshot Ref delivery, supervisor precheck, harness
  `brmem get`, plan execution, an agent-created commit, and normal anchor-PR
  landing remain the human-run interlude.
- **Live Analytics recovery.** Dispatch ID recovery lookup is implemented
  and tested against fakes only.

### Open questions

No open question blocks the contract. Retained `dispatch-context` entries
have no automatic cleanup policy in this work; future cleanup must preserve
input evidence and reproducibility.
