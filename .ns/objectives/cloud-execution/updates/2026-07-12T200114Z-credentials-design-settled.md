# Credentials design settled: GitHub App tokens, late-mint, prototype shortcuts with named upgrades

## Summary

The credentials roadmap row's decision half is settled, decided in a grill
session on 2026-07-12 over a primary-source research pass and recorded with
rationale in `references/credentials-design.md`. The research note
(`references/git-credential-minting-research.md`, every claim cited to
GitHub/Vercel primary sources) did real work: it eliminated one arm of the
decision outright and surfaced the one genuine design cost.

The decisions:

1. **Mechanism: GitHub App installation tokens** — settled partly by
   elimination: fine-grained PATs cannot be minted via API (web-UI only,
   1-day minimum lifetime), so "per-run scoped PAT" was never real; a PAT
   can only be the standing long-lived secret the README's credentials
   story rules out. App tokens are minted per run (1-hour TTL,
   repo-scoped, `contents`/`pull_requests`/`issues` write), carry their
   own rate budget, and attribute as a bot instead of impersonating the
   user. No native OIDC-to-GitHub exchange exists, so the app private key
   is the irreducible root secret.
2. **Late-mint at push time** dissolves the research's one real design
   cost (1-hour token TTL vs. 24-hour sandbox max): clone token at sandbox
   creation, tokenless work phase, fresh token minted only at landing.
3. **Local anchor setup uses the user's own credentials** — the up-front
   `dispatch/` push and PR open ride the machine's existing git/gh auth;
   minted tokens are for the remote side where no human credential exists.
4. **Supervision v1: the sandbox self-lands** via an in-sandbox wrapper
   (agent failure → failure comment posted in the landing phase; hard
   sandbox crash → PR silent until the jobs TUI shows staleness —
   accepted). **Named upgrade**: a Vercel-side per-dispatch supervisor
   once we deploy more widely; its run id becomes the natural run handle.
5. **Mint-endpoint auth v1: a long-lived shared sandbox secret** for the
   sandbox's landing-time mint call; the local CLI authenticates with the
   Vercel OIDC dev token. **Named upgrade**: a per-run signed landing
   voucher (JWT: run id, repo, expiry) exchanged once for the installation
   token — a swap of the endpoint's auth check, not a redesign.
6. **App identity: org-owned** — `ns-dispatch` under nseng-ai, installed
   on the repo, private key generated directly into a Vercel sensitive env
   var (verified: sensitive vars are write-only and cannot exist in the
   Development environment, so the key can never be pulled to a dev
   machine).
7. **Standing posture, set explicitly by the user: racing to an e2e
   prototype.** Short-term security sacrifices are acceptable where the
   better solution stays straightforward; every shortcut is recorded
   beside its upgrade.

## Objective Impact

- `references/git-credential-minting-research.md`: new — cited
  primary-source research (GitHub fine-grained PAT and App token
  mechanics, Vercel sensitive env vars / OIDC / Sandbox / Workflows).
- `references/credentials-design.md`: new — the decision record, each v1
  shortcut paired with its named upgrade, plus the remaining
  implementation list.
- `references/README-draft.md`: "Setup" now tells the GitHub App story
  (one-time org app registration, key custody, bot attribution, phased
  git credential, local-credentials-for-local-anchor); the
  git-credential-minting open question is resolved and removed — the
  README's open questions are down to the TUI command name /
  push-notification and the nightly advancement policy.
- `roadmap.md`: credentials row → `[~]` — design settled; remaining
  implementation named (app registration, Vercel project + env vars, mint
  endpoint, preflight), interleaving with the steel thread since the mint
  endpoint lives on the package's deployable and the package is created by
  the steel-thread row.
- `objective.md`: credentials Scope bullet updated with the settled
  design; the "credentials may dominate cost" risk marked largely
  de-risked with the residual (v1 shortcuts must upgrade before wider
  deployment) stated explicitly.

## Follow-Ups

- Steel thread is now unblocked on design: its slice includes the
  credentials implementation remainder — register the `ns-dispatch` app
  (human, one-time), create the dispatch Vercel project + sensitive env
  vars, build the mint endpoint (v1 auth) on the deployable, and dispatch
  preflight.
- Before wider deployment: land the two named upgrades — per-run landing
  voucher replacing the shared mint secret, and the Vercel-side
  supervisor replacing sandbox self-landing.
- UNVERIFIED items flagged in the research note (e.g. whether GitHub's
  credential-revocation API accepts fine-grained PATs) do not bear on the
  settled decisions; revisit only if the design changes.
