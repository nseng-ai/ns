# Dispatch credentials and trust

## Ownership

This living reference owns the current operational contract for Development OIDC, GitHub
App identity, repository scope, token phases, secret custody, rotation, and safe credential
diagnostics.

`credentials-design.md` owns rationale and rejected alternatives. This file owns current
operational truth. Setup order lives in `dispatch-setup-and-preflight.md`; evidence lives in
`dispatch-live-evidence.md`.

## Identities and trust boundaries

### Local dispatcher

The developer's existing git and GitHub credentials are used only to:

- ensure the source revision is remotely reachable;
- initialize and push the `dispatch/` anchor branch;
- open the anchor PR;
- stamp the Workflow run ID.

The local caller authenticates to the production trigger and run-status routes with the
Development OIDC token created or refreshed from the repository root by:

```sh
just dispatch-setup-local
```

The recipe links the package-local Vercel project and pulls its ignored `.env.local` while
preserving the narrow checked-in ignore policy.

The token is read from `VERCEL_OIDC_TOKEN` in the linked package's ignored `.env.local` or
process environment. Its value is never included in output.

### Vercel workload

The production Workflow supervisor holds the GitHub App configuration and mints short-lived
installation tokens in-process. The App private key is the irreducible root secret and
belongs in a Vercel sensitive variable.

### GitHub App

The org-owned App is installed only on the configured repository. Tokens are narrowed by
repository and purpose. GitHub does not provide an API for minting fine-grained PATs; the
App identity is the runtime credential mechanism.

## OIDC contract

Trust is bound to exact:

- issuer;
- audience;
- Vercel team/owner ID;
- Vercel project ID;
- `environment: development`.

Derive these values from an actual Development token's non-secret claims. Do not guess them
from project names or URLs.

### Reserved and caller-owned headers

Vercel reserves `x-vercel-oidc-token` for the executing Function's workload identity. A
caller-supplied Development token on that header was replaced before the handler ran.

The local dispatcher therefore uses:

```text
x-ns-dispatch-oidc-token
```

Do not “fix” a 403 by widening trust to Production. That authenticates the wrong principal
and erases the local-caller boundary.

## Token phases

GitHub App installation tokens expire after roughly one hour while Sandboxes may run much
longer. One token for the entire run is both overprivileged and unreliable.

The execution protocol is:

1. Mint a clone-purpose token with repository-scoped `contents: read`.
2. Pass it directly as the Sandbox git-source password.
3. Do not leave it in the git remote, agent environment, durable files, or logs.
4. Run the agent without a git credential.
5. Mint a fresh landing-purpose token immediately before landing.
6. Inject that token only into the single landing command.
7. Push only the pre-created anchor branch; never the dispatched source branch.

No push-capable credential belongs in the Sandbox environment.

## Environment contract

Current required production names:

| Variable                                 | Sensitivity | Purpose                        |
| ---------------------------------------- | ----------- | ------------------------------ |
| `NS_DISPATCH_GITHUB_APP_ID`              | Non-secret  | App identifier                 |
| `NS_DISPATCH_GITHUB_APP_INSTALLATION_ID` | Non-secret  | Repository installation        |
| `NS_DISPATCH_GITHUB_APP_PRIVATE_KEY`     | Sensitive   | App authentication root secret |
| `NS_DISPATCH_GITHUB_REPOSITORY`          | Non-secret  | Exact authorized `owner/repo`  |
| `NS_DISPATCH_VERCEL_TEAM_ID`             | Non-secret  | Required OIDC owner/team claim |
| `NS_DISPATCH_VERCEL_PROJECT_ID`          | Non-secret  | Required OIDC project claim    |
| `NS_DISPATCH_VERCEL_OIDC_ISSUER`         | Non-secret  | Exact token issuer             |
| `NS_DISPATCH_VERCEL_OIDC_AUDIENCE`       | Non-secret  | Exact token audience           |

`NS_DISPATCH_GITHUB_REPOSITORY` must also be available in Development where the controlled
probe reads repository input.

The deployed `NS_DISPATCH_SANDBOX_MINT_SECRET` is legacy and inert. No current source or
runtime parser consumes it, including the first completed dispatch. Its removal remains a
human-only environment cleanup action.

## Secret custody and rotation

- Existing GitHub App private-key rotation is a GitHub UI action. The App Manifest flow can
  return a PEM during new-App creation; it is not a key-rotation API for an existing App.
- Restrict downloaded PEM material to owner-only access immediately.
- Validate identity and installation scope without printing the key.
- Stream secrets into Vercel; never pass PEM, JWT, installation token, landing token, or
  model key on argv.
- Delete local PEM material and revoke superseded keys only after replacement deployment
  verification.
- Vercel sensitive values cannot be read back or renamed. Create fresh replacement values,
  verify them in parallel, then remove the old names.
- Keep `.env.local` narrowly ignored. `vercel env pull` may try to add `.env*`; do not hide
  intentional environment templates.

Never write secret values to Objective records, README examples, Semantic Updates, PR
bodies, decision logs, setup skills, or error output.

## Safe diagnostics

It is safe to report:

- variable names and environments;
- declared sensitivity;
- App slug/ID and installation ID;
- selected repository;
- requested permission names;
- OIDC issuer/audience/team/project/environment matches;
- HTTP status and classified semantic outcome;
- `clone-token-minted` or equivalent status without the token body.

It is not safe to report:

- PEM contents;
- OIDC JWTs;
- GitHub installation tokens;
- landing credentials;
- model credentials;
- vendor request dumps that may contain any of the above.

Interpret safe failure categories as follows:

- 401: credential missing, malformed, expired, or unverifiable;
- 403: identity verified but team/project/environment/repository/purpose policy failed;
- endpoint misconfiguration: report only the invalid variable name;
- mint failure: inspect App identity, installation, repository selection, and permission
  names without reading the token.

Refresh an expired Development token instead of weakening verification.

## Current verified state

Verified without exposing token values:

- Development OIDC identity accepted by the production dispatch preflight;
- clone-only token minted in-process for private-repository Sandbox checkout;
- exact private SHA checkout succeeded;
- first completed dispatch minted a late landing token and pushed through the App bot
  identity;
- no push-capable credential entered the agent environment.

See `dispatch-live-evidence.md` for locators and bounded claims.

## Open cleanup and hardening

- Remove the inert deployed `NS_DISPATCH_SANDBOX_MINT_SECRET` through the human environment
  process.
- Reduce the App's accepted prototype `actions: write` and `workflows: write` permissions
  before wider deployment.
- Keep setup tooling value-free and stop at human key/permission boundaries.
