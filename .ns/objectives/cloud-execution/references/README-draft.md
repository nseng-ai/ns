# Cloud dispatch

Hand work to the cloud without leaving your session. `ns dispatch prompt` and
`ns dispatch plan` prepare different forms of intent locally, then use one
Vercel-native execution path: an anchor pull request, generic Branch Memory
instructions, a locator-only Vercel Workflow run, and an isolated Sandbox. Your
session does not wait for the remote work; commits and a decision log return on
the anchor PR.

> **Status.** The generic prompt/plan instruction path described here is locally
> implemented and fake-driven, but is not deployed or live-proven. The currently
> deployed service and the earlier witnessed prompt run predate this wire
> contract. A new `build:deployable`, deployment, and controlled prompt and plan
> runs remain required. The implementing worktree cannot currently run
> `build:deployable` because it has no local Vercel Project Settings.

## Quick start

Dispatch an exact prompt:

```sh
ns dispatch prompt "Rename the widget gateway methods to match the command-shape convention"
```

Dispatch an explicit Saved Plan:

```sh
ns dispatch plan ~/.local/state/ns/enriched-plan/nseng-ai--ns/main/add-cache.md
```

Pi's `/ns:dispatch:plan` may select the current session's latest Saved Plan when
no argument is supplied; the kernel command still receives an explicit plan
reference. Prompt dispatch also accepts `--slug/-s` when model-backed semantic
anchor naming should be bypassed.

The CLI reports local setup phases, publishes and revalidates the exact source
revision when needed, opens the anchor PR, delivers instructions, and starts the
workflow. On success it prints compact links to the anchor and Workflow run.

## What is dispatched

Every dispatch creates one required instruction Entry scoped to its anchor
branch:

```text
Namespace: dispatch-context
Branch:    <dispatch-anchor-branch>
Key:       <dispatch-id>/instructions.md
```

A prompt's Entry contains the exact prompt. A plan's Entry contains directions
to load and implement an exact normal Branch Context Attached Plan, also scoped
to the anchor branch:

```text
Namespace: branch-context
Branch:    <dispatch-anchor-branch>
Key:       <plan-slug>.md
```

The plan attachment is created when absent, reused only when byte-identical, and
never overwritten on conflict. Its commit is pinned in the instruction text, so
the remote agent cannot substitute a latest or mutable plan.

The Workflow receives only the Dispatch ID and a pinned locator for
`instructions.md`: Namespace, anchor branch, exact key, Snapshot Ref, Snapshot
commit, and Entry Locator. No raw prompt, plan body, or prompt/plan discriminator
crosses the HTTP or Workflow boundary.

## What the remote agent sees

Dispatch works from a clean tree and an exact remotely reachable branch head.
A definitively untracked source is published by exact-SHA Git; tracked
current/downstack publication follows Flow's structured Graphite plan and its
confirmation policy. Dispatch then revalidates repository, branch, HEAD,
cleanliness, configuration, identity, and remote tip before anchor mutation.

The workflow creates a Sandbox at that exact revision. During setup it uses the
ephemeral clone credential to fetch all `refs/brmem/*`, verifies the pinned
instruction Snapshot commit, and requires the exact instruction Entry. It then
gives every configured harness the same bootstrap direction: retrieve that
Entry with exact `brmem get` coordinates first and follow all returned
instructions. The workflow does not interpret prompt versus plan content.

The agent works without a standing Git credential. The supervisor mints a fresh
landing credential only for the final landing command.

## The anchor PR

Every dispatch creates a `dispatch/...` branch and opens its PR before Branch
Memory delivery or workflow submission. The branch starts from the verified
source revision with a metadata-only initialization commit; all produced work
lands on this branch, never on the source branch.

Prompt PRs keep a short sanitized excerpt, not the exact prompt. Marked
provenance remains sufficient for recovery: source revision, Dispatch ID,
instruction locator and pinned commit, separate Attached Plan evidence for plan
dispatch, and the Workflow run ID once submission succeeds. Human CLI output
shows only the Dispatch ID and clickable PR/Workflow links.

If instruction delivery fails after the anchor opens, the PR remains open and
the command reports created/published artifacts without claiming a run started.
If the remote run fails, the PR remains open and is marked failed; one bounded,
sanitized diagnostic — shared by the Workflow failure card, durable status
stream, and idempotent PR comment — names the failed operation, and raw errors
and dispatched content are never published. On success,
produced commits and the agent's decision log land there.

## Setup

Repository configuration lives in the root `ns.toml` `[dispatch]` table. The
implemented registry currently supports `pi`; unsupported harnesses fail local
and remote preflight. Configuration includes stable Vercel project/team IDs,
the Workflow dashboard URL, deployment URL, and optional IANA anchor timezone
(default `America/Los_Angeles`). The checkout also declares an exact stable pnpm
version in `ts/package.json#packageManager`.

Configure Branch Memory synchronization once:

```sh
brmem setup-git
```

Dispatch checks this read-only before anchor mutation and never edits Git
configuration automatically.

Credentials retain the proven phased contract:

- model keys are sensitive Vercel project variables selected by the harness
  registry;
- repository clone and landing credentials are short-lived, repo-scoped GitHub
  App installation tokens minted by the supervising workflow;
- local trigger/status calls use Vercel Development OIDC;
- local source publication and anchor creation use the caller's existing
  Git/Graphite/GitHub credentials.

The package is the Vercel project's Root Directory. `just dispatch-deploy-prod`
is the canonical clean-tree deployment command; it runs the package's
`build:deployable` gate, verifies linked project identity and artifact inventory,
deploys the prebuilt output, and verifies the stable alias. It is implemented
locally, but no deployment carrying the generic locator-only contract is claimed.
The legacy deployed `NS_DISPATCH_SANDBOX_MINT_SECRET` remains inert and awaits
human cleanup; current source does not consume it.

## Current evidence

The Vercel Workflow/Sandbox spine has historical live evidence: authenticated
workflow startup, private checkout, short and 840-second supervision, and one
raw-prompt dispatch that landed proof output and a decision log through fallback
recovery. That run exposed Pi lifecycle/PATH defects whose local repairs remain
awaiting a controlled rerun.

The newer generic instruction path—anchor-scoped exact prompt instructions,
anchor-scoped pinned Attached Plans, fetch-all Branch Memory setup, locator-only
Workflow input, and compact PR provenance—has local tests only. It must not be
inferred to be deployed from the older evidence.

## Planned work

- a controlled prompt rerun proving first-call Bash, an agent-created commit,
  subagent spawn, exact instruction retrieval, and normal landing;
- a first real Saved Plan dispatch proving the pinned Attached Plan path;
- a reusable setup skill distilled only after the repaired path is live-proven;
- `/ns:dispatch:session`, a dispatch jobs TUI, Claude Code as a second complete
  harness recipe, and scheduled objective advancement.

## Open questions

- The jobs TUI's command name and whether notification extends beyond the TUI
  and anchor PR.
- The opt-in and source-ref policy for nightly objective advancement.

Retention is deliberate input evidence for now. Cleanup of `dispatch-context`
and `branch-context` Entries requires a separate evidence-preserving policy.
