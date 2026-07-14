# Vercel Sandbox and GitHub integration field guide

## Status

This path is retained for compatibility with earlier Objective records. Its former omnibus
content was reorganized by stable topic so future sessions can update one canonical owner
per fact.

Use `README.md` as the reference map.

## Current topic owners

- Ordered setup, controlled probe, consent boundaries, safe failure categories, and cleanup:
  `dispatch-setup-and-preflight.md`.
- Development OIDC, GitHub App identity, token phases, secrets, and rotation:
  `dispatch-credentials-and-trust.md`.
- Vercel Build Output, hermetic API functions, Workflow inventory, Root Directory, and
  prebuilt promotion: `dispatch-deployment-contract.md`.
- Workflow supervision, private-repository Sandbox checkout, poll/sleep, retries, and
  cleanup: `dispatch-workflow-and-sandbox-runtime.md`.
- Anchor branches, metadata-only initialization, PR stamping, landing, and reporting:
  `dispatch-anchor-and-landing.md`.
- Pi SDK lifecycle, tools, child PATH, subagents, and result protocol:
  `dispatch-pi-runner.md`.
- Debugging and observability: `dispatch-debugging-and-observability.md`.
- Witnessed deployments, runs, PRs, commits, and bounded claims:
  `dispatch-live-evidence.md`.

## Historical context

This file originally preserved the first expensive Vercel/GitHub App/private-Sandbox setup
investigation. Immutable decisions and status transitions still reference this path. The
current topic documents incorporate that evidence while removing stale prototype guidance,
including the retired shared landing secret and Sandbox self-landing architecture.

For the chronological Vercel deployment incident and vendor-facing recommendations, see
`vercel-workflow-deployment-feedback-report.md`.
