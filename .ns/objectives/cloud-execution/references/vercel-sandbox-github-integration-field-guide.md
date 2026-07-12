# Vercel Sandbox and GitHub integration field guide

## Summary

This reference preserves the expensive integration findings from taking a private GitHub
repository through a real Vercel deployment, Development OIDC authentication, GitHub App
installation-token minting, exact-revision Vercel Sandbox checkout, fixed-command
verification, and cleanup. It is intentionally written for two audiences:

1. developers building or debugging this integration; and
2. the future ns setup/preflight tooling that must make the same path safe and repeatable
   for users without exposing the underlying sharp edges.

The canonical README remains the user-facing contract. This reference is the durable field
guide and acceptance checklist from which the reusable setup skill and dispatch preflight
must be distilled after the prompt steel thread.

### Proven architecture

- **One Vercel-native package and project root.** The Vercel project's Root Directory is
  `ts/packages/capabilities/vercel`, not a nested `deployable/` directory. The API
  entrypoints, package manifest, `src/`, `vercel.json`, and deployment scripts must share
  one traceable project boundary. "Include source files outside the Root Directory" remains
  enabled for monorepo installation, but it did not make imports above a nested Function
  root safe by itself.
- **GitHub App, not PAT, is the runtime identity.** GitHub does not expose an API for
  minting fine-grained PATs. The org-owned GitHub App is installed only on the configured
  repository; short-lived installation tokens are minted with repository names and
  permissions narrowed by purpose. The App private key is the irreducible root secret and
  belongs in a Vercel sensitive variable.
- **Git is the state and transport plane.** Local anchor setup uses the developer's existing
  git/GitHub credentials. Remote work uses the App bot identity. A clone token is supplied
  only for checkout, the agent's work phase is tokenless, and a fresh landing token is
  minted only when results are ready to push.
- **Vercel OIDC authenticates the caller to the mint service.** Local Development identity
  comes from `vercel link` plus `vercel env pull`; trust is bound to exact issuer, audience,
  team, project, and `environment: development` claims. There is no native OIDC-to-GitHub
  exchange: successful OIDC authentication authorizes the mint endpoint to use its App key,
  not GitHub directly.
- **Sandboxes are ephemeral checkouts, not cloud slots.** The controlled path creates a
  non-persistent Node 24 Sandbox, shallow-clones an exact remotely reachable SHA, runs a
  fixed marker/HEAD command, compares the observed revision, and stops the Sandbox on every
  post-creation path. A local-only SHA is not a valid checkout target.

### Developer playbook and sharp edges

#### 1. Project root, build, and deployment commands are intentionally split

Project-local operations run from `ts/packages/capabilities/vercel` because that directory
holds `.vercel/project.json`, `.env.local`, `vercel.json`, the package tsconfig, and the
controlled probe:

- `vercel link`;
- `vercel env pull .env.local --environment=development`;
- `pnpm build:deployable`;
- `pnpm dev:sandbox-hello-probe <mint-url> <sha>`.

Production deployment runs from the **repository root** with the existing project named
explicitly, so Vercel applies the configured monorepo Root Directory exactly once. Running
deploy or prebuilt deploy from the package directory caused Vercel CLI to append the
configured Root Directory to the current path and look for a duplicated path. Tooling must
not paper over this by changing directories opportunistically; it must know which command
belongs to which root.

If a deployment CLI call fails after upload with a transport error, first inspect the
returned deployment URL or id. One live attempt reported `EADDRNOTAVAIL` while polling, but
`vercel inspect` showed that the deployment had completed and was Ready. Blind retry can
create duplicate deployments and obscure which artifact owns the production alias.

#### 2. A Ready Vercel deployment is not sufficient build evidence

The first remote build emitted a TypeScript error, completed anyway, and promoted a Function
that crashed at runtime. The initial local build also reported success while its emitted
Function lacked runtime modules. Therefore:

- run the repository's native TypeScript check before the Vercel build;
- scan Vercel build output for TypeScript diagnostics even when the process exits zero;
- inspect the emitted `.vercel/output/functions/...func` artifact, not only source files;
- verify every emitted relative import resolves inside the Function artifact;
- then exercise the deployed health and mint routes before any billable Sandbox creation.

`pnpm build:deployable` now enforces those checks. Vercel's TypeScript pass emitted `.js`
modules while retaining explicit `.ts` import specifiers until
`rewriteRelativeImportExtensions` was enabled. This is a deployment-compiler compatibility
requirement; it does not relax the repository's source import convention.

Rejected debugging paths are worth preserving:

- importing through a package self-export appeared to work only while the generated
  Function could see the developer workspace's ancestor `node_modules`; copying the
  artifact to an isolated directory exposed the missing package;
- multiple `includeFiles` patterns did not place the package-owned TypeScript modules in
  the emitted Function artifact;
- copying source under the nested root made Vercel emit the modules but still left `.ts`
  specifiers pointing at emitted `.js` files;
- enabling outside-root source access did not by itself make the nested Function artifact
  closed.

The fastest deterministic feedback loop was: build locally, inspect the emitted Function
file tree, and test the emitted relative-import graph in isolation. Production logs then
served as corroboration, not the primary debugging loop.

