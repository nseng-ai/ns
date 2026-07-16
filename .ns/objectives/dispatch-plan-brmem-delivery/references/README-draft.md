# Dispatch a Saved Plan

`ns vercel` has the ability to dispatch long-running work remotely. Long-running
autonomous sessions are what make this useful.

Many harness directly support the creation of plans or have a norm of doing so,
and those plan are often the basis of long-running sessions. This system
stacks on that norm, and allows the user to create plans interactively and
then dispatch them for autonomous execution.

```
/ns:dispatch:plan
```

A remote agent gets your repository at the exact commit you're sitting on,
retrieves the exact plan you saved, and executes it. The results — commits
and a decision log — land on a pull request that opens the moment you
dispatch. Your session never blocks.

> **Draft status.** This is the canonical user-facing contract for the
> `dispatch-plan-brmem-delivery` objective, developed README-first. It
> documents the in-harness experience, starting with Pi. `ns dispatch plan`
> is not yet implemented or live-proven; unsettled decisions are listed
> under [Open questions](#open-questions) rather than silently invented.

### One-time setup

Dispatch delivers the plan through Branch Memory, so the clone needs Branch
Memory synchronization configured once:

```sh
brmem setup-git
```

Dispatch checks this before doing anything. It never silently edits your
Git configuration — if setup is missing, it stops before any cloud work
starts and prints exactly this command.

## Pi walkthrough

### 1. Plan in your session

Work through a plan the way you normally do — for example, stress-test it
with `/ns:plan:grill-and-save`, or write it up and run `/ns:plan:save`.
Either way you end with a **Saved Plan**: a self-contained Markdown plan
file in the local plan store, written for a completely fresh implementing
session. That "fresh session" is about to be a cloud one.

### 2. Dispatch

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

### 3. Keep working, then review

The run executes remotely under workflow supervision. When it finishes, the
agent's commits land on the anchor PR alongside its decision log — every
judgment call it made where it would normally have asked you. Review it
like any other PR: check out the branch, continue it, stack on it, or
discard it.

## What the remote agent does

The remote agent receives your repository at the exact dispatched commit
and a locator for the plan you selected — not a paraphrase of it. Its first
action is `brmem get` for that locator; its task is to execute the
retrieved plan.

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

## Under the hood: Branch Memory delivery

The Saved Plan is what you select; Branch Memory is how it travels. Before
starting the cloud workflow, dispatch:

1. resolves your explicit Saved Plan;
2. stores a dispatch-owned copy in the Branch Memory namespace
   `dispatch-input`, under a key unique to this dispatch;
3. publishes that snapshot to the remote and verifies the exact ref is
   reachable; and
4. hands the workflow a typed locator — never the plan body.

The plan content never rides in an HTTP request or workflow payload. It
moves the same way everything else in ns moves: through git. That makes the
dispatched input inspectable (`brmem get` shows exactly what the agent
received), reproducible, and durable — the delivery entry is retained after
the run as input evidence.

The delivery entry is dispatch-owned plumbing: it is not an Attached Plan
and does not touch the `branch-context` namespace your own branch planning
uses.

## If something goes wrong

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

## Current status

This README is the design contract for work in progress. `ns dispatch plan`,
the `/ns:dispatch:plan` Pi command, and the Branch Memory delivery path are
not yet implemented or live-proven. The workflow supervisor and anchor-PR
result path already exist and are proven by `ns dispatch prompt`; this work
adds Saved Plan input without creating another cloud backend.

## Open questions

- The exact human-readable entry key shape within `dispatch-input` is not
  settled.
- The final command output and anchor-PR fields for the Branch Memory
  locator are not settled.
- Retained delivery entries have no automatic cleanup policy in this work.
