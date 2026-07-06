# @nseng-ai/ns

Checkout-free npm package for the `ns` CLI.

The published package bin points at prebuilt JavaScript (`bin/ns.js`) assembled by the package preparation step. Developer source-checkout shims remain separate from this npm package boundary. Public kernel/SDK subpaths are published directly from `@nseng-ai/kernel`, not through this CLI host package.

## Release preparation for `0.1.1`

`@nseng-ai/ns@0.1.1` is the publishable patch target for the checkout-free CLI host. Local release qualification should run:

```sh
pnpm --dir ts --filter @nseng-ai/ns run publish:dry-run
pnpm --dir ts --filter @nseng-ai/ns run pack:local
pnpm --dir ts --filter @nseng-ai/ns run smoke:checkout-free
```

The generated `dist/publish/package.json` must keep `bin.ns` at `bin/ns.js`, omit source package scripts such as the raw-root `prepublishOnly` guard, and include `publishConfig.access = "public"`.

Actual publication is a separate authorized step; do not publish as part of local qualification. After an authorized publish, verify the registry metadata with:

```sh
npm view @nseng-ai/ns@0.1.1 name version bin dist.tarball time --json
```
