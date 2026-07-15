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

The intended public `@nseng-ai/*` package set is released locally through one transactional root command; no CI workflow is involved. Prerequisites are Node/pnpm at the workspace versions, npm authentication with publish access, Graphite authentication, and a clean non-trunk branch tracked by Graphite.

First run `just release-plan VERSION`. This read-only mode validates the concrete npm version, clean worktree, non-trunk Graphite-tracked source branch, deterministic release-branch collision, and canonical package inventory. It prints the intended stages, branch (`transactional-npm-release/vVERSION`, with unsupported branch characters sanitized), and ordered package set. It does not bump manifests, qualify or pack candidates, write a report, query npm, publish, or create a checkpoint.

Then run `just release VERSION` from an interactive TTY. A fresh transaction:

1. repeats preflight, coordinates every public source manifest and `ts/pnpm-lock.yaml`, and runs full no-write qualification;
2. packs the qualified roots into frozen `.tgz` candidates under ignored `ts/dist/releases/VERSION/`;
3. creates a dedicated release branch and commit with Graphite, staging only the coordinated manifests and lockfile;
4. classifies the complete candidate set against npm before any registry write;
5. asks once for the exact phrase `publish VERSION`, publishes only frozen tarball paths, and performs candidate-aware strict verification with propagation retries.

The command prints human-readable JSON evidence by default. `--format json` emits the stable Clinkr machine envelope, and `--json-schema` publishes its schema. The entrypoint also supports `-h`/`--help`, `--version`, and `--runtime`. Evidence contains the version, release commit, frozen candidates, registry classifications, completed writes, and final status. It never submits a PR or updates Objectives.

### Report and automatic resume

The ignored recovery ledger is always `ts/dist/releases/VERSION/report.json`. If it exists, `just release VERSION` automatically takes the same-version resume path and bypasses bump, qualification, candidate freezing, branch creation, and checkpoint creation. The report records a durable `checkpointing` transition before Graphite runs; if Graphite created the release commit but the following report write failed, resume adopts `HEAD` only when the release branch, `HEAD` parent, clean worktree, coordinated version, inventory, and frozen candidates prove that exact checkpoint. Any disagreement stops. Resume otherwise requires all of these invariants before npm is queried:

- the worktree is clean;
- the current branch and `HEAD` exactly match the report's release branch and release commit;
- every canonical source manifest is coordinated to the report/requested version;
- the report inventory and candidates exactly match the unchanged ordered public inventory;
- every candidate exists and its bytes match both recorded hashes.

Both hashes are mandatory: `integrity` is the exact npm `sha512-<base64>` value and `shasum` is the exact SHA-1 hex value. An existing registry version is skippable only when both registry values exactly equal the frozen candidate. Before each npm publish the report durably records that package as pending, then moves it to completed writes only after success. A pending write resumes only when registry metadata is exact; missing, mismatched, or unreadable registry state stops without republishing. Any other mismatch, unreadable identity, missing candidate, or changed hash stops before publication.

After a publication or verification failure, leave the report and candidates untouched, restore the exact release branch/commit with a clean worktree, and rerun `just release VERSION`. If a candidate or identity invariant cannot be restored, do not repack or edit the report: stop and choose a recovery version/strategy after inspecting registry state. A failure before the Graphite checkpoint can leave bump, qualification, or partial report effects; inspect and clean those local effects before restarting rather than treating the incomplete report as resumable.

### Lower-level diagnosis commands

The compatibility wrappers below delegate to the corresponding flat `ns-dev` commands. They remain available for diagnosis, but they do not replace the transactional flow:

- `just bump-version VERSION` coordinates source manifests and the lockfile without registry writes.
- `just publish-dry-run VERSION` runs the legacy full-set dry run without registry writes.
- `just publish VERSION` is the legacy direct publisher.
- `pnpm --dir ts run release:qualify-public --all --version VERSION` prepares and checks generated publish roots. `--skip-checks` and `--skip-dry-run` are diagnosis-only and are not release evidence.
- `pnpm --dir ts run release:verify-public --version VERSION --strict --candidate-report ts/dist/releases/VERSION/report.json` performs candidate-aware, read-only strict registry verification. Without `--strict`, missing or mismatched packages are reported without a failing exit.

Package-local `pack:local` and `publish:dry-run` wrappers use `ns-dev prepare-source-publish-package` as the canonical publish-root preparation command.
