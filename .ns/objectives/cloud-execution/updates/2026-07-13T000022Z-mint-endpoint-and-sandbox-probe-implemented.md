# Mint endpoint and controlled Sandbox probe implemented locally

## Summary

The credentials slice now has a local implementation of the two boundaries needed to
exercise private-repository checkout from Vercel Sandbox:

- `POST /api/mint` validates its runtime configuration without exposing values, accepts
  exactly one authentication channel, restricts Development Vercel OIDC identities to
  the configured team/project and clone purpose, restricts the prototype shared-secret
  channel to landing purpose, enforces the configured repository, and mints narrow
  GitHub App installation tokens.
- A development-only fixed hello probe obtains a clone token, creates a non-persistent
  Node 24 Vercel Sandbox with a shallow private-repository checkout at an exact commit
  SHA, runs only a fixed marker/HEAD command, verifies the observed revision, and
  attempts cleanup on every post-creation path. Its result and failure surfaces avoid
  credential and vendor-detail leakage.

The canonical README now records the local setup order, endpoint variable contract,
controlled-probe command, safe output, and failure signals as source material for the
later setup skill. This is local implementation evidence, not a claim that the cloud
boundary has run successfully: the live Development-token trust check, endpoint
deployment, and billable Sandbox probe still require explicit human authorization.

Targeted `pnpm --dir ts --filter @nseng-ai/vercel test` passes. The corresponding package
check could not run because the local workspace did not provide the `tsgo` executable,
so typecheck evidence remains outstanding rather than being inferred from tests.

## Objective Impact

The Credentials roadmap row remains `[~]`, but the mint endpoint is no longer an
unimplemented gate. Its remaining semantic work is live cloud-boundary verification and
dispatch preflight. The fixed probe also starts the evidence base for the reusable setup
skill without authoring that skill before the prompt steel thread.

The credentials risk is further de-risked at the local contract and fake-driven adapter
level. The accepted prototype shortcuts remain unchanged: shared landing secret,
sandbox self-landing, and overbroad GitHub App Actions/Workflows permissions must still
be upgraded before wider deployment.

## Follow-Ups

- With explicit human authorization, verify the real Development OIDC claims without
  printing the token, deploy the endpoint, and run the controlled billable Sandbox probe
  against the configured private repository at an exact SHA.
- Restore the expected native TypeScript toolchain executable and record a passing
  package typecheck.
- Implement dispatch preflight, then build `ns dispatch prompt` through the full anchor
  PR and Pi-harness steel-thread contract.
