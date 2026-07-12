# ns dispatch environment namespace settled

## Summary

All nine dispatch-owned Vercel environment variables now use the
`NS_DISPATCH_*` prefix across the mint runtime parser, controlled Sandbox
probe, tests, and canonical README. This is a deliberate user-facing naming
decision: the variables belong to ns dispatch rather than to an ambient,
generic dispatch facility.

The rename is complete and breaking because ns is unreleased; no compatibility
aliases preserve the prior `DISPATCH_*` spellings. Generic model-provider keys
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`) and Vercel's built-in
`VERCEL_OIDC_TOKEN` retain their provider-owned names.

Read-only Vercel preflight evidence showed that the linked `ns-dispatch`
project still carries four variables under the old prefix and does not yet
carry the five new endpoint trust variables. No Vercel configuration was
changed in this slice, so deployment remains blocked on migrating the remote
environment contract.

## Objective Impact

The canonical Setup contract and local implementation now have one unambiguous
namespace. The Credentials roadmap row remains `[~]`: local naming is settled,
but the linked Vercel project must be brought into conformance before live OIDC
verification, endpoint deployment, or the controlled billable Sandbox probe.

Validation passed with the targeted `@nseng-ai/vercel` tests, workspace
TypeScript check, TypeScript formatting and lint, and repository dprint check.

## Follow-Ups

- Replace the linked Vercel project's four old-prefix variables with their
  `NS_DISPATCH_*` equivalents without printing or recording secret values.
- Add the five non-secret repository/project/OIDC trust variables under the
  same namespace, deriving issuer and audience from the actual Development
  token claims rather than guessing.
- Re-run the read-only preflight before requesting authorization to deploy and
  start one billable Sandbox probe.