#### 3. Treat `x-vercel-oidc-token` as reserved workload identity

Vercel injects the executing Function's own workload token on the reserved
`x-vercel-oidc-token` header. A caller-supplied Development token on that header was replaced
before the handler ran, so verification succeeded as the production Function and then
failed the `environment: development` policy with a safe 403.

The local caller therefore uses the dispatch-owned `x-ns-dispatch-oidc-token` header. The
mint handler ignores the reserved Vercel header for caller authentication. Tooling must not
"fix" a 403 by broadening the trusted environment to production: that would authorize the
wrong principal and erase the distinction between the local dispatcher and the deployed
mint service.

For safe diagnosis, decode and compare only the non-secret claims `iss`, `aud`, `owner_id`,
`project_id`, `environment`, and expiry. Never print or persist the JWT. Refresh
`.env.local` when the Development token expires instead of weakening verification.

#### 4. Secret handling is an ordered ceremony, not a convenience copy

- Existing GitHub App private-key rotation is a GitHub UI action. The App Manifest flow can
  return a PEM once while creating a new App; it is not a rotation API for an existing App.
- Restrict a downloaded PEM to owner-only access immediately. Validate that it is a private
  key without displaying it, authenticate read-only as the expected App, verify the
  installation/repository scope, stream it into Vercel, then delete it after the replacement
  deployment succeeds.
- Vercel sensitive values cannot be read back or renamed. Namespace changes require fresh
  secret material under the new name, parallel verification, and only then deletion of the
  old variable and revocation of the old key.
- `vercel env pull` may append a broad `.env*` ignore rule. Preserve the repository's narrow
  `.env.local` rule so intentional environment templates remain visible to source control.
- Do not pass a PEM, OIDC token, App token, or landing credential on argv, where process
  listings and shell history can expose it. Do not write secret values into Objective
  updates, README examples, logs, error messages, PR descriptions, or setup-skill artifacts.
- Inventory checks should report names, environments, sensitivity, identity matches, and
  status only. Authenticated mint smoke tests should report status and a semantic result
  such as `clone-token-minted`, never the token body.

#### 5. GitHub token purpose and lifetime shape the execution protocol

GitHub App installation tokens expire after roughly one hour, while a Sandbox can run much
longer. A single token for clone, agent work, and landing is therefore both overprivileged
and unreliable. The protocol must remain phased:

1. mint a clone-purpose token with `contents: read` for the configured repository;
2. pass it directly as the Sandbox git-source password for shallow checkout;
3. do not leave it in the repository remote, agent environment, durable files, or logs;
4. run the agent without a git credential;
5. mint a fresh landing-purpose token immediately before push.

The local machine creates and pushes the anchor branch and opens its PR using the user's own
credentials before remote submission. The Sandbox never pushes to the dispatched source
branch. Later landing must target only the pre-created `dispatch/` anchor branch and use the
App bot identity.

#### 6. Sandbox verification must prove revision and cleanup, not merely creation

A successful `Sandbox.create()` call is insufficient. The controlled probe's acceptance bar
is all of:

- repository input equals the configured `owner/repo`;
- revision is a full 40-character SHA reachable from the GitHub remote;
- mint returns a clone-purpose token for that repository;
- Sandbox is non-persistent, Node 24, shallow, and bounded by a short timeout;
- the only command is the fixed marker plus `git rev-parse HEAD`;
- output shape is exact and the observed SHA equals the request;
- `stop()` succeeds, including after command/output/revision failures.

Sandbox creation is billable. Setup and diagnostic tooling must stop for explicit human
confirmation immediately before the first billable probe. Failed preflight, token minting,
or deployment checks must never create a Sandbox. After a successful controlled probe,
ordinary dispatch can rely on policy established by the command surface, but setup tooling
must not silently turn a verification action into recurring usage.

#### 7. Failure signals should be narrow, safe, and actionable

The implementation deliberately avoids vendor request dumps and credential-bearing errors.
Tooling should preserve these categories and remediation paths:

- missing/invalid repo configuration or full remote SHA — fix locally before network work;
- missing/expired Development token — rerun project link/env pull, never weaken trust;
- 401 — caller credential missing, malformed, or unverifiable;
- 403 — verified identity, repository, environment, or purpose does not satisfy policy;
- endpoint misconfiguration — name only the invalid environment variable;
- GitHub token mint failure — inspect App identity, installation, selected repository, and
  requested permission names without printing tokens;
- Function artifact/import failure — inspect emitted output and runtime logs before touching
  credentials;
- Sandbox create/command/output/revision/cleanup failure — report the phase and safe reason;
- ambiguous deployment transport failure — inspect deployment status before retry;
- cleanup failure — treat the whole probe as failed and surface manual cleanup guidance.

### Requirements for future ns user tooling

The future setup skill and dispatch preflight should automate deterministic checks and stop
at true human/security boundaries. They should not merely replay shell commands from this
session.

#### Setup flow

1. **Discover without guessing:** identify repository root, GitHub `owner/repo`, remote
   reachability, package/project linkage, configured team/project ids, and the typed
   `[dispatch]` settings. Never infer trust URLs from naming conventions.
