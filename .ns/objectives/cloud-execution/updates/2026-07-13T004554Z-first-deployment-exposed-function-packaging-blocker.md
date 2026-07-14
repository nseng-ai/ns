# First production deployment exposed a function-packaging blocker

## Summary

The first production deployment of the `ns-dispatch` Vercel project reached
`https://ns-dispatch.vercel.app`. The health route returned its expected safe response,
but `POST /api/mint` returned a generic `500` before authentication. Vercel runtime logs
identified the concrete failure without exposing credentials: the function artifact could
not resolve `ts/packages/capabilities/vercel/src/mint/handle-mint-request.ts`, which the API
entrypoint imports from above the deployable directory. The deployment artifact therefore
does not currently carry the package-owned mint implementation.

The live attempt also exposed two setup/build facts:

- With the linked Vercel project's Root Directory set to
  `ts/packages/capabilities/vercel/deployable`, invoking deployment from that directory
  duplicated the root path and failed before upload. Invoking deployment from the
  repository root with the explicit existing project succeeded. The canonical README's
  instruction to run all Vercel commands from the deployable directory is therefore not
  valid for the current project configuration.
- The remote build emitted a TypeScript narrowing error in
  `src/mint/handle-mint-request.ts` but still completed and promoted the deployment. A
  local `vercel build --prod` completed without surfacing that error. Deployment readiness
  needs an explicit typecheck/build-failure gate rather than relying on Vercel's successful
  status alone.

The targeted `@nseng-ai/vercel` test suite passed. The package `check` command could not
run locally because the workspace did not provide the `tsgo` executable. No authenticated
mint request was made, no Sandbox was created, and no billable probe usage occurred. No
secret value, OIDC token, installation token, private key, or mint secret was printed or
recorded.

## Objective Impact

The Credentials roadmap row remains `[~]`. Environment custody and deployment routing are
now exercised, but the deployed mint boundary is blocked on making the function artifact
self-contained or explicitly bundling its package-owned runtime sources, fixing the remote
TypeScript error, and adding a deployment gate that catches either failure. Only after a
redeploy makes an unauthenticated mint request reach the expected safe `401` should the
explicitly authorized billable Sandbox probe run.

This materializes a deployment-packaging risk and corrects the setup evidence that will
feed the canonical README and later setup skill. It does not change the settled credential
model, repository scope, or Vercel-native stance.

## Follow-Ups

- Repair the deployable packaging/runtime boundary and the TypeScript narrowing error;
  ensure deployment fails when either check fails.
- Redeploy from the repository root under the current Vercel Root Directory setting and
  verify health plus the mint route's safe unauthenticated response.
- Correct the canonical README's Vercel command-location guidance from proven behavior.
- Then run the already authorized controlled probe once against the remotely reachable
  exact SHA `5308b3d45ba520fd530d5a288e3de4ab32914b05` and record checkout, marker/HEAD, and
  cleanup evidence without recording credentials.
