# Post-verification credential cleanup complete

## Summary

The credential namespace migration and key rotation are now cleaned up after live verification.
All four legacy Production variables — `DISPATCH_GITHUB_APP_ID`,
`DISPATCH_GITHUB_APP_INSTALLATION_ID`, `DISPATCH_SANDBOX_MINT_SECRET`, and
`DISPATCH_GITHUB_APP_PRIVATE_KEY` — were removed from the linked `ns-dispatch` Vercel project.
A subsequent read-only inventory showed the complete nine-variable `NS_DISPATCH_*` contract plus
the two provider model keys, with no old-prefix variables remaining and no values read.

The user confirmed revocation of the superseded `ns-dispatch` GitHub App private key through the
GitHub settings UI and cleanup of the downloaded local PEM. Post-cleanup non-billable checks
returned the expected production health response, the expected safe `401` for an unauthenticated
mint request, and a successful authenticated clone-purpose mint with the expected response shape.
The installation token was validated structurally but never printed or recorded; no Sandbox was
created.

## Objective Impact

The post-verification cleanup portion of the in-progress Credentials roadmap row is complete.
The linked project now has one dispatch-owned environment namespace and one active App-key path,
and the replacement key remains capable of minting a narrow clone credential after the old key's
revocation. This closes the temporary rollback window intentionally retained during migration.

The Credentials row remains `[~]` because dispatch preflight is still outstanding. The accepted
prototype security debt is unchanged: the shared landing secret, sandbox self-landing, and the
App's additional Actions/Workflows permissions still require their named upgrades or tightening
before wider deployment.

## Follow-Ups

- Implement dispatch preflight against the typed repo-root `[dispatch]` settings and required
  remote credential/configuration contract.
- Then proceed to the `ns dispatch prompt` anchor-PR and Pi-harness steel thread.
- Preserve replacement-before-removal ordering, UI-only existing-App key rotation, no-value
  inventory checks, and post-cleanup authenticated verification in the later reusable setup skill.
