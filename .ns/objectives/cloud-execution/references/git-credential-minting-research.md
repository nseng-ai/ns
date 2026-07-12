# Git credential minting for cloud dispatch — research findings

Research date: 2026-07-12. Informs the open question in
`references/README-draft.md` ("Git credential minting"): fine-grained PAT vs.
GitHub App installation token (vs. anything else) for minting short-lived,
repo-scoped git credentials per dispatch run. This note makes the trade-off
legible; it does not make the decision. Every claim is cited; anything not
verified against a primary source is marked UNVERIFIED.

## Summary — the load-bearing facts

1. **Fine-grained PATs cannot be created programmatically.** GitHub exposes no
   REST or GraphQL API to mint a PAT of either kind; creation is web-UI only
   ([managing PATs][pat-docs], confirmed by GitHub staff in
   [community discussion #120437][pat-discussion]). *Per-run minting with
   fine-grained PATs is therefore impossible.* A PAT can only be a
   pre-provisioned, standing credential — and its minimum lifetime is 1 day,
   far longer than any run.
2. **GitHub App installation tokens are exactly the per-run-minting shape.**
   `POST /app/installations/{id}/access_tokens`, authenticated by a JWT signed
   with the app's private key, returns a token that expires in 1 hour and can
   be scoped *at mint time* to specific repositories and a permission subset
   ([REST reference][iat-endpoint]). It works as a git HTTPS password
   (`https://x-access-token:TOKEN@github.com/owner/repo.git`) and for PR
   create/comment via REST ([installation auth guide][iat-auth],
   [app permissions reference][app-perms]).
3. **The App's private key becomes the root secret.** It never expires and
   must be revoked manually; a holder can mint installation tokens for
   anything the app is installed on ([private key docs][app-keys]). On the
   dispatch project it would live as a Vercel **sensitive env var** —
   non-readable once created, redacted in build logs, and *unavailable to the
   Development environment*, so `vercel env pull` cannot exfiltrate it to dev
   machines ([sensitive env vars][sensitive-env]).
4. **No native OIDC path to GitHub credentials exists.** GitHub's OIDC support
   makes GitHub the *issuer* for Actions workflows; GitHub does not consume
   external OIDC tokens to issue its own credentials
   ([GitHub OIDC concepts][gh-oidc]). Vercel OIDC federation targets AWS, GCP,
   Azure, and *your own API* — not GitHub ([Vercel OIDC][vercel-oidc]).
   Third-party "OIDC federation" brokers (e.g.
   [gardener/github-oidc-federation][gardener]) are just services that hold a
   GitHub App private key and mint installation tokens after verifying an OIDC
   token — i.e. the GitHub App mechanism with a broker in front.
5. **TTL vs. run duration is a real design constraint.** Sandbox default
   timeout is 5 minutes, extendable up to 24 hours on Pro/Enterprise
   ([sandbox pricing/limits][sandbox-pricing]). A 1-hour installation token
   minted at dispatch time expires mid-run for any run over ~1 hour; the
   end-of-run push/PR-update needs either a token minted late by the
   supervising side or a re-injection path (see "TTL fit" below). A PAT never
   has this problem — but only because it is a standing credential.
6. **Consequence:** if the credential is to be *minted per run and scoped per
   run*, the GitHub App installation token is the only mechanism GitHub
   offers. The fine-grained PAT is only viable as a pre-provisioned standing
   secret in a sensitive env var — precisely the "long-lived token sitting in
   an env var" the README's settled credentials story rules out.

## Mechanism 1: Fine-grained personal access tokens

- **Lifetime:** an integer between 1 and 366 days, or non-expiring; default
  30 days. Org/enterprise maximum-lifetime policies can cap this
  ([managing PATs][pat-docs]). There is **no sub-day lifetime**.
- **Programmatic minting: not available.** Creation is exclusively via the
  web UI (`Settings → Developer settings → Fine-grained tokens → Generate new
  token`) ([creating a PAT][pat-create]). GitHub confirms there is no API to
  create or delete PATs and recommends GitHub Apps for dynamic token
  generation ([community discussion #120437][pat-discussion]).
- **Scoping:** per-owner (one user or org), restrictable to specific
  repositories, with granular permissions ([managing PATs][pat-docs]).
- **Permissions for this workload:** Contents write (clone/push, create ref),
  Pull requests write (create PR), Issues write (PR comments go through
  `POST /repos/{owner}/{repo}/issues/{n}/comments`)
  ([fine-grained PAT permissions][pat-perms]).
- **Org gate:** organizations can require approval of fine-grained PATs that
  touch org resources; the token sits in `pending` until approved
  ([managing PATs][pat-docs]).
- **Git shape:** ordinary HTTPS basic auth — the token is entered/embedded as
  the password ([creating a PAT][pat-create]).
- **Identity/attribution:** tied to the creating user; PRs and comments appear
  as that user. Token dies if the user loses repo access
  ([managing PATs][pat-docs]).
- **Rate limits:** the user's personal 5,000 requests/hour, shared with
  everything else authenticating as that user ([rate limits][rate-limits]).
- **Revocation:** manual deletion in the UI; no documented self-serve API
  revocation flow in the pages reviewed (UNVERIFIED whether the
  credential-revocation API accepts fine-grained PATs).

## Mechanism 2: GitHub App installation access tokens

- **Mint path:** sign a short-lived JWT with the app's private key, then
  `POST /app/installations/{installation_id}/access_tokens` with the JWT in
  the `Authorization` header ([installation auth guide][iat-auth],
  [REST reference][iat-endpoint]).
- **TTL:** "Installation tokens expire one hour from the time you create
  them"; expired tokens return 401 ([REST reference][iat-endpoint]).
- **Mint-time scoping:** request-body `repositories` / `repository_ids`
  (up to 500) narrows the token to specific repos; `permissions` narrows to a
  subset of the app's granted permissions. Defaults to everything the
  installation can access ([REST reference][iat-endpoint]). For dispatch:
  one repo + `contents: write`, `pull_requests: write`, `issues: write`.
- **Permissions for this workload** (installation-token column verified):
  Contents write for `POST /git/refs` and push, Pull requests write for
  `POST /pulls`, Issues write for `POST /issues/{n}/comments`
  ([app permissions reference][app-perms]). The fine-grained-PAT reference
  lists the comments endpoint under both Issues and Pull requests
  ([pat-perms]); minting both write permissions is the safe reading.
- **Git shape:** HTTPS with the token as password and literal username
  `x-access-token`: `git clone
  https://x-access-token:TOKEN@github.com/owner/repo.git`; requires the
  Contents permission ([installation auth guide][iat-auth]). Maps directly
  onto Vercel Sandbox's git source (`source: { type: 'git', url, username,
  password }`) or a plain env-var-driven clone.
- **One-time setup burden:** register the app (org- or user-owned), generate
  a private key, install the app on the org/account choosing **All
  repositories** or **Only select repositories**; installation requires
  owning the target account (org owners for orgs)
  ([installing your own app][app-install]). Adding a new repo later is an
  installation-settings edit, not a new secret.
- **Private key custody:** keys never expire and must be manually revoked; a
  holder can authenticate as the app and mint tokens for any installation; up
  to 25 keys can coexist, enabling rotation (add new, delete old); GitHub
  recommends a vault, with env vars as the acceptable lesser option
  ([private key docs][app-keys]). In this design: a **sensitive** env var on
  the dispatch Vercel project (see Vercel section).
- **Rate limits:** installations get a minimum 5,000 requests/hour (15,000 on
  GitHub Enterprise Cloud orgs); +50/hour per repo beyond 20 repos and per
  user beyond 20 users, capped at 12,500/hour. Crucially this budget is *the
  installation's own*, not shared with any human user's PAT traffic
  ([rate limits][rate-limits]).
- **Revocation:** tokens self-destruct in 1 hour; `DELETE /installation/token`
  revokes one immediately (authenticated with the token itself)
  ([revoke endpoint][iat-revoke]). The private key is revocable in app
  settings ([private key docs][app-keys]).
- **Identity/attribution:** work appears as the app's bot identity — a
  legible marker that a PR/comment came from dispatch rather than a person.
  (Attribution shape itself: standard GitHub App behavior; specific
  `bot`-login rendering UNVERIFIED against a doc page.)

## Mechanism 3: OIDC-based exchange — not natively available

- **GitHub as OIDC issuer only, and only in Actions.** GitHub's OIDC provider
  auto-generates tokens *for workflow jobs* to present to cloud providers;
  the docs describe no consumption of external OIDC tokens and no OIDC
  surface outside Actions ([GitHub OIDC concepts][gh-oidc]). So a Vercel
  workload cannot exchange its `VERCEL_OIDC_TOKEN` for GitHub credentials
  natively.
- **GitHub Actions' `GITHUB_TOKEN`** is itself an installation token for the
  Actions app, minted per job — unavailable outside Actions runners
  (well-known; primary-source citation not pulled for this note — the
  mechanism is irrelevant here since dispatch does not run on Actions).
- **Third-party brokers exist but reduce to Mechanism 2.** E.g.
  [gardener/github-oidc-federation][gardener] runs a token server holding a
  central GitHub App's `app_id` + `private_key`; callers present an OIDC
  identity token and receive a short-lived GitHub token scoped by an
  in-repo policy file. Chainguard's octo-sts is the same pattern
  (UNVERIFIED — not fetched). Adopting one would add a deployed broker
  service while keeping the App private key as the root secret — strictly
  more moving parts than minting directly in the dispatch control plane.
  Note that Vercel OIDC *can* authenticate to "your own API"
  ([Vercel OIDC][vercel-oidc]), so a self-hosted broker is *possible* — it
  is just not simpler than direct minting from the same trust base.

## Vercel infrastructure facts

Vercel Sandbox/Workflows surfaces move quickly; doc `last_updated` stamps are
noted where the docs carry them.

### Sensitive environment variables (doc updated 2026-06-03)

- Values are "non-readable once created"; Vercel stores them in an
  unreadable format. Editing allows setting a *new* value; the current value
  stays hidden. Key rename is not allowed ([sensitive env vars][sensitive-env]).
- Only **production and preview** environments can hold sensitive variables —
  the Development environment cannot. Since `vercel env pull` downloads the
  *Development* environment, a sensitive production secret (the App private
  key, model keys) never lands in a developer's `.env.local`
  ([sensitive env vars][sensitive-env], [env vars overview][env-vars]).
- Runtime code can still read them: environment variables generally are
  "encrypted at rest" and readable "during the Build Step or during Function
  execution" ([env vars overview][env-vars]) — sensitivity removes
  *dashboard/API read-back*, not runtime availability.
- Build logs redact sensitive values ≥32 chars (and always
  `VERCEL_OIDC_TOKEN`); redactions are activity-logged
  ([sensitive env vars][sensitive-env]).
- Size budget: 64 KB total per deployment — ample for a PEM private key
  ([env vars overview][env-vars]).
- Creatable via dashboard, REST (`POST /v10/projects/{id}/env` with
  `"type": "sensitive"`), or `@vercel/sdk` ([sensitive env vars][sensitive-env]).

### Vercel OIDC federation (doc updated 2026-06-16)

- Vercel's IdP issues short-lived tokens; issuer mode is team
  (`https://oidc.vercel.com/acme`) or global ([Vercel OIDC][vercel-oidc]).
- **In builds:** fresh token in `VERCEL_OIDC_TOKEN`. **In functions:** token
  arrives on the `x-vercel-oidc-token` request header; TTL is 60 minutes,
  cached at most 45 minutes so it outlives a function's max execution
  ([Vercel OIDC][vercel-oidc]).
- **Local development:** `vercel link` + `vercel env pull` writes
  `VERCEL_OIDC_TOKEN` into `.env.local`; the development token **expires
  after 12 hours** — re-run `vercel env pull` to refresh
  ([sandbox authentication][sandbox-auth], [Vercel OIDC][vercel-oidc]).
- Documented consumers: AWS, GCP, Azure, and your own API — this is the
  executor-auth story (authenticating to *Vercel Sandbox itself* and to
  self-hosted backends), not a git-credential source
  ([Vercel OIDC][vercel-oidc]).

### Vercel Sandbox (docs updated 2026-05/06)

- **Credential injection at creation:** `Sandbox.create()` takes `env:
  Record<string, string>` (defaults for all commands; per-command
  `runCommand({ env })` overrides) and a git source `source: { type: 'git',
  url, username, password, depth?, revision? }` — so a minted token can ride
  in as the git password and/or an env var
  ([JS SDK reference][sandbox-sdk]). `Sandbox.fork()` explicitly does *not*
  copy `env` (encrypted server-side) ([sandbox-sdk]).
- **Duration:** default timeout 5 minutes; extendable via `timeout` /
  `sandbox.extendTimeout()` up to **45 minutes (Hobby)** or **24 hours
  (Pro/Enterprise)** ([sandbox pricing/limits][sandbox-pricing]).
- **Auth to Sandbox:** OIDC token (automatic on Vercel; 12-hour dev token via
  `vercel link` + `vercel env pull` locally) or a Vercel access token +
  team/project IDs for non-Vercel environments
  ([sandbox authentication][sandbox-auth]).
- **Egress:** Firecracker microVM with its own network; `networkPolicy`
  defaults to `allow-all`, supports `deny-all` and rule-based policies
  including `forwardURL` proxying where the proxy verifies a Vercel-issued
  OIDC token per request ([Vercel Sandbox][sandbox-docs],
  [JS SDK reference][sandbox-sdk]). A locked-down policy allowing only
  `github.com` + model endpoints is available if wanted.
- Sandboxes only run in `iad1` currently ([sandbox pricing/limits][sandbox-pricing]).

### Vercel Workflows + cron (docs updated 2026-06-17)

- Workflows execute on **Vercel Functions** with Queues and managed
  persistence ([Vercel Workflows][workflows]) — so workflow code sees project
  environment variables (including sensitive ones) like any function
  ([env vars overview][env-vars]), and functions receive the OIDC token
  header ([Vercel OIDC][vercel-oidc]). A scheduled job can therefore read the
  App private key from a sensitive env var and mint per-run tokens with no
  extra machinery.
- **No native workflow cron yet:** scheduling is Vercel Cron Jobs — an HTTP
  GET to a production-deployment path on a `vercel.json`-declared schedule
  ([cron jobs][cron]) — whose handler starts the workflow. Native cron
  support in the Workflow SDK is an open feature request
  ([vercel/workflow discussion #66][wf-cron-discussion]).

## TTL fit: 1-hour tokens vs. runs up to 24 hours

The run needs git credentials at two moments: clone (start) and push +
PR-update (end). A token minted at dispatch covers both only for runs under
~1 hour. For longer runs, options consistent with "the private key never
enters the sandbox":

- **Late re-injection:** the supervising side (dispatch CLI or workflow)
  re-mints and delivers a fresh token — e.g. `Sandbox.get()` +
  `runCommand({ env })` passes per-command env without baking a new default
  ([JS SDK reference][sandbox-sdk]). Requires a supervisor alive at
  completion time.
- **Two-phase runs:** clone with token A; when the agent finishes, a
  completion step outside the sandbox (workflow step, or the anchor-PR
  failure-comment path) performs the push/comment with a freshly minted
  token B.
- **Credential-helper callback:** an in-sandbox git credential helper that
  calls back to a dispatch endpoint (authenticated via the sandbox-held
  Vercel OIDC token, verifiable per the `forwardURL` proxy pattern) to fetch
  a fresh token on demand ([sandbox-sdk], [vercel-oidc]). Most flexible;
  most machinery.

A pre-provisioned fine-grained PAT sidesteps this entirely — by being a
standing secret with ≥1-day lifetime, which is the posture being avoided.

## Comparison table

| Dimension                  | Fine-grained PAT                                          | GitHub App installation token                                                                   | OIDC exchange                                                        |
| -------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| One-time setup             | Human creates token in UI; org approval possibly required | Register app, generate private key, install on org/account (owner action)                       | Not natively available; broker = App setup + deployed broker service |
| Per-repo setup             | New/edited token per repo-set change (UI, human)          | Edit installation's repo selection; token scoping is per-mint                                   | Broker policy file per repo (gardener pattern)                       |
| Mint path per run          | **None — no API exists**                                  | JWT (private key) → `POST /app/installations/{id}/access_tokens`                                | Broker call with OIDC token                                          |
| TTL                        | 1–366 days or non-expiring; min 1 day                     | Fixed 1 hour                                                                                    | Broker-issued = installation token, 1 hour                           |
| TTL vs. 24 h max sandbox   | Never expires mid-run (because long-lived)                | Expires mid-run for >1 h runs; needs late-mint/re-inject design                                 | Same as installation token                                           |
| Scoping granularity        | Repos + permissions, fixed at creation                    | Repos (≤500) + permissions, chosen *at each mint*                                               | Whatever broker policy allows                                        |
| Root secret custody        | The PAT itself, standing, in a sensitive env var          | App private key (non-expiring) in a sensitive env var; tokens ephemeral                         | App private key held by broker                                       |
| Revocation/rotation        | Manual UI delete; rotation is manual re-issue             | Token: auto 1 h + `DELETE /installation/token`; key: up to 25 keys, add-new-delete-old rotation | Broker key rotation                                                  |
| Rate limits                | User's shared 5,000/h                                     | Installation's own 5,000/h (15,000 GHEC; scales to 12,500 cap)                                  | Installation's                                                       |
| Attribution                | Acts as the human user                                    | Acts as the app (bot identity)                                                                  | Acts as the broker's app                                             |
| Git shape                  | HTTPS, token as password                                  | HTTPS, `x-access-token:TOKEN@github.com`                                                        | Same as installation token                                           |
| PR create/comment via REST | Yes (PR write / Issues write)                             | Yes (PR write / Issues write; endpoints accept installation tokens)                             | Yes                                                                  |

## What is load-bearing for the decision

- **Fine-grained PATs cannot be minted via API** ([pat-docs],
  [pat-discussion]) — this alone eliminates them for *per-run* minting. If
  the README's "short-lived, repo-scoped credentials the executor mints per
  run; no long-lived broad token sits in an env var" sentence is the
  contract, a PAT can satisfy "repo-scoped" but not "short-lived", "minted
  per run", or "no long-lived token in an env var".
- **Installation tokens satisfy every clause of that sentence** — 1-hour TTL,
  minted per run, repo- and permission-scoped at mint time — at the cost of
  one standing root secret (the App private key) plus a one-time app
  registration/installation ceremony.
- **The root secret does not disappear under the App model; it moves.** The
  question becomes "is a non-expiring App private key in a write-only Vercel
  sensitive env var acceptable custody?" Mitigations verified: sensitive vars
  are unreadable post-creation and excluded from the dev environment
  ([sensitive-env]); the key supports rotation (25 concurrent keys)
  ([app-keys]); every minted token is 1-hour and narrowly scoped
  ([iat-endpoint]).
- **No third mechanism exists natively.** OIDC does not reach GitHub
  credentials without a broker that is itself a GitHub App key holder
  ([gh-oidc], [gardener]).
- **The 1-hour TTL vs. 24-hour sandbox ceiling** ([iat-endpoint],
  [sandbox-pricing]) is the one genuine design cost of the App route: runs
  longer than an hour need a late-mint or re-injection path (options above).
- Secondary but real: installation tokens get **their own rate-limit budget**
  and **bot attribution**, while a PAT spends the owning human's 5,000/h and
  impersonates them ([rate-limits]).

## Unverified / open

- Whether GitHub's credential-revocation API accepts fine-grained PATs
  (UNVERIFIED; PAT revocation confirmed only as manual UI deletion).
- Exact bot-login attribution rendering for App-created PRs (standard
  behavior, but not pinned to a doc page in this pass).
- Chainguard octo-sts specifics (pattern inferred from the gardener project;
  octo-sts docs not fetched).
- Vercel Workflows is presented as GA-styled docs (no beta banner in the
  fetched page, updated 2026-06-17), but native cron for workflows is
  explicitly not shipped ([wf-cron-discussion]); Sandbox "Drives" is marked
  beta while Sandbox itself carries no beta banner in the fetched docs.

## Sources

GitHub:

- [Managing your personal access tokens][pat-docs]
- [Creating a personal access token][pat-create]
- [Fine-grained PATs via API? — community discussion #120437][pat-discussion]
- [Permissions required for fine-grained personal access tokens][pat-perms]
- [Create an installation access token for an app (REST)][iat-endpoint]
- [Authenticating as a GitHub App installation][iat-auth]
- [Permissions required for GitHub Apps][app-perms]
- [Managing private keys for GitHub Apps][app-keys]
- [Installing your own GitHub App][app-install]
- [Revoke an installation access token (REST)][iat-revoke]
- [Rate limits for the REST API][rate-limits]
- [OpenID Connect (GitHub Actions concepts)][gh-oidc]
- [gardener/github-oidc-federation][gardener]

Vercel:

- [Sensitive environment variables][sensitive-env] (updated 2026-06-03)
- [Environment variables][env-vars] (updated 2026-06-16)
- [OpenID Connect (OIDC) Federation][vercel-oidc] (updated 2026-06-16)
- [Vercel Sandbox][sandbox-docs] (updated 2026-06-30)
- [Sandbox JS SDK reference][sandbox-sdk] (updated 2026-06-30)
- [Sandbox authentication][sandbox-auth] (updated 2026-05-25)
- [Sandbox pricing and limits][sandbox-pricing] (updated 2026-06-16)
- [Vercel Workflows][workflows] (updated 2026-06-17)
- [Cron Jobs][cron] (updated 2026-06-16)
- [Scheduled workflows? — vercel/workflow discussion #66][wf-cron-discussion]

[pat-docs]: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/managing-your-personal-access-tokens
[pat-create]: https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token
[pat-discussion]: https://github.com/orgs/community/discussions/120437
[pat-perms]: https://docs.github.com/en/rest/authentication/permissions-required-for-fine-grained-personal-access-tokens
[iat-endpoint]: https://docs.github.com/en/rest/apps/apps?apiVersion=2022-11-28#create-an-installation-access-token-for-an-app
[iat-auth]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation
[app-perms]: https://docs.github.com/en/rest/authentication/permissions-required-for-github-apps
[app-keys]: https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps
[app-install]: https://docs.github.com/en/apps/using-github-apps/installing-your-own-github-app
[iat-revoke]: https://docs.github.com/en/rest/apps/installations?apiVersion=2022-11-28
[rate-limits]: https://docs.github.com/en/rest/using-the-rest-api/rate-limits-for-the-rest-api
[gh-oidc]: https://docs.github.com/en/actions/concepts/security/openid-connect
[gardener]: https://github.com/gardener/github-oidc-federation
[sensitive-env]: https://vercel.com/docs/environment-variables/sensitive-environment-variables
[env-vars]: https://vercel.com/docs/environment-variables
[vercel-oidc]: https://vercel.com/docs/oidc
[sandbox-docs]: https://vercel.com/docs/vercel-sandbox
[sandbox-sdk]: https://vercel.com/docs/sandbox/sdk-reference
[sandbox-auth]: https://vercel.com/docs/sandbox/concepts/authentication
[sandbox-pricing]: https://vercel.com/docs/sandbox/pricing
[workflows]: https://vercel.com/docs/workflows
[cron]: https://vercel.com/docs/cron-jobs
[wf-cron-discussion]: https://github.com/vercel/workflow/discussions/66
