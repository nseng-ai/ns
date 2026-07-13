# Cloud Dispatch Credentials Design

Settled 2026-07-12 in a grill session over the research note
(`references/git-credential-minting-research.md`; decision trail in the
`credentials-design-settled` Semantic Update). This note records the
credentials roadmap row's decisions with rationale, and pairs every v1
shortcut with its named upgrade. The canonical user-facing contract remains
`references/README-draft.md` ("Setup"); this note never overrides it.

**Standing posture: racing to e2e prototype.** Short-term security
sacrifices are acceptable wherever the better solution stays
straightforward to swap in later. Each shortcut below is recorded next to
its upgrade so the swap is a slice, not a redesign.

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

## 4. Run supervision — v1: sandbox self-lands; upgrade: Vercel-side supervisor

**v1 (this slice / steel thread):** the sandbox runs an in-sandbox wrapper
that executes the agent and then performs the landing phase itself —
mint, push, PR update; on agent failure it posts the failure comment
instead of results. The local CLI does preflight, anchor push + PR open,
sandbox creation, and returns (fire-and-forget preserved).

Known v1 gap, accepted: a hard sandbox crash (wrapper never reaches
landing) leaves the anchor PR silent until the jobs TUI surfaces the run
as stale/failed from Vercel observability.

**Upgrade (adopt when deploying more widely):** a Vercel-side supervisor —
a per-dispatch function/workflow run on the deployable that mints the clone
token, creates the sandbox, supervises, late-mints, lands results, and
posts failure comments. It closes the hard-crash gap (the supervisor
outlives the sandbox) and its run id becomes the natural run handle stamped
on the anchor PR. The scheduled-jobs leg "invoking the same dispatch core"
becomes literal.

## 5. Mint-endpoint auth — v1: shared sandbox secret; upgrade: landing voucher

The app private key lives only on the Vercel project, so per-run minting
happens in a **mint endpoint on the package's deployable**. Its callers:

- **Local CLI** (dispatch time, clone token): authenticates with the Vercel
  OIDC dev token (`vercel link` + `vercel env pull`). Same in v1 and after
  the upgrade.
- **Sandbox** (landing time, fresh token) — **v1:** a long-lived shared
  secret injected into every sandbox authenticates the mint call. This is a
  deliberate race-to-prototype shortcut: it is a standing credential in the
  agent environment that can mint push tokens for the repo.
- **Upgrade:** a per-run **landing voucher** — a JWT signed by the
  deployable, claims: run id, repo, expiry ≈ max run duration — issued at
  dispatch time alongside the clone token and exchangeable exactly once for
  a 1-hour installation token. Stateless, per-run scoped; the voucher
  itself cannot push. Implement by swapping the endpoint's auth check and
  the injected credential; run orchestration is otherwise unchanged.

Rejected: the (possibly expired) clone token as proof-of-run — an expired
token proves nothing and an unexpired one makes the endpoint accept any
holder of any repo token.

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
  missing before any remote work starts": `ns.toml` `[dispatch]` present
  and well-formed; Vercel OIDC dev token available; mint endpoint
  reachable; required model keys present on the project (names only, via
  the deployable); clean tree; anchor push feasibility.

## What remains to implement (interleaves with the steel thread)

The decisions above are settled; the implementation is code and one-time
setup that lands with or just before the steel thread, since the mint
endpoint lives on the package's deployable and the package is created by
the steel-thread row:

1. Register the `ns-dispatch` GitHub App under nseng-ai; install on the
   repo; key into a sensitive env var (one-time, human).
2. Create the dispatch Vercel project rooted at the
   `ts/packages/capabilities/vercel` package; add model keys and the v1 shared
   sandbox secret (one-time).
3. Mint endpoint on the deployable (v1 auth: OIDC for the CLI, shared
   secret for sandboxes), with the voucher upgrade noted in code.
4. Dispatch preflight per §7.
