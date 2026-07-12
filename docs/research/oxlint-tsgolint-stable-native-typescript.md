# Oxlint, tsgolint, and stable native TypeScript 7

**Checked:** 2026-07-12. This is a point-in-time report because all three projects are moving quickly.

## Conclusion

There is **no released Oxlint migration that replaces `oxlint-tsgolint` with the stable TypeScript 7 `tsc` executable or renames that optional peer**. Oxlint 1.73.0 still declares the optional peer `oxlint-tsgolint` (now `>=0.24.0`), and Oxc's current documentation still says that `oxlint-tsgolint` is the separately installed backend for `--type-aware` linting. The latest backend release, `oxlint-tsgolint` 0.24.0, still identifies itself as powered by `typescript-go`.[^npm-oxlint][^npm-tsgolint][^oxc-type-aware]

There is one important post-release development: tsgolint `main` was updated on 2026-07-11 to an upstream **TypeScript 7.0** commit from `microsoft/typescript-go`. That change is unreleased as of this check; the latest tsgolint release remains 0.24.0 from 2026-06-30. It updates tsgolint's embedded compiler source, not its integration shape: Oxlint still invokes tsgolint, and no stable `tsc` executable is substituted.[^tsgolint-main][^tsgolint-release]

## The four distinctions

### 1. The optional peer's metadata name

The package name is still **`oxlint-tsgolint`**. The registry metadata for `oxlint@1.73.0` declares:

```json
{
  "peerDependencies": { "oxlint-tsgolint": ">=0.24.0" },
  "peerDependenciesMeta": {
    "oxlint-tsgolint": { "optional": true }
  }
}
```

“Optional peer” means Oxlint can integrate with that package when the type-aware mode is selected; it does not mean every Oxlint installation contains the backend. Oxc's installation guide explicitly tells users who want type-aware linting to add `oxlint-tsgolint` separately.[^npm-oxlint][^oxc-type-aware]

### 2. What this repository actually installs and enables

This repository does **not** install or enable tsgolint:

- [`ts/package.json`](../../ts/package.json) lists `oxlint`, but not `oxlint-tsgolint`, and its lint command is `oxlint .` (no `--type-aware`).
- [`ts/pnpm-lock.yaml`](../../ts/pnpm-lock.yaml) contains `oxlint-tsgolint` only in `oxlint@1.70.0`'s optional peer metadata (`>=0.22.1`); it has no resolved `oxlint-tsgolint` package entry.
- [`ts/.oxlintrc.json`](../../ts/.oxlintrc.json) does not set `options.typeAware`.

This matters because Oxc documents `--type-aware` or root `options.typeAware: true` as the switches that run the backend. The mere lockfile peer declaration does not activate it.[^oxc-type-aware]

### 3. Whether a newer Oxlint removes or renames the peer

No. Compared with this repository's Oxlint 1.70.0 metadata (`oxlint-tsgolint >=0.22.1`), current Oxlint 1.73.0 only raises the floor to `>=0.24.0`; it retains both the package name and optional status. The 1.73.0 release notes include type-aware timing work, not a backend replacement, and current Oxc docs still prescribe `oxlint-tsgolint@latest`.[^npm-oxlint][^oxlint-release][^oxc-type-aware]

The latest tsgolint release is 0.24.0. Its release notes include updates to the `typescript-go` submodule, while the project's current README and architecture continue to describe tsgolint as a Go backend built directly on `typescript-go` AST and checker internals.[^tsgolint-release][^tsgolint-readme][^tsgolint-architecture]

### 4. Whether stable native `tsc` can substitute for the linter backend

No—not as a drop-in backend.

Stable TypeScript 7.0.2 is the native Go port and is now published as the ordinary `typescript` package with a `tsc` executable. `@typescript/native` is not a distinct package in this repository: it is an npm alias to `typescript@^7.0.2`, matching Microsoft's documented side-by-side setup.[^ts7-announcement]

However, Microsoft explicitly says TypeScript 7.0 **does not ship a programmatic API**; it expects a new API in 7.1. A standalone `tsc` process emits compiler diagnostics, but it does not execute tsgolint's type-aware lint rules. Tsgolint instead links directly to `typescript-go` internal Go APIs, obtains its AST and type checker, and runs its own rules. Its architecture document notes that these internal shims are awaiting official APIs.[^ts7-announcement][^tsgolint-architecture]

Thus the compiler lineage has converged—stable TypeScript 7 and tsgolint both use Microsoft's native Go implementation—but the products are not interchangeable:

- `tsc` / this repo's `@typescript/native`: project type checking and compiler diagnostics.
- `oxlint-tsgolint`: semantic lint-rule execution for `oxlint --type-aware` (and optionally compiler diagnostics with `--type-check`).

The tsgolint maintainers' open versioning issue discusses aligning future tsgolint versions with official TypeScript releases; it does not propose replacing tsgolint with `tsc` or renaming the npm peer.[^tsgolint-versioning]

## Recommendation for this repository

1. **Do not add `oxlint-tsgolint` merely to satisfy the optional peer.** The current `oxlint .` lane is syntax/structural linting and does not use it.
2. **Keep the stable native TypeScript 7 `tsc` check as the authoritative typecheck.** Do not replace it with Oxlint's `--type-check`, which currently routes through tsgolint's embedded compiler and is a separate tool/version boundary.
3. **Oxlint can be upgraded independently to 1.73.0** after normal dependency validation; the raised optional-peer floor has no runtime effect while type-aware mode remains disabled.
4. If the repo intentionally adopts Oxlint type-aware rules later, make that a separate evaluated change: explicitly install `oxlint-tsgolint`, enable `--type-aware`, and preferably wait for a tsgolint release containing the 2026-07-11 TypeScript 7.0 submodule update. Run stable `tsc` alongside it initially rather than treating tsgolint as a substitute.

## Primary sources

[^npm-oxlint]: npm registry metadata, [`oxlint@1.73.0`](https://registry.npmjs.org/oxlint/1.73.0).

[^npm-tsgolint]: npm registry metadata, [`oxlint-tsgolint@0.24.0`](https://registry.npmjs.org/oxlint-tsgolint/0.24.0).

[^oxc-type-aware]: Oxc documentation, [Type-Aware Linting](https://oxc.rs/docs/guide/usage/linter/type-aware.md).

[^oxlint-release]: oxc-project/oxc, [Oxlint 1.73.0 release](https://github.com/oxc-project/oxc/releases/tag/apps_v1.73.0).

[^tsgolint-release]: oxc-project/tsgolint, [v0.24.0 release](https://github.com/oxc-project/tsgolint/releases/tag/v0.24.0).

[^tsgolint-main]: oxc-project/tsgolint, [2026-07-11 TypeScript 7.0 submodule update](https://github.com/oxc-project/tsgolint/commit/b73e48971417211ad9108cd0ab9476b3f7f00eea).

[^tsgolint-readme]: oxc-project/tsgolint, [README](https://github.com/oxc-project/tsgolint/blob/main/README.md).

[^tsgolint-architecture]: oxc-project/tsgolint, [ARCHITECTURE.md](https://github.com/oxc-project/tsgolint/blob/main/ARCHITECTURE.md).

[^tsgolint-versioning]: oxc-project/tsgolint, [Issue #481: Versioning after official TypeScript 7 release](https://github.com/oxc-project/tsgolint/issues/481).

[^ts7-announcement]: Microsoft TypeScript, [Announcing TypeScript 7.0](https://devblogs.microsoft.com/typescript/announcing-typescript-7-0/) and [`typescript/v7.0.2` release](https://github.com/microsoft/typescript-go/releases/tag/typescript/v7.0.2).
