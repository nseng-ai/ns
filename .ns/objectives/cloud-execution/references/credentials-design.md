# Cloud Dispatch Credentials Design

Settled 2026-07-12 in a grill session over the research note
(`references/git-credential-minting-research.md`; decision trail in the
`credentials-design-settled` Semantic Update). Revised 2026-07-13 by the
workflow-supervisor architecture (`workflow-supervisor-architecture-adopted`
Semantic Update): §4 and §5 are rewritten in place — the supervisor is the
v1 architecture, and the shared-secret and self-landing shortcuts were
retired before implementation. §§1–3 and 6–7 stand unchanged. The
canonical user-facing contract remains `references/README-draft.md`
("Setup"); this note never overrides it.

**Standing posture: racing to e2e prototype.** Short-term security
sacrifices are acceptable wherever the better solution stays
straightforward to swap in later; as of the 2026-07-13 revision the
credential path carries no such sacrifice — the remaining prototype debt
is the App's overbroad Actions/Workflows permissions and the pending human
removal of the inert deployed mint-secret variable, which no current code
or runtime parser consumes.

## 1. Mechanism: GitHub App installation tokens

Per-run scoped git credentials are minted as **GitHub App installation
access tokens**: app-private-key-signed JWT →
`POST /app/installations/{id}/access_tokens`, fixed 1-hour TTL, scoped at
mint time to the repository and to `contents: write`,
`pull_requests: write`, `issues: write` (covering clone, push, PR
create/update, and comments). Git credential shape:
`https://x-access-token:<TOKEN>@github.com/<owner>/<repo>.git`. Installation
tokens carry their own 5,000/h rate budget and attribute commits/PRs to the
app bot rather than impersonating a human.

Decided partly by elimination: research confirmed **fine-grained PATs
cannot be minted programmatically** (creation is web-UI only, minimum
lifetime 1 day), so a PAT can only ever be a standing long-lived secret —
exactly what the settled README credentials story rules out. No native
OIDC-to-GitHub exchange exists (GitHub issues OIDC for Actions; it does not
consume it), so the App key is the irreducible root secret.

Rejected: standing fine-grained PAT (reverses the README's
no-long-lived-token commitment; impersonates the user; manual rotation);
PAT-now-App-later (ships a credentials story the README disclaims; "later"
calcifies).

## 2. Token lifetime handling: late-mint at push time

A run has three credential phases:

1. **Clone phase** — a repo-scoped installation token is minted at sandbox
   creation and used to clone; it is not relied on afterward.
2. **Work phase** — the agent works tokenless. No git credential exists in
   the sandbox while the agent does its work.
3. **Landing phase** — a fresh installation token is minted when the run is
   ready to land, and performs the push, PR update (decision log), or
   failure comment.

This dissolves the 1-hour-TTL vs. 24-hour-sandbox mismatch (no token needs
to outlive its phase) and shrinks push-capable-token exposure to the
landing window.

Rejected: capping run duration under the token TTL (arbitrary product
limit driven by a credential detail); executor-driven mid-run re-mint
(speculative orchestration complexity).

## 3. Dispatch-side anchor setup: the user's own credentials

When dispatch runs on a dev machine, the up-front anchor work — pushing the
`dispatch/` branch and opening the PR — uses the git/gh credentials already
on that machine. The human dispatching can already push branches and open
PRs; the anchor setup is just another push. App-minted tokens are for the
executor and for scheduled jobs, where no human credential exists.

Rejected: app-minting for local anchor setup too (uniform bot attribution
was not worth adding a network mint dependency to every local dispatch).

## 4. Run supervision: the dispatch workflow is the supervisor (revised 2026-07-13)

The formerly named upgrade is the v1 architecture: a per-dispatch **Vercel
Workflow run** on the deployable mints the clone token, creates the
sandbox, launches the harness inside it, supervises through poll steps and
zero-compute sleeps, late-mints, lands results, and posts failure
comments. The local CLI does preflight, anchor push + PR open, and the
trigger call, then returns (fire-and-forget preserved). The workflow run
id is the run handle stamped on the anchor PR, and the scheduled-jobs leg
"invoking the same dispatch core" is literal: cron starts the same
workflow.

