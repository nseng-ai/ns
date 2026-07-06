# `@nseng-ai/ns@0.1.1` kernel export publish-prep

Local publish-prep evidence now exists for a patch `@nseng-ai/ns@0.1.1` package whose generated publish root is registry-ready for the public kernel subpaths needed by downstream package publishes.

Changes prepared locally:

- `ts/packages/hosts/ns-cli/package.json` now targets `version: 0.1.1` and declares `publishConfig.access = public`.
- `ts/packages/hosts/ns-cli/scripts/prepare-local-package.mjs` carries that public access metadata into `dist/publish/package.json` and asserts it, while continuing to assert the generated kernel export map.
- `ts/packages/hosts/ns-cli/scripts/smoke-checkout-free.mjs` now imports every public kernel subpath from the installed tarball, not only `kernel/sdk`.
- `ts/packages/hosts/ns-cli/README.md` records the five `@nseng-ai/ns/kernel/*` subpaths, local verification commands, and the post-authorization registry readback command.

Validation run locally:

- `pnpm --dir ts --filter @nseng-ai/ns run check`
- `pnpm --dir ts --filter @nseng-ai/ns run test`
- `pnpm --dir ts --filter @nseng-ai/ns run publish:dry-run`
- `pnpm --dir ts --filter @nseng-ai/ns run smoke:checkout-free`
- `pnpm --dir ts --filter @nseng-ai/ns run pack:local`
- `pnpm --dir ts run fmt:check`
- `just dprint-check`

Generated `ts/packages/hosts/ns-cli/dist/publish/package.json` inspection showed:

- `name: @nseng-ai/ns`
- `version: 0.1.1`
- `bin.ns: bin/ns.js`
- exact exports for `./kernel/cli`, `./kernel/command-io`, `./kernel/context`, `./kernel/pi-text-generation`, and `./kernel/sdk`, each targeting `./kernel/*.js`
- no generated `workspace:` or `catalog:` dependency specifiers
- `publishConfig.access: public`

No `npm publish` or registry write occurred. Remaining Objective work still needs separate human authorization for the real `@nseng-ai/ns@0.1.1` publish and post-publish `npm view @nseng-ai/ns@0.1.1 name version bin exports dist.tarball time --json` readback before dependent package publishes can rely on registry-visible `@nseng-ai/ns/kernel/*` metadata.
