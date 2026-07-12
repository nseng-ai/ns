# TypeScript Package Taxonomy

This tree is a projection of the canonical `ns.tier` classification: each package's declared tier determines its directory, enforced tier→directory by the style-guard rule `NS_TS_TIER_DIRECTORY_PROJECTION` (ADR 0033). The projection map is `capability`→`capabilities/`, `neutral-infra`→`infra/`, `host`→`hosts/`, `standalone-tool`→`tools/`, `internal-tool`→`internal/`, plus the two top-level single-package homes below. Directories are a guard-enforced view, never an independent classification.

Structure *inside* a container package — which units earn `ns.subpackages` rank, naming, and importer rules — is governed by [`docs/conventions/subpackage-conventions.md`](../../docs/conventions/subpackage-conventions.md) (ADR 0022/0023).

## Top-level packages

- `sdk/` is the ns SDK and CLI package (`@nseng-ai/sdk`, tier `sdk`). It stays top-level by design.
- `capability-kit/` is the first-party Capability Kit substrate (`@nseng-ai/capability-kit`, tier `capability-kit`). It stays top-level by design and does not need a category wrapper.

## Category directories

- `infra/` contains below-SDK neutral packages such as core primitives, CLI framework support, Branch Memory, and Graphite support. Neutral means ns-independent, not effect-free: `@nseng-ai/foundation` is the home for generic infrastructure — including I/O-performing infrastructure such as `@nseng-ai/foundation/exec` — that passes ADR 0032's admission test (an ns-independent public contract plus a credible external-consumer scenario stated in reviewable prose). ns-shaped gateways and capability-building substrate stay in `@nseng-ai/capability-kit`. The former transitional domain-primitives package has been deleted; shared first-party capability-building primitives now live under precise `@nseng-ai/capability-kit/*` subpaths.
- `capabilities/` contains first-party capabilities that are already in the category directory, including standalone capabilities and converted/certified capability extensions.
- `hosts/` contains presentation/runtime hosts such as Pi.
- `internal/` contains tested, repo-internal tooling under the reserved `@internal/*` scope — package-grade code that exists only to operate this repo, not to ship as part of ns-the-product. It is the middle rung between `.ns/*` prototypes and platform packages.
  - **Promotion ladder:** `.ns/*` prototype → `packages/internal/*` (tested workspace citizen) → platform package. An internal package is the tested home for consumer-side tooling that has outgrown an in-place `.ns/*` prototype but is not yet (or never will be) a platform capability; if it earns platform status it graduates out of the space. See [`docs/conventions/platform-and-consumer.md`](../../docs/conventions/platform-and-consumer.md).
  - **`internal/` vs `tools/`:** `internal/` packages are enforced to have no outside runtime dependents and are never published; `tools/` packages are standalone and potentially shippable. Choose `internal/` for repo-operating machinery, `tools/` for anything meant to stand on its own.
  - **Dependency semantics:** runtime dependencies (`dependencies`, `optionalDependencies`, `peerDependencies`) on `internal/*` from outside the space are banned inbound, enforced by the style-guard rule `NS_TS_INTERNAL_SPACE_ADMISSION` (path↔scope coupling, mandatory `private: true`, no outside runtime dependents). `devDependencies` and test-only consumption are allowed — the root `ts/package.json` consumes `@internal/pi-tools` as a `devDependency`, the sanctioned carve-out.
- `tools/` contains standalone tools that are off the capability-extension completion axis.

Package names, public import specifiers, binary names, and workspace dependency names are independent of this filesystem taxonomy and should remain stable unless an explicit package-rename plan says otherwise.

## Public package local release flow

The intended public `@nseng-ai/*` package set is released locally through root `just` commands; no CI workflow is involved.

1. Run `just bump-version VERSION` to update every intended public source manifest to the coordinated version and refresh `ts/pnpm-lock.yaml`. This command performs no npm registry writes.
2. Inspect the manifest/lockfile diff and run relevant local validation.
3. Run `just publish-dry-run VERSION` to print the exact package/version publish plan and run full-set qualification with `npm publish --dry-run`. This command allows a dirty worktree and performs no npm registry writes.
4. Commit the version changes so the worktree is clean.
5. Run `just publish VERSION` only from an interactive TTY. It requires a clean worktree, reruns the full no-write qualification, fails before publishing if any intended package already exists at `VERSION`, prints the publish plan, requires typing `publish VERSION`, publishes each generated root with `npm publish --access public`, and then runs strict registry verification with propagation-delay retries.
6. Record the strict verifier evidence in the Objective update for the release session.

`pnpm --dir ts run release:qualify-public -- --all --version VERSION` remains the lower-level no-write qualification command. It prepares `dist/publish` package roots with registry-compatible dependency specs, validates direct public `@nseng-ai/sdk/*` consumer resolution, rejects `workspace:`/`catalog:`/private-package leakage, and runs `npm publish --dry-run` for the generated roots. Use `--skip-checks` or `--skip-dry-run` only for local diagnosis; those modes are not release evidence.

Run `pnpm --dir ts run release:verify-public -- --version VERSION` to perform read-only npm registry readback for the full intended public package set. The verifier runs `npm view` for each expected package/version and reports registry `name`, `version`, `dist.tarball`, publish `time`, plus declared `bin` and top-level `exports` evidence. It does not publish packages or perform any registry writes. By default, missing or mismatched packages are printed but the command exits `0`; use `--strict` after an authorized publish when every package is expected to exist. The publish command wraps this strict verifier in multiple delayed attempts so npm registry propagation lag does not fail an otherwise successful publish immediately.

`just publish VERSION` has no resume mode. If publishing fails after some packages have been published, a rerun at the same version will fail the already-published precheck; choose a new version or implement an explicit future resume mode.