The original v1 — an in-sandbox wrapper that executes the agent and
self-lands — was retired before implementation. It was never implementable
for the pi-first steel thread (the AI SDK pi adapter runs the model loop
in the driver process, not in the sandbox), and it carried an accepted
hard-crash gap: a sandbox that died before landing left the anchor PR
silent. The supervisor closes that gap by construction — it outlives the
sandbox.

## 5. Mint access: in-process for the workflow; OIDC endpoint for development (revised 2026-07-13)

The app private key lives only on the Vercel project. Minting callers:

- **The dispatch workflow** (clone token at sandbox creation, landing
  token at landing time): mints **in-process** through the mint core — it
  runs on the deployable where the key lives, so no HTTP hop and no
  caller credential exist to protect. The landing token is injected into
  the single landing command; no push-capable credential ever sits in the
  sandbox environment.
- **Development tooling** (probes, preflight): the existing
  `POST /api/mint` endpoint, authenticated with the Vercel Development
  OIDC token (`vercel link` + `vercel env pull`) on the dispatch-owned
  header. The endpoint is no longer on the dispatch path.

Retired by the 2026-07-13 architecture revision: the v1 **shared sandbox
mint secret** (a standing credential in the agent environment that could
mint push tokens) and its named upgrade, the per-run **landing voucher** —
with no sandbox-initiated minting in the architecture, there is nothing for
a voucher to authenticate. The code-side retirement is now complete: the
HTTP shared-secret adapter and landing path are gone, and `POST /api/mint`
authenticates only Development OIDC and permits only clone minting. The
deployed `NS_DISPATCH_SANDBOX_MINT_SECRET` production variable is inert but
remains through the pending live pass; remove it afterward through the
human-only environment process (tracked on the credentials roadmap row).

Rejected (2026-07-12, still instructive): the (possibly expired) clone
token as proof-of-run — an expired token proves nothing and an unexpired
one makes the endpoint accept any holder of any repo token.

## 6. GitHub App identity: org-owned

The app is registered under the **nseng-ai org** (working name
`ns-dispatch`), installed on the repository, requesting `contents`,
`pull_requests`, and `issues` write. One-time setup; org admins control it;
anchor-PR activity attributes to `ns-dispatch[bot]`. The private key is
generated directly into a **Vercel sensitive env var** on the dispatch
project — write-only after creation, redacted in logs, and (verified)
sensitive env vars cannot exist in the Development environment, so
`vercel env pull` can never bring the key to a dev machine. Key rotation
uses GitHub's concurrent-key support (up to 25); the app identity itself is
durable.

Rejected: personal-account registration (org infrastructure bound to one
human account; owes a re-registration later).

## 7. Model keys and preflight

- **Model keys** (Anthropic/OpenAI/etc., whatever the repo-configured
  in-sandbox harness needs) live as sensitive env vars on the dispatch
  Vercel project and are injected per-run at sandbox creation. Sandboxes
  stay secret-free by default: each run receives only the keys its
  configured harness requires plus its phase-appropriate git credential.
- **Preflight** makes the README's promise true — "reports exactly what is
  missing before any remote work starts": repo-root `ns.toml` has a valid
  `[dispatch]` table with a currently implemented harness and deployment
  URL; `ts/package.json#packageManager` is an exact stable pnpm declaration;
  the Vercel Development OIDC token is available; and a read-only
  authenticated run-status call confirms the trigger deployment accepts the
  caller. The command refuses a dirty tree before preflight. Remote launch
  independently re-reads the exact checkout's harness and package-manager
  configuration and checks the selected recipe's model-key names before
  provisioning.

## Implementation status and remaining cleanup

The original App registration/installation, linked package-root Vercel
project, and OIDC-authenticated clone probe landed and were live-verified on
2026-07-12/13. The in-process `DispatchTokenMinter`, local dispatch preflight,
OIDC-only/clone-only HTTP adapter, consumer-specific runtime configuration,
and removal of the shared-secret landing code are locally complete. The
workflow-side minting and full dispatch path remain pending the batched live
pass.

Operational cleanup remains deliberately separate from code:

1. After the pending live pass, remove the inert deployed
   `NS_DISPATCH_SANDBOX_MINT_SECRET` variable through the human-only Vercel
   environment process.
2. Tighten the App's extra Actions/Workflows write permissions before wider
   deployment.
