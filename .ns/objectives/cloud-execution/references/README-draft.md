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
to pick it up and continue. The kernel command is
`ns dispatch handoff <ref>` — it takes an explicit handoff reference, so
any handoff (including one created earlier) can be dispatched from any
harness; capturing the *current* session is the Pi command's sugar.

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
browser tab. The TUI enumerates the `dispatch/` anchor PRs and follows each
one's run handle into Vercel's own run observability for live state and
logs. (Command name: see Open questions.)

### Under the hood

The Pi commands are thin mirrors of the `ns dispatch plan|prompt|handoff`
kernel CLI, so the same surface is reachable from any harness — Claude Code
and Codex get the identical commands through wrapper skills. Pi is the
first-documented experience, not a privileged one.

There is no per-dispatch backend, harness, or model choice — you dispatch
work, not runtimes. Cloud dispatch is Vercel-native: the `@nseng-ai/vercel`
capability package runs dispatches on Vercel Sandbox and scheduled work on
Vercel Workflows. Which agent harness runs inside the sandbox is
preconfigured in the repository (see "Setup").

## The anchor PR

Every dispatch opens its pull request **up front**, before the job is
submitted: a new `dispatch/`-prefixed branch based at the commit you
dispatched from is pushed, and a PR opens for it immediately. The PR is the
job's anchor — one durable, linkable place where the dispatch is observable
from the moment it exists. At submission the PR is stamped with the run's
handle, so anything (you, the jobs TUI) can get from the PR to the run's
state and logs later — the anchor PR is the durable record, not a local
ledger or a cloud console.

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

Non-secret repo configuration lives in the repo-root `ns.toml`, in a typed
`[dispatch]` table: which agent harness runs inside the sandbox (Pi first)
and the stable Vercel project/team IDs. It's versioned with the repo, so every
clone dispatches the same way:

```toml
[dispatch]
harness = "pi"
vercel_project_id = "prj_..."
vercel_team_id = "team_..."
```

Credentials are configured once, on the Vercel project that backs cloud
dispatch, using Vercel's own secrets infrastructure:

- **Model keys** live as sensitive environment variables on the dispatch
  project — encrypted at rest, write-only after creation. The bootstrap
  recognizes `ANTHROPIC_API_KEY` and `OPENAI_API_KEY`; a run receives only
  the key required by its configured model.
- **Git access** (clone + push) uses short-lived, repo-scoped credentials
  minted per run as **GitHub App installation tokens**; no long-lived broad
  token sits in an env var. One-time setup: register the org-owned
  `ns-dispatch` GitHub App and install it on the repository. For an existing
  App, GitHub generates additional private keys only through the App settings
  UI: restrict the downloaded PEM to owner access, stream it without printing
  into the sensitive `NS_DISPATCH_GITHUB_APP_PRIVATE_KEY` variable, verify the
  App and installation identity, then remove the local copy after cloud
  verification. GitHub's App Manifest flow can instead return a PEM once while
  creating a new App; it does not rotate an existing App's key. Non-secret app
  and installation IDs use `NS_DISPATCH_GITHUB_APP_ID` and
  `NS_DISPATCH_GITHUB_APP_INSTALLATION_ID`; the prototype's landing-time shared
  secret uses the sensitive `NS_DISPATCH_SANDBOX_MINT_SECRET` variable.
  Anchor-PR activity from remote runs attributes to `ns-dispatch[bot]`.
- **Executor auth** is Vercel OIDC federation: Vercel-hosted compute gets a
  short-lived token injected automatically, and dispatching from your own
  machine uses the development token from `vercel link` + `vercel env pull`.
- **Your own machine keeps using its own credentials.** The up-front anchor
  push and PR open ride the git/gh auth already on your machine; minted
  tokens are for the remote side, where no human credential exists.

Sandboxes are secret-free by default: each run receives only the credentials
it needs, injected at sandbox creation — and the git credential is phased:
a clone-scoped token at start, no token while the agent works, and a fresh
short-lived token minted only when the run is ready to land its results.
Dispatch preflights credentials and reports exactly what is missing before
any remote work starts.

### Mint endpoint configuration

The dispatch deployable's `POST /api/mint` endpoint reads these variables:

| Variable                                 | Sensitivity | Purpose                                                        |
| ---------------------------------------- | ----------- | -------------------------------------------------------------- |
| `NS_DISPATCH_GITHUB_APP_ID`              | Non-secret  | GitHub App identifier                                          |
| `NS_DISPATCH_GITHUB_APP_INSTALLATION_ID` | Non-secret  | Installation restricted to the configured repository           |
| `NS_DISPATCH_GITHUB_APP_PRIVATE_KEY`     | Sensitive   | Signs GitHub App authentication; never pull to a dev machine   |
| `NS_DISPATCH_SANDBOX_MINT_SECRET`        | Sensitive   | Prototype landing credential; replace with a per-run voucher   |
| `NS_DISPATCH_GITHUB_REPOSITORY`          | Non-secret  | Exact authorized `owner/repo`; also needed in Development      |
| `NS_DISPATCH_VERCEL_TEAM_ID`             | Non-secret  | Required development-token `owner_id`                          |
| `NS_DISPATCH_VERCEL_PROJECT_ID`          | Non-secret  | Required development-token `project_id`                        |
| `NS_DISPATCH_VERCEL_OIDC_ISSUER`         | Non-secret  | Exact trusted issuer used for signature and claim verification |
| `NS_DISPATCH_VERCEL_OIDC_AUDIENCE`       | Non-secret  | Exact trusted audience                                         |

