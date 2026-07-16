# Dispatch a Saved Plan

`ns dispatch plan` sends a Saved Plan to the configured ns cloud runner and returns immediately with an anchor pull request. The remote agent executes the plan against your exact branch head; its commits, decision log, and any failure report land on that pull request.

```sh
ns dispatch plan ~/.local/state/ns/enriched-plan/nseng-ai--ns/main/add-cache.md
```

The kernel command always takes an explicit Saved Plan reference. Harness integrations may offer session-aware convenience—for example, a Pi command can select the latest Saved Plan from the current session—but they ultimately call the same explicit command.

## Before you dispatch

The worktree must be clean, the source revision must be remotely reachable, and Branch Memory synchronization must be configured for the repository's Git remote.

Configure Branch Memory once in the clone:

```sh
brmem setup-git
```

Dispatch checks this prerequisite. It does not silently edit Git configuration. If synchronization is not configured, the command stops before starting cloud work and tells you how to fix it.

## How the plan travels

The Saved Plan remains the thing you select. Branch Memory is the delivery mechanism.

Before starting the cloud workflow, ns:

1. resolves the explicit Saved Plan;
2. stores a dispatch-owned copy in Branch Memory Namespace `dispatch-input`, under a unique key for this dispatch;
3. publishes and verifies the exact Branch Memory Snapshot Ref on the remote; and
4. sends the workflow a typed locator—not the plan body.

The delivery Entry is retained after the run as input evidence. It is not an Attached Plan and does not use the `branch-context` Namespace.

In the sandbox, the supervisor fetches the exact Snapshot Ref and checks that the Entry is readable before launching the agent. The agent's first task action is `brmem get` for that locator; it then executes the retrieved plan.

This keeps large plan content out of HTTP and workflow payloads while making the dispatched input git-native, inspectable, and reproducible.

## What runs remotely

The remote agent receives:

- your repository at the exact dispatched commit;
- the Branch Memory locator for the delivered Saved Plan; and
- an instruction to retrieve that Entry with `brmem get` and execute it.

The agent does not choose a different plan, fall back to the latest plan, or infer work from the branch. If the exact Entry cannot be fetched and checked, the workflow does not ask the agent to improvise.

## The anchor pull request

Dispatch creates a `dispatch/` anchor branch and opens its pull request before the workflow runs. The pull request records the source revision, workflow run, and plan-delivery provenance. Successful agent commits land there. A terminal retrieval, execution, or landing failure is also reported there so the dispatch cannot disappear silently.

The result path is unchanged from `ns dispatch prompt`: git carries the work back; the anchor pull request is the durable review and pickup surface.

## Failure and retry

Dispatch reports which durable artifacts already exist when a step fails. In particular, a Branch Memory Entry or remotely published Snapshot Ref may exist even if no workflow started. Retrying uses a new dispatch identity rather than silently replacing another dispatch's input evidence.

If setup preflight fails, run the printed `brmem setup-git` command and retry. If remote verification fails, inspect the reported Snapshot Ref and Git error before retrying. If sandbox retrieval fails after the anchor pull request exists, read the durable failure report on that pull request.

## Current status

This README is the design contract for work in progress. `ns dispatch plan` and its Branch Memory delivery path are not yet implemented or live-proven. The existing Vercel Workflow supervisor and anchor-PR result path come from `ns dispatch prompt`; this work adds Saved Plan input without creating another cloud backend.

## Open questions

- The exact human-readable Entry Key shape within `dispatch-input` is not settled.
- The final command output and anchor-PR fields for the Branch Memory locator are not settled.
- Retained delivery Entries have no automatic cleanup policy in this work.