2. **Explain human GitHub work:** guide App creation or existing-App key rotation through the
   correct GitHub UI/Manifest path; verify App slug/id, installation id, selected repository,
   and minimum permission names read-only.
3. **Configure by name and sensitivity:** create or replace Vercel variables without reading
   secret values; derive issuer/audience and identity ids from an actual Development token's
   non-secret claims.
4. **Preserve filesystem hygiene:** create `.env.local` owner-readable and ignored narrowly;
   detect and remove an accidentally broadened `.env*` ignore only with a precise edit.
5. **Run the package-owned build gate:** native typecheck, Vercel diagnostic scan, and emitted
   Function relative-import closure are prerequisites to deployment.
6. **Deploy from the correct root:** package directory for link/build/env-pull, repository
   root for production deploy under the configured monorepo Root Directory.
7. **Verify in increasing-cost order:** health; safe unauthenticated mint response;
   authenticated mint status without token output; then explicit consent for one billable
   fixed Sandbox probe.
8. **Confirm exact checkout and cleanup:** marker, requested/observed SHA equality, and cleanup
   must all pass before setup is declared successful.
9. **Clean up only after proof:** remove old-prefix variables, revoke superseded App keys, and
   delete downloaded PEM material after the replacement path has succeeded.

#### Dispatch preflight

Before every real dispatch, preflight should fail before anchor creation or remote billing
when any local prerequisite is wrong:

- working tree is dirty;
- current branch/ref is not pushed or its exact commit is not remotely reachable;
- `[dispatch]` configuration is missing or malformed;
- linked Vercel team/project identity differs from repo configuration;
- required environment-variable names are absent from the required environment;
- Development OIDC identity is expired or mismatched where local submission needs it;
- GitHub App/installation/repository scope is wrong;
- package deployment health or mint contract is unavailable.

Preflight must report missing names and mismatched non-secret identities, not values. It must
not mint a token merely to prove one might be mintable unless that is the explicit controlled
probe; read-only App/installation/repository checks should precede any credential mint.

#### Product boundaries and security debt

The current end-to-end prototype deliberately carries three shortcuts:

- one shared Sandbox landing secret instead of a per-run signed landing voucher;
- Sandbox self-landing instead of a Vercel-side supervisor;
- GitHub App `actions: write` and `workflows: write` permissions beyond the runtime minimum.

The setup tool must label these as prototype-only, preserve the named upgrades, and refuse to
present them as the recommended wider-deployment posture. The old-prefix Vercel variables,
superseded App key, and local PEM are migration residue to remove now that replacement
verification succeeded; they are not part of the reusable setup path.

The tool must also preserve deliberate product boundaries: repo-local dispatch only, no
cloud slots, no backend-agnostic abstraction, no Eve chassis, no agent logic in Workflows,
and no merge/land without human review.

### Evidence established by the live probe

The verified chain was:

1. package-root Vercel build and emitted-artifact closure;
2. production deployment at the stable dispatch host;
3. health 200;
4. unauthenticated mint request rejected safely;
5. Development OIDC caller accepted on the dispatch-owned header;
6. clone-only GitHub App installation token minted without outputting it;
7. private `nseng-ai/ns` checkout at exact remote SHA
   `5308b3d45ba520fd530d5a288e3de4ab32914b05`;
8. fixed marker and exact HEAD observed;
9. Sandbox cleanup succeeded.

This evidence proves the integration boundary and setup order. It does not yet prove the
agent harness, anchor-PR landing path, late landing-token flow, dispatch preflight, or the
future setup skill; those remain roadmap work.

## Use by the Objective

The Objective now has a durable two-audience integration field guide rather than relying on
session context, scattered failure logs, or a future agent reconstructing the investigation.
The guide sharpens two existing roadmap obligations without adding a new product surface:

- the Credentials slice must finish cleanup and implement preflight according to the safe,
  increasing-cost checks above; and
- the reusable setup skill must treat this reference as an acceptance checklist while keeping
  the canonical README as its user-facing source of truth.

The setup-skill risk is better controlled: known Vercel/GitHub sharp edges, rejected fixes,
billable-action boundary, secret-handling rules, retry semantics, failure taxonomy, and
prototype security debt are all explicit. The Objective remains open and the roadmap order
is unchanged.

## Follow-Ups

- Remove old-prefix Vercel variables, revoke the superseded GitHub App key, and delete the
  downloaded local PEM after verifying no live configuration references them.
- Implement dispatch preflight in the increasing-cost order above, with tests for safe
  failure categories and no secret-bearing output.
- During the `ns dispatch prompt` steel thread, add evidence for anchor creation, run-handle
  stamping, harness execution, tokenless work, fresh landing-token minting, push to the
  anchor branch, failure comments, and supervisor/cleanup behavior.
- After the steel thread, author the reusable setup skill from the canonical README plus
  this checklist; decide its distribution/invocation shape before implementation.
- Before wider deployment, replace the shared landing secret with a per-run voucher, add a
  Vercel-side supervisor, and reduce the GitHub App to minimum required permissions.