Vercel sensitive variables are write-only and their keys cannot be renamed.
Create replacement sensitive variables for a namespace migration, stream fresh
secret material without printing it, and retain the old variables only until
the replacement deployment is verified.

Configure the endpoint only after confirming the linked project's actual
Development token issuer, audience, `owner_id`, `project_id`, and
`environment` claims without printing or recording the token. The endpoint
accepts only `environment: development` with exact team/project matches;
Preview or Production tokens are intentionally forbidden for the local
clone-token path. A mismatch is a configuration failure to fix, not a reason
to widen OIDC trust.

### Controlled private-repository probe

Run Vercel commands from
`ts/packages/capabilities/vercel/deployable`; running `vercel build` at the
repository root does not use the deployable's linked project settings. The
local setup sequence established by the probe entrypoint is:

1. Link that deployable directory to the dispatch project with `vercel link`
   if `.vercel/project.json` is absent.
2. Configure the endpoint variables above. Keep the private key and prototype
   landing secret sensitive; make `NS_DISPATCH_GITHUB_REPOSITORY` available to
   the Development environment so the local probe can read it.
3. Deploy the mint endpoint, then record its explicit HTTPS URL without
   embedding credentials in it.
4. From the deployable directory, refresh the ignored local file with
   `vercel env pull .env.local --environment=development`. This file supplies
   `VERCEL_OIDC_TOKEN` and is ignored by git. Decode only the non-secret claims;
   never print or record the token, and do not guess issuer/audience from URL
   conventions. Keep the ignore rule specific to `.env.local` if the CLI tries
   to append a broader `.env*` rule that would hide intentional env templates.
5. Choose a 40-character commit SHA that is reachable from the GitHub remote; a
   local-only HEAD cannot be cloned by the Sandbox. Invoke the development-only
   fixed probe from the package directory:

   ```sh
   pnpm dev:sandbox-hello-probe -- https://<dispatch-host>/api/mint <40-character-commit-sha>
   ```

The script reads Vercel team/project IDs from the repo-root `[dispatch]`
table and the repository from `NS_DISPATCH_GITHUB_REPOSITORY`; it does not take
those trust inputs as user-controlled arguments. It requests a clone-only
installation token, creates a non-persistent Node 24 Sandbox with a shallow
private-git checkout at the exact SHA, runs only the fixed marker/HEAD
command, compares the observed SHA, and attempts cleanup on every
post-creation path. Successful safe output has this shape and never includes
the OIDC or installation token:

```text
Starting fixed Sandbox hello probe for owner/repo at <sha>.
__NS_SANDBOX_HELLO_PROBE_V1__
HEAD <sha>
```

Common safe failure signals to preserve in the eventual setup skill:

- missing or invalid `VERCEL_OIDC_TOKEN` or
  `NS_DISPATCH_GITHUB_REPOSITORY` in `deployable/.env.local`;
- invalid or missing repo-root `[dispatch]` project/team IDs;
- `401 unauthorized` from missing, malformed, or failed OIDC authentication;
- `403 forbidden` from issuer/audience-adjacent identity policy, wrong
  team/project/environment, wrong purpose, or repository mismatch;
- `500 mint-endpoint-misconfigured` naming only the invalid variable;
- `502 github-token-mint-failed` when App installation, repository scope, or
  requested permissions do not permit the narrow token;
- safe Sandbox create, command, output, revision, or cleanup failures without
  vendor request details or credential values.

The command shape and fake-driven local behavior are implemented. A live
Development-token trust check, deployment, and billable Sandbox probe still
require explicit human authorization and must be recorded separately before
this material is distilled into the reusable setup skill. The shared landing
secret and sandbox self-landing remain prototype shortcuts; their named
upgrades are the per-run landing voucher and Vercel-side supervisor.

## Open questions

Unsettled decisions, visible here on purpose:

- **Dispatch jobs TUI shape.** The TUI is committed, and its status
  plumbing is settled: it enumerates `dispatch/` anchor PRs and follows
  each PR's stamped run handle into Vercel's run observability for state
  and logs. Open: the TUI's command name and whether any push-style
  notification exists beyond the TUI and the anchor PR.
- **Nightly advancement policy.** Which objectives qualify for autonomous
  overnight advancement, what an objective must declare (e.g. a
  `## Runner Policy` section) to opt in, and what the review loop over
  produced branches looks like — including what ref scheduled runs dispatch
  from, since a job has no "current branch" (trunk, presumably).
  (Deliberately deferred to the durable-jobs roadmap row.)
