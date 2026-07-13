# Production mint boundary and Sandbox probe verified

## Summary

The live credential boundary now works end to end. The stable
`https://ns-dispatch.vercel.app` deployment serves health, rejects mint requests without
caller authentication safely, accepts the verified local Development identity, mints a
clone-only GitHub App installation token, and completed one controlled billable Vercel
Sandbox probe against private repository `nseng-ai/ns` at exact remotely reachable SHA
`5308b3d45ba520fd530d5a288e3de4ab32914b05`. The fixed command emitted the expected
`__NS_SANDBOX_HELLO_PROBE_V1__` marker and exact HEAD; success also confirms the probe's
mandatory cleanup path returned successfully.

Debugging the failed first deployment found three independent integration defects:

1. The Vercel project rooted at the nested `deployable/` directory transpiled the API
   entrypoint but omitted package-owned runtime sources imported from above that root. The
   capability package itself is now the Vercel Root Directory, keeping `api/`, `src/`, the
   package manifest, and `vercel.json` inside one traceable project boundary.
2. Vercel's TypeScript pass emitted `.js` modules while preserving explicit `.ts` import
   specifiers, and its build still promoted a separate TypeScript narrowing diagnostic.
   The package tsconfig now enables `rewriteRelativeImportExtensions`; the narrowing check
   is explicit; and `pnpm build:deployable` runs the native typecheck, rejects TypeScript
   diagnostics in Vercel output, and verifies the emitted mint function's complete relative
   import graph before deployment.
3. Vercel reserves `x-vercel-oidc-token` for the executing workload and replaced the
   caller-supplied Development token with the production Function's identity. The private
   local-to-mint hop now carries its token on `x-ns-dispatch-oidc-token`; a regression test
   confirms the reserved header is ignored. No auth policy, trusted claim, or token lifetime
   was widened.

The project Root Directory was updated to `ts/packages/capabilities/vercel` with outside-root
workspace sources retained for monorepo installation. Proven command placement is now split
intentionally: link/build/env-pull/probe from the package directory, production deployment
from the repository root so the configured Root Directory is applied exactly once. The
canonical README and supporting seam/research records now carry these facts.

Validation passed: targeted `@nseng-ai/vercel` tests and native typecheck, the local
`build:deployable` gate under Vercel's TypeScript 6 builder, production health and safe
unauthenticated mint checks, authenticated clone-token minting without token output, and the
controlled Sandbox probe. No OIDC token, installation token, private key, mint secret, or
environment value was printed or recorded.

## Objective Impact

The live deployment and billable-probe portion of the Credentials roadmap row is complete.
The credential mechanism, Development OIDC trust, GitHub App repository scope, private
checkout, exact revision, fixed command, and cleanup are all exercised against real
boundaries. The deployable-packaging risk is de-risked with a repeatable artifact gate rather
than only a successful deployment status.

The Credentials row remains `[~]` for cleanup of the four old-prefix Production variables,
revocation/deletion of superseded key material, and dispatch preflight. The successful probe
unblocks implementation of that preflight and then the `ns dispatch prompt` steel thread; it
does not authorize the later setup skill to be authored ahead of the steel thread.

## Follow-Ups

- Remove the four old-prefix Production variables, revoke the superseded GitHub App private
  key, and delete the owner-readable downloaded PEM now that replacement deployment and
  private checkout are verified.
- Implement dispatch preflight against the typed `[dispatch]` settings and required remote
  environment contract.
- Preserve the package-root build/link, repo-root deployment, custom caller OIDC header,
  exact-remote-SHA requirement, and artifact-closure gate in the later reusable setup skill.
