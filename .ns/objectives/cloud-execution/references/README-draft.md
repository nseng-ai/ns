# Cloud dispatch

Hand work to the cloud without leaving your session. From inside your harness
— Pi first — you dispatch a plan, a prompt, or the session itself; an agent
runs it against a fresh checkout of your repository in an isolated sandbox,
with the repo's ns skills available. Every dispatch opens a pull request up front as its
anchor, and the results land on it through git. Your session never blocks
on the remote work.

> **Draft status.** This is the canonical user-facing contract for the
> `cloud-execution` objective, developed README-first. It documents the
> in-harness experience, starting with Pi. Decisions that are not yet
> settled are listed under [Open questions](#open-questions) rather than
> silently invented.

## Quick start (Pi)

You're mid-session and a well-scoped piece of work doesn't need you. Send it
away:

```
/ns:dispatch:prompt Rename the widget gateway methods to match the command-shape convention
```

Or dispatch a plan:

```
/ns:dispatch:plan
```

The moment you dispatch, a new branch is pushed and a pull request opens
for it — that PR is the job's anchor from before the work starts. Then keep
working: the run executes remotely, and when it finishes the produced
commits land on the anchor PR, ready to review like any other PR — check
out the branch, continue it, stack on it, or discard it.

## The experience

- **Dispatch from where you work.** The dispatch commands live in your
  harness; there is no separate cloud console, queue UI, or results
  dashboard. If you have the repo, you have the results.
- **The remote agent is a full ns citizen.** It runs in a sandbox against a
  real checkout, so it inherits your objectives, branch context, branch
  memory, and skills — the same context a local session would have. Its
  output flows back the same way: git.
- **Fire and forget, then pick up.** Dispatch returns you to your session
  immediately. Results land on the dispatch's anchor PR, not in a job
  console you have to babysit.
- **No questions mid-flight.** Dispatched runs are strictly non-interactive:
  the remote agent never blocks on you. Where it would normally ask, it
  makes the call and records it in a decision log you review afterward.
- **Watch everything in flight from one place.** A dispatch jobs TUI shows
  the status of all outstanding dispatch jobs — what's running, what's
  landed, what failed — across your sessions.

## Commands

### `/ns:dispatch:prompt`

Dispatches a raw prompt as the unit of work. The remote agent receives the
prompt and the repository at your branch head (see "What the remote agent
sees").

### `/ns:dispatch:plan`

Dispatches a plan doc as the unit of work. The remote agent executes the
plan the way a local implementing session would.

With no argument, Pi dispatches the most recent plan from your session —
you plan, then send the plan away, in one motion. Pass an explicit plan
reference to dispatch something else. Latest-plan resolution is Pi session
sugar; the underlying `ns dispatch plan` CLI always takes an explicit plan
reference.

### `/ns:dispatch:session`

Continues your current session remotely. Where `prompt` and `plan` send a
discrete unit of work, `session` sends *the work you're in the middle of*:
it captures the session's working context as a handoff and dispatches a
remote agent to pick it up and keep going — as if the session itself moved
to the cloud while you go do something else. Results come back the same as
any dispatch: branch and open PR.

The same clean-tree rule applies as for any dispatch: check in a checkpoint
commit of where you are (`/ns:flow:cp`) and push — the branch carries the
code state, the handoff carries the session context.

Under the hood this is the handoff machinery with a predefined continuation
prompt: the handoff carries the context, the prompt tells the remote agent
to pick it up and continue.

### What the remote agent sees

The remote agent checks out **your current branch's head**. If the branch
isn't pushed yet (or the remote is behind), dispatch pushes it first so the
remote agent sees exactly what you see. Your tree must be clean: dispatch
refuses to send anything while you have uncommitted changes, listing the
dirty files, so what runs remotely is never silently missing your edits.
Commit (or stash) and dispatch again.

### Repo scope

Dispatch operates on the repository you run it from: results land on this
repo's remote. There is no cross-repo dispatch — like every other ns
capability, dispatch is repo-local.

### The dispatch jobs TUI

A terminal UI lists every outstanding dispatch job with its status —
running, landed, or failed — each with its anchor PR, and failed ones with
the failure reason and access to the run's logs. This is how you answer
"what did I send away, and is it done?" from the terminal instead of a
browser tab. (Command name and status plumbing: see Open questions.)

### Under the hood

The Pi commands are thin mirrors of the `ns dispatch plan|prompt` kernel
CLI, so the same surface is reachable from any harness — Claude Code and
Codex get the identical commands through wrapper skills. Pi is the
first-documented experience, not a privileged one.

There is no per-dispatch backend, harness, or model choice — you dispatch
work, not runtimes. Which execution backend runs your dispatches (and which
agent harness runs inside it) is preconfigured in the repository; the
backend seam is designed so new backends can be added without reshaping the
commands.

## The anchor PR

Every dispatch opens its pull request **up front**, before the job is
submitted: a new branch based at the commit you dispatched from is pushed,
and a PR opens for it immediately. The PR is the job's anchor — one durable,
linkable place where the dispatch is observable from the moment it exists.

- **While the run executes**, the anchor PR is where a dispatch is visible
  outside your terminal.
- **When the run completes**, the produced commits land on the anchor
  branch, and the PR description carries the agent's **decision log** —
  every judgment call it made where it would normally have asked you — with
  the same log in the run's logs.
- The agent works only on the anchor branch; it never pushes to the branch
  you were sitting on.

Dispatch makes no separate validation promise: the remote agent works under
the same repo rules and skills as any session, and the PR's own CI is the
enforcement. As the capability earns confidence, expect this contract to
tighten toward validated-before-landing.

When a run fails, its anchor PR stays open and is **marked failed** — a
failure comment carrying the reason and a pointer to the run's logs — until
you triage it: re-dispatch, take the work over yourself, or close it. The
jobs TUI shows the same failure state, so nothing fails silently in either
place.

## Scheduled cloud work

The same executor powers durable, scheduled jobs: recurring ns work that
dispatches on a schedule instead of from a session, landing exactly what an
interactive dispatch lands — an anchor PR per unit of work. Examples:

- **Nightly objective advancement** — each night, select qualifying open
  objectives and dispatch work to advance them, so your morning starts with
  a PR queue, one anchor PR per advanced objective, ready for review.
- **Automated smart rebases** — keep outstanding branches current over a
  moving trunk, dispatching an agent to resolve merge conflicts as they
  appear instead of letting branches rot.

Scheduled jobs never merge or land anything on their own: every PR a job
opens waits for human review. The job layer only schedules and supervises
dispatches — all agent work happens inside the same executor that serves
dispatch.

## Setup

Credentials are configured once, on the Vercel project that backs cloud
dispatch, using Vercel's own secrets infrastructure:

- **Model keys** live as sensitive environment variables on the dispatch
  project — encrypted at rest, write-only after creation.
- **Git access** (clone + push) uses short-lived, repo-scoped credentials
  the executor mints per run; no long-lived broad token sits in an env var.
- **Executor auth** is Vercel OIDC federation: Vercel-hosted compute gets a
  short-lived token injected automatically, and dispatching from your own
  machine uses the development token from `vercel link` + `vercel env pull`.

Sandboxes are secret-free by default: each run receives only the credentials
it needs, injected at sandbox creation. Dispatch preflights credentials and
reports exactly what is missing before any remote work starts.

## Open questions

Unsettled decisions, visible here on purpose:

- **Dispatch jobs TUI shape.** The TUI is committed. Run state and logs are
  expected to come from the cloud backend's own run infrastructure (Vercel
  Sandbox / Workflows observability), queried through the backend seam, with
  the anchor PR carrying the durable status trace. Open: the TUI's command
  name and whether any push-style notification exists beyond the TUI and
  the anchor PR.
- **Git credential minting.** The Vercel-native credentials story is
  settled; open is the exact mechanism for minting per-run repo-scoped git
  credentials (fine-grained PAT, GitHub App installation token, or other),
  owned by the credentials roadmap row.
- **Nightly advancement policy.** Which objectives qualify for autonomous
  overnight advancement, what an objective must declare (e.g. a
  `## Runner Policy` section) to opt in, and what the review loop over
  produced branches looks like — including what ref scheduled runs dispatch
  from, since a job has no "current branch" (trunk, presumably).
  (Deliberately deferred to the durable-jobs roadmap row.)
