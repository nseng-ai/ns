# @nseng-ai/ns

Checkout-free npm package for the `ns` CLI.

The published package bin points at prebuilt JavaScript (`bin/ns.js`) assembled by the package preparation step. Developer source-checkout shims remain separate from this npm package boundary.

The package also owns the public kernel subpaths for checkout-free consumers, for example `@nseng-ai/ns/kernel/sdk`. The standalone workspace `@nseng-ai/kernel` package remains private and is folded into these `@nseng-ai/ns` subpaths at package-preparation time.
