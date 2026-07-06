# @nseng-ai/ns

Checkout-free npm package for the `ns` CLI.

The published package bin points at prebuilt JavaScript (`bin/ns.js`) assembled by the package preparation step. Developer source-checkout shims remain separate from this npm package boundary.

The package also owns the public kernel subpaths for checkout-free consumers:

- `@nseng-ai/ns/kernel/cli`
- `@nseng-ai/ns/kernel/command-io`
- `@nseng-ai/ns/kernel/context`
- `@nseng-ai/ns/kernel/pi-text-generation`
- `@nseng-ai/ns/kernel/sdk`

The standalone workspace `@nseng-ai/kernel` package remains private and is folded into these `@nseng-ai/ns` subpaths at package-preparation time.

## Release preparation for `0.1.1`

`@nseng-ai/ns@0.1.1` is the publishable patch target for registry-visible kernel subpath metadata. Local release qualification should run:

```sh
pnpm --dir ts --filter @nseng-ai/ns run publish:dry-run
pnpm --dir ts --filter @nseng-ai/ns run pack:local
pnpm --dir ts --filter @nseng-ai/ns run smoke:checkout-free
```

The generated `dist/publish/package.json` must keep `bin.ns` at `bin/ns.js`, expose the five `./kernel/*` exports above as `./kernel/*.js`, and include `publishConfig.access = "public"`.

Actual publication is a separate authorized step; do not publish as part of local qualification. After an authorized publish, verify the registry metadata with:

```sh
npm view @nseng-ai/ns@0.1.1 name version bin exports dist.tarball time --json
```
