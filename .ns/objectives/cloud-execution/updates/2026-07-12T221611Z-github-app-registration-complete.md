# GitHub App registration complete

## Summary

The human-gated GitHub App setup is complete. GitHub API evidence confirmed
an active org-owned `ns-dispatch` App (App ID `4282120`) installed under
`nseng-ai` with installation ID `146155769`; screenshot evidence confirmed
that its selected-repository scope contains exactly `nseng-ai/ns`. The App
has the required `contents`, `issues`, and `pull_requests` write permissions.

The installation also carries `actions: write` and `workflows: write` beyond
the runtime minimum in the credentials design. The user explicitly accepted
that overreach for the race-to-e2e prototype. It remains a permission-hardening
follow-up before wider deployment. No private key was captured in Objective
tracking; key custody remains with the future Vercel project's sensitive
environment.

## Objective Impact

The one-time App registration and repository-installation portion of the
credentials roadmap row is complete. The row remains in progress because the
Vercel project and sensitive environment, mint endpoint, and dispatch
preflight are not yet implemented. The accepted extra permissions add a
concrete prototype-stage security caveat without changing the settled
GitHub App token mechanism or late-mint design.

## Follow-Ups

- Create the package deployable and its dispatch Vercel project, then route
  the App private key, model keys, and v1 shared sandbox secret into sensitive
  environment variables without committing them or recording their values.
- Implement the mint endpoint and dispatch preflight with the settled v1 auth
  model.
- Remove the App's Actions and Workflows write permissions before wider
  deployment.
