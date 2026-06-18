# Internal Import Alternatives

asdl-tools currently uses relative `.ts` imports inside a package and curated workspace subpath exports
between packages. Keep that convention unless a future migration deliberately changes the build/runtime
model.

## The `#`-imports steelman

Node package `imports` entries can provide internal specifiers such as:

```json
{
  "imports": {
    "#models": {
      "types": "./src/models.ts",
      "default": "./src/models.ts"
    },
    "#gateways/*": {
      "types": "./src/gateways/*.ts",
      "default": "./src/gateways/*.ts"
    }
  }
}
```

In a compiled package, conditional entries can map one specifier to source `.ts` in development and
emitted `.js` at runtime. The benefits are real:

- move-stable imports that do not churn when a file moves within the package;
- canonical, grep-friendly specifiers for important internal seams;
- less `../../..` path noise in deep packages;
- a single package-level manifest of public-ish internal paths.

## Why asdl defers it

asdl-tools runs TypeScript source directly and has `noEmit: true`, so the main compiled-ESM benefit does
not apply. The repository already has a working convention:

- relative `.ts` imports for private intra-package code;
- curated workspace package exports for cross-package boundaries;
- no deep imports into another package's `src/` tree.

Moving 17 workspace packages to `#` imports would create broad churn without improving runtime behavior.
If this is revisited, treat it as a dedicated migration with package-by-package mechanical checks, not an
opportunistic cleanup inside unrelated work.
