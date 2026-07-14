# Vercel package and project bootstrap complete

## Summary

The credentials foundation now has a concrete package and deployable home. The new
`@nseng-ai/vercel` capability exports its API and typed `ns dispatch` extension
descriptor, owns a health-only Vercel deployable subdirectory, and declares the
manifest-owned `[dispatch]` settings table. Repo-root `ns.toml` now selects the Pi
harness and records the stable Vercel project/team IDs; its strict parser rejects
unsupported harnesses, malformed IDs, missing configuration, and secret-shaped
unknown fields.

The pre-existing `schrockns-projects/ns-dispatch` Vercel project was linked from the
deployable. Production environment-variable inventory confirmed, by name and type
only, both model-key variables, GitHub App identity/private-key variables, and the v1
sandbox mint secret. Sensitive values were neither read nor recorded. A local Vercel
build produced the health function successfully.

The canonical README's Setup section now names the exact non-secret TOML fields and
environment-variable contract made true by this bootstrap.

## Objective Impact

The package/project/environment portion of the in-progress Credentials roadmap row is
complete and the package placement, typed configuration, and Vercel secret-custody
assumptions are now exercised. The row remains `[~]`: remote work is still gated on
the mint endpoint and dispatch preflight, which should land with or immediately before
the `ns dispatch prompt` steel thread.

The bootstrap deliberately adds no backend-neutral abstraction and no dispatch command
stubs. The package and deployable remain Vercel-named, while the existing local
`/ccc:workspace:dispatch-*` flows stay unchanged.

## Follow-Ups

- Implement the mint endpoint with Vercel OIDC authentication for the local CLI and the
  accepted shared-secret authentication for sandbox landing.
- Implement dispatch preflight against the typed `[dispatch]` table and environment
  presence contract.
- Build the first `ns dispatch prompt` Vercel Sandbox run on this foundation.
- Before wider deployment, replace the shared secret with a per-run landing voucher and
  tighten the GitHub App's extra Actions/Workflows permissions.
