# Npm managed acquisition for declared extensions implemented

## Summary

Implemented the npm managed-acquisition slice for top-level `ns.toml` `extensions = [...]` declarations.

Landed behavior:

- Added `@nseng-ai/kernel/extensions/acquisition` with pure source-spec parsing, managed npm package-root computation, fakeable acquisition gateways, and a real npm adapter.
- Npm specs resolve under `.ns/managed-extensions/npm/node_modules/<pkg-name>`, including scoped packages.
- Pinned npm specs install only when missing and skip when already present; unpinned npm specs run install on each apply-mode update.
- The real adapter prepares a private managed npm project and invokes `npm install --no-save --package-lock=false --ignore-scripts --legacy-peer-deps <pkg>`; it removes `package-lock.json` defensively.
- Dry-run/preview mode does not call mutating acquisition gateway methods. If a package is not already present, it reports a preview diagnostic instead of installing.
- `git:` remains reserved/unsupported as a per-spec diagnostic.
- Harness-artifact reconcile now resolves declared extension module roots through the kernel acquisition API and passes those roots into static module artifact discovery.
- Declared-only targeting now accepts exact npm specs from `ns.toml`; undeclared npm targets remain errors.
- Acquisition diagnostics are included in the existing `ns update` report diagnostics and human rendering.
- Non-dry-run `ns update --extensions` preflight uses apply-mode acquisition before provision dry-run so newly acquired module artifacts can be conflict-checked before harness writes.

## Evidence

Validation run locally:

- `pnpm --dir ts exec vitest run packages/kernel/test/unit/extension-acquisition.test.ts packages/capabilities/harness-artifacts/test/module-artifact-discovery.test.ts packages/capabilities/harness-artifacts/test/reconcile-apply.test.ts`
- `pnpm --dir ts run fmt:check`
- `pnpm --dir ts run lint`
- `pnpm --dir ts run check`
- `pnpm --dir ts exec vitest run packages/kernel/test packages/capabilities/harness-artifacts/test packages/hosts/ns-cli/test/ns-cli.test.ts`

## Follow-ups

- A no-write dry-run cannot inspect artifacts from not-yet-installed remote packages; it reports acquisition preview diagnostics until a package is already present.
- Non-force apply preflight may run npm acquisition before conflict refusal, matching the accepted plan caveat that managed npm state can be populated before harness-file writes are refused.
- Git acquisition, managed pruning/removal, marketplace/catalog discovery, trust gates, and real remote end-to-end proof remain outside this slice.
