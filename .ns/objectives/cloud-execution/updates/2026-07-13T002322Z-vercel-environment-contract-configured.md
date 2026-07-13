# Vercel environment contract configured

## Summary

The linked `schrockns-projects/ns-dispatch` Vercel project now carries the full
`NS_DISPATCH_*` runtime contract. Production has all nine dispatch-owned
variables; the GitHub App private key and prototype Sandbox mint secret are
sensitive, while repository, App/installation IDs, Vercel team/project IDs,
and OIDC issuer/audience are non-secret configuration. Development carries the
repository input needed by the controlled local probe.

A fresh GitHub App private key was generated through the GitHub UI and streamed
directly into Vercel without printing or recording its contents. The downloaded
copy was validated as a private key, restricted to owner-only filesystem access,
and authenticated successfully as App ID `4282120`, slug `ns-dispatch`, owned by
`nseng-ai`. Installation ID `146155769` then minted a clone-purpose token that
reached private repository `nseng-ai/ns` with `contents: read`. A fresh random
prototype Sandbox mint secret was generated and streamed directly into its
sensitive Vercel variable.

A Development environment pull supplied a short-lived `VERCEL_OIDC_TOKEN` in an
ignored, owner-readable local file. Only its non-secret claims were decoded: the
issuer is `https://oidc.vercel.com/schrockns-projects`, the audience is
`https://vercel.com/schrockns-projects`, and its `owner_id`, `project_id`, and
`environment` exactly matched the configured team, project, and `development`.
The token itself was not printed or recorded.

The four old-prefix Production variables remain temporarily as rollback inputs;
no deployment or Sandbox was started in this configuration slice.

## Objective Impact

The remote environment-migration blocker on the Credentials roadmap row is
cleared. The credential chain is now verified through Vercel inventory, real
Development OIDC claim identity, GitHub App authentication, installation scope,
and private-repository read access. The row remains `[~]` until the endpoint is
deployed, the controlled billable Sandbox probe succeeds, and dispatch preflight
lands.

This evidence also sharpens the reusable setup path: sensitive variable keys
cannot be renamed or read back through Vercel, so a namespace migration requires
a newly generated GitHub App key and a newly generated prototype mint secret;
non-secret trust inputs come from linked-project identity and actual OIDC claims,
not guessed URL conventions.

## Follow-Ups

- Deploy the mint endpoint and run one explicitly authorized, billable Sandbox
  probe against a remotely reachable exact commit SHA.
- After the new endpoint and probe succeed, remove the four old-prefix Vercel
  variables and revoke the superseded GitHub App private key.
- Decide when to delete the owner-readable downloaded PEM after it is no longer
  needed for controlled verification; never commit it or preserve it in setup
  artifacts.
- Implement dispatch preflight, then continue into the `ns dispatch prompt`
  steel thread.
