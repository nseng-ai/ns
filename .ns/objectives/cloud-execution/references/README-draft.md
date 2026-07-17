# Cloud dispatch

Hand work to the cloud without leaving your session. The implemented Pi-first
path dispatches a raw prompt; plan and session dispatch remain planned. A remote
agent runs the work against a fresh checkout in an isolated sandbox,
with the repo's ns skills available. Every dispatch opens a pull request up front as its
anchor, and the results land on it through git. Your session never blocks
on the remote work.

> **Draft status.** This is the canonical user-facing contract for the
> `cloud-execution` objective, developed README-first. It documents the
> in-harness experience, starting with Pi. Decisions that are not yet
> settled are listed under [Open questions](#open-questions) rather than
> silently invented.

## Quick start

From the repository, send a well-scoped raw prompt through the implemented
kernel CLI:

```sh
ns dispatch prompt "Rename the widget gateway methods to match the command-shape convention"
```

Dispatch derives the anchor's semantic slug from the prompt. For automation or
when model-backed naming is unavailable, override only that portion explicitly:

```sh
ns dispatch prompt --slug rename-widget-gateway-methods "Rename the widget gateway methods to match the command-shape convention"
```

A thin Pi slash-command mirror remains planned.

Or dispatch a plan:

```
/ns:dispatch:plan
```

The CLI reports each local setup phase while it checks the exact source, publishes it
when needed, opens the anchor, and starts the workflow, then prints clickable links to
both the anchor PR and the Vercel Workflow run. A new branch is pushed and a pull
request opens for it — that PR is the job's anchor from before the work starts. Then keep
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
- **Watch everything in flight from one place (planned).** The committed
  product direction is a dispatch jobs TUI showing what's running, landed,
  or failed across sessions; implementation remains roadmap work.

## Commands

### `ns dispatch prompt`

Dispatches a raw prompt as the unit of work. The remote agent receives the
prompt and the repository at your branch head (see "What the remote agent
sees"). By default the prompt also supplies the content used to derive the
anchor's semantic slug. `--slug/-s <slug>` bypasses model generation; the
`dispatch/` prefix, configured-timezone timestamp, and collision suffix remain
automatic.

### `/ns:dispatch:plan` (planned)

This command remains roadmap work. It will dispatch a plan doc as the unit of work. The remote agent executes the
plan the way a local implementing session would.

The planned no-argument Pi surface will dispatch the most recent plan from
your session; an explicit plan reference will select something else.
Latest-plan resolution will remain Pi session sugar, while the underlying
`ns dispatch plan` CLI will require an explicit plan reference.

### `/ns:dispatch:session` (planned)

This command remains roadmap work. It will continue your current session remotely. Where `prompt` and `plan` send a
discrete unit of work, `session` sends *the work you're in the middle of*:
it captures the session's working context as a handoff and dispatches a
remote agent to pick it up and keep going — as if the session itself moved
to the cloud while you go do something else. Results come back the same as
any dispatch: branch and open PR.

The same clean-tree rule applies as for any dispatch: check in a checkpoint
commit of where you are (`/ns:flow:cp`) and push — the branch carries the
code state, the handoff carries the session context.

The planned implementation uses handoff machinery with a predefined
continuation prompt. Its kernel command will be
`ns dispatch handoff <ref>` with an explicit handoff reference; capturing
the *current* session will be Pi sugar.

### What the remote agent sees

The remote agent checks out **the exact published head of your current branch**. If
origin already has that SHA, dispatch performs no source publication and asks for no
extra authorization. Otherwise it plans against structured Graphite metadata. A
definitively untracked branch is pushed by captured SHA with ordinary non-force Git. A
tracked branch previews the current/downstack scope and may restack local history and
update its pull requests through Flow; a TTY asks for confirmation, while a
non-interactive caller passes `--force/-f` to authorize that computed scope. Dispatch
never forwards this flag as Graphite `--force`, and ambiguous metadata fails closed.
After either publication path it rechecks repository, branch, HEAD, cleanliness,
configuration/identity preflight, and the remote tip. Graphite may produce a new SHA;
plain Git may not. Only the refreshed, verified SHA reaches the anchor and sandbox.

Your tree must be clean: dispatch refuses to send anything while you have uncommitted
changes, listing the dirty files, so what runs remotely is never silently missing your
edits. Commit (or stash) and dispatch again.

### Repo scope

Dispatch operates on the repository you run it from: results land on this
repo's remote. There is no cross-repo dispatch — like every other ns
capability, dispatch is repo-local.

### The dispatch jobs TUI (planned)

The committed product direction is a terminal UI listing every outstanding dispatch job —
running, landed, or failed — each with its anchor PR, and failed ones with
the failure reason and access to the run's logs. This is how you answer
"what did I send away, and is it done?" from the terminal instead of a
browser tab. The TUI enumerates the `dispatch/` anchor PRs and follows each
one's stamped workflow run id into Vercel's own run observability for live
state and logs. (Command name: see Open questions.)

### Under the hood

The implemented `ns dispatch prompt` kernel CLI is the first command in the
planned `ns dispatch plan|prompt|handoff` family. Pi sugar and portable wrapper
skills for the remaining commands are roadmap work. That
command portability is separate from the harness running remotely: the
implemented in-sandbox registry currently contains only `pi`, and
`harness = "claude-code"` is rejected until the planned Claude Code row has a
complete provisioning and launch recipe. Pi is the first-documented and
currently implemented cloud harness, not a privileged command surface.

There is no per-dispatch backend, harness, or model choice — you dispatch
work, not runtimes. Cloud dispatch is Vercel-native: every dispatch —
interactive or scheduled — is a **Vercel Workflow run** that durably
supervises the job from start to finish. The workflow creates an isolated
Vercel Sandbox with a fresh checkout of your repository, launches the
configured agent harness as a process inside it, watches the run while
your session gets on with other things, and lands the results through git
when it finishes — so a run can take hours, and a crash anywhere still
gets reported on the anchor PR. Which agent harness runs inside the
sandbox is preconfigured in the repository (see "Setup").

## The anchor PR

Every dispatch opens its pull request **up front**, before the job is submitted: a
new `dispatch/`-prefixed branch starts from the verified published commit, adds one
metadata-only initialization commit so GitHub can open the otherwise empty PR, and
opens that PR immediately. The PR is the job's anchor — one durable, linkable place
where the dispatch is observable from the moment it exists.

The anchor branch is named `dispatch/<semantic-slug>-<YYYYMMDD-HHmmss>`: the slug
comes from the dispatched content unless `--slug/-s` overrides it, and the timestamp
uses the repository's configured IANA timezone (default
`America/Los_Angeles`). Semantic slug derivation is read-only and may happen while
source publication is being prepared. Source publication and its complete revalidation
finish before dispatch reads the clock, constructs timestamped candidates, checks
remote-name availability, or mutates an anchor. If the exact name exists, dispatch
tries `-2`, `-3`, and so on through a bounded 50-name sequence. Naming or availability
failure reports the source-publication state honestly and starts no anchor PR or run;
there is no misleading source/random fallback.

The selected branch starts from the refreshed exact commit, with the PR based on the
same source branch so the metadata-only initialization has no file diff and the PR
shows only what the run produces. A concurrent dispatch can still claim the selected
name after the availability check; in that race the existing anchor-push failure path
reports the failed push and does not overwrite or reuse another anchor. At submission the PR is stamped with the run's
handle — the supervising workflow's run id, written as a marked line in the
PR description — so anything (you, the jobs TUI) can get from the PR to the
run's state and logs later — the anchor PR is the durable record, not a
local ledger or a cloud console.

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

When a run fails, its anchor PR stays open and is **marked failed**. The
Workflow failure card, durable status stream, and idempotent PR comment share
one bounded, sanitized diagnostic naming the failed operation and safe vendor
facts, plus the Workflow run pointer. Raw errors, responses, headers, bodies,
and dispatched content are never published. This is locally implemented and
awaits production verification. The jobs TUI will show the same failure state,
so nothing fails silently in either place.

## Scheduled cloud work

Scheduled jobs trigger the same dispatch workflow: recurring ns work that
dispatches on a schedule instead of from a session, landing exactly what an
interactive dispatch lands — an anchor PR per unit of work. Examples:

- **Nightly objective advancement** — each night, select qualifying open
  objectives and dispatch work to advance them, so your morning starts with
  a PR queue, one anchor PR per advanced objective, ready for review.
- **Automated smart rebases** — keep outstanding branches current over a
  moving trunk, dispatching an agent to resolve merge conflicts as they
  appear instead of letting branches rot.

Scheduled jobs never merge or land anything on their own: every PR a job
opens waits for human review. A schedule only decides *when* a dispatch
starts — every scheduled unit runs through the identical
workflow-supervised execution as an interactive dispatch.

## Setup

Non-secret repo configuration lives in the repo-root `ns.toml`, in a typed
`[dispatch]` table: which implemented agent harness runs inside the sandbox
(currently only `pi`), the stable Vercel project/team IDs, the project's Vercel
Workflows dashboard URL, the dispatch deployable's stable HTTPS URL (the deployment recorded in step 3 below) that
the CLI's trigger/observe calls target, and the IANA timezone used in semantic
anchor timestamps. The timezone is optional for existing repositories and
defaults to `America/Los_Angeles`, but explicit configuration keeps the shared
civil-time convention visible. It's versioned with the repo, so
every clone dispatches the same way:

```toml
[dispatch]
harness = "pi"
vercel_project_id = "prj_..."
vercel_team_id = "team_..."
workflow_dashboard_url = "https://vercel.com/<team>/<project>/workflows"
deployment_url = "https://<dispatch-host>"
anchor_timezone = "America/Los_Angeles"
```

`anchor_timezone` accepts any IANA timezone recognized by the Node runtime and
is canonicalized during config parsing.

The checkout must also declare an exact stable pnpm version at
`ts/package.json#packageManager`, for example `"packageManager": "pnpm@11.8.0"`.
Ranges, tags, prereleases, integrity suffixes, other package managers, and
whitespace variants are invalid. Local preflight validates this declaration
before any push or PR, while remote launch independently re-reads it from the
exact sandbox checkout and provisions that version with
`npm install --global pnpm@<version>`.

Credentials are configured once, on the Vercel project that backs cloud
dispatch, using Vercel's own secrets infrastructure:

- **Model keys** live as sensitive environment variables on the dispatch
  project — encrypted at rest, write-only after creation. Each complete
  harness registry entry declares the names it needs; the current Pi recipe
  receives `ANTHROPIC_API_KEY`. A run receives only the key required by its
  configured harness.
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
  `NS_DISPATCH_GITHUB_APP_INSTALLATION_ID`. Tokens are minted by the
  supervising dispatch workflow itself, in-process on the deployable where
  the key lives — no minting credential exists outside it. Anchor-PR
  activity from remote runs attributes to `ns-dispatch[bot]`.
- **Executor auth** is Vercel OIDC federation: Vercel-hosted compute gets a
  short-lived token injected automatically, and dispatching from your own
  machine uses the development token from `vercel link` + `vercel env pull`.
- **Your own machine keeps using its own credentials.** Any local source publication,
  the up-front anchor push, and PR open ride the git/Graphite/gh auth already on your
  machine; minted tokens are for the remote side, where no human credential exists.

Sandboxes are secret-free by default: each run receives only the credentials
it needs, injected at sandbox creation — and the git credential is phased:
a clone-scoped token at start, no token while the agent works, and a fresh
short-lived landing token minted by the supervising workflow only when the
run is ready to land — injected into the single landing command, never
into the sandbox environment. Dispatch preflights credentials and reports
exactly what is missing before any remote work starts: the `[dispatch]`
table is present and valid with a registry-supported harness (currently
`pi`), `workflow_dashboard_url`, `deployment_url`, and a valid/defaulted
`anchor_timezone`; `ts/package.json#packageManager` is an exact
supported pnpm declaration; the Development OIDC token is available by name
(`VERCEL_OIDC_TOKEN` from the package's pulled `.env.local`); and a read-only
authenticated run-status probe against the deployment confirms the caller's
identity is accepted. Each failure is a named, actionable category, and no
secret value is ever read into output. This preflight passed against production
deployment `dpl_He9jnMkZmH7fTYg9K3DcHp1mKbds` before the first completed prompt
dispatch on 2026-07-14.

### Mint endpoint configuration

The dispatch deployable's `POST /api/mint` endpoint serves the Development
clone probe. It authenticates only the dispatch-owned Development OIDC
header and can mint only clone credentials. The endpoint composes the GitHub
App/repository variables with the OIDC trust variables below. The dispatch
workflow calls the same mint core in-process but reads only the GitHub App
and repository slice; trigger and run-status routes read only the OIDC trust
slice.

| Variable                                 | Sensitivity | Purpose                                                        |
| ---------------------------------------- | ----------- | -------------------------------------------------------------- |
| `NS_DISPATCH_GITHUB_APP_ID`              | Non-secret  | GitHub App identifier                                          |
| `NS_DISPATCH_GITHUB_APP_INSTALLATION_ID` | Non-secret  | Installation restricted to the configured repository           |
| `NS_DISPATCH_GITHUB_APP_PRIVATE_KEY`     | Sensitive   | Signs GitHub App authentication; never pull to a dev machine   |
| `NS_DISPATCH_GITHUB_REPOSITORY`          | Non-secret  | Exact authorized `owner/repo`; also needed in Development      |
| `NS_DISPATCH_VERCEL_TEAM_ID`             | Non-secret  | Required development-token `owner_id`                          |
| `NS_DISPATCH_VERCEL_PROJECT_ID`          | Non-secret  | Required development-token `project_id`                        |
| `NS_DISPATCH_VERCEL_OIDC_ISSUER`         | Non-secret  | Exact trusted issuer used for signature and claim verification |
| `NS_DISPATCH_VERCEL_OIDC_AUDIENCE`       | Non-secret  | Exact trusted audience                                         |

The legacy deployed `NS_DISPATCH_SANDBOX_MINT_SECRET` variable is deliberately
absent from this required table: no source or runtime parser consumes it. It
remained inert through the first completed live dispatch and awaits removal
through the human-only environment cleanup.

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

The Vercel project's Root Directory is
`ts/packages/capabilities/vercel`, making the capability package itself the
Vercel deployable. Link that package directory for project-local build and
environment commands, but deploy from the repository root so Vercel applies the
configured monorepo Root Directory exactly once. The proven setup sequence is:

1. Set the Vercel project's Root Directory to
   `ts/packages/capabilities/vercel` and retain "Include source files outside of
   the Root Directory." From the repository root, run `just dispatch-setup-local` to
   link that package directory to the `ns-dispatch` project and refresh its ignored
   Development environment without accepting the Vercel CLI's broad `.env*` ignore rule.
2. Configure the endpoint variables above. Keep the private key sensitive;
   make `NS_DISPATCH_GITHUB_REPOSITORY` available to the Development
   environment so the local probe can read it. Do not add a landing mint
   secret for new setup. If the legacy variable is already deployed, leave it
   untouched pending human cleanup; the current code and first live dispatch
   ignore it.
3. From a clean repository root, run the canonical production deployment command:

   ```sh
   just dispatch-deploy-prod
   ```

   It refuses tracked or untracked changes so its reported commit SHA remains truthful, runs
   the package's local `build:deployable` gate, validates linked project identity,
   transactionally promotes a complete verified Build Output to the repository deployment
   boundary, deploys the prebuilt output, and verifies the stable alias identifies the returned
   immutable deployment. Success stdout is one JSON object; progress is stderr. Deployment or
   alias failure retains the promoted output for diagnosis and an ambiguous upload is inspected
   before retry rather than automatically duplicated. This command is implemented locally; no
   newer live deployment is claimed here until an operator runs it and records evidence.

   Package-root link/environment/build operations remain distinct from the repository-root
   prebuilt deployment boundary. For an optional read-only public check afterward, run
   `just dispatch-verify-prod-health`. Authenticated preflight and Workflow/Sandbox probes remain
   separate actions.
4. Refresh the ignored package-local file when needed with
   `just dispatch-setup-local`. This file supplies `VERCEL_OIDC_TOKEN` and is ignored by
   git. Decode only the non-secret claims;
   never print or record the token, and do not guess issuer/audience from URL
   conventions. Keep the ignore rule specific to `.env.local` if the CLI tries
   to append a broader `.env*` rule that would hide intentional env templates.
5. Choose a 40-character commit SHA that is reachable from the GitHub remote; a
   local-only HEAD cannot be cloned by the Sandbox. Invoke the development-only
   fixed probe from the package directory:

   ```sh
   pnpm dev:sandbox-hello-probe https://<dispatch-host>/api/mint <40-character-commit-sha>
   ```

The probe carries the caller's Development OIDC token on the private
`x-ns-dispatch-oidc-token` header. Do not use Vercel's reserved
`x-vercel-oidc-token` header for this hop: Vercel replaces it with the executing
production Function's workload identity before the handler runs.

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
  `NS_DISPATCH_GITHUB_REPOSITORY` in the package-root `.env.local`;
- invalid or missing repo-root `[dispatch]` project/team IDs;
- `401 unauthorized` from missing, malformed, or failed OIDC authentication;
- `403 forbidden` from issuer/audience-adjacent identity policy, wrong
  team/project/environment, wrong purpose, or repository mismatch;
- `500 mint-endpoint-misconfigured` naming only the invalid variable;
- `502 github-token-mint-failed` when App installation, repository scope, or
  requested permissions do not permit the narrow token;
- safe Sandbox create, command, output, revision, or cleanup failures without
  vendor request details or credential values.

The command shape, fake-driven behavior, deployment boundary, Development-token
trust check, and one controlled billable private-repository Sandbox probe are
verified. The workflow-supervisor architecture retired the formerly recorded
shared landing secret and self-landing sandbox shortcuts on 2026-07-13, and
the implementation now matches that design: the HTTP shared-secret landing
path is removed, the endpoint is OIDC-only and clone-only, the supervising
workflow mints landing credentials in-process, and no push-capable credential
enters the sandbox environment. Dispatch run
`wrun_01KXFZ14SBRCGTSPP5PEH19C3T` completed and landed one proof file plus its
decision log on <https://github.com/nseng-ai/ns/pull/3612>. The supervisor's
fallback commit path was required because the first live Pi host had not bound
extension session lifecycle and could not execute Bash; normal agent-side
command, commit, and subagent behavior remains pending one controlled rerun.
See `dispatch-live-evidence.md` for the exact evidence and
`dispatch-pi-runner.md` for the remaining harness verification.

## Open questions

Unsettled decisions, visible here on purpose:

- **Dispatch jobs TUI shape.** The TUI is committed as product direction but
  not implemented; its status plumbing is settled: it enumerates `dispatch/` anchor PRs and follows
  each PR's stamped run handle into Vercel's run observability for state
  and logs. Open: the TUI's command name and whether any push-style
  notification exists beyond the TUI and the anchor PR.
- **Nightly advancement policy.** Which objectives qualify for autonomous
  overnight advancement, what an objective must declare (e.g. a
  `## Runner Policy` section) to opt in, and what the review loop over
  produced branches looks like — including what ref scheduled runs dispatch
  from, since a job has no "current branch" (trunk, presumably).
  (Deliberately deferred to the durable-jobs roadmap row.)
