# Roadmap

## Work

- [x] Inventory the current public `brmem` contract.
  - Evidence includes the public skill (`.agents/skills/brmem/SKILL.md`), package `AGENTS.md`, `packages/brmem/CONTEXT.md`, group registration, `ref_layout.py` / `key_validation.py` / `content_limits.py`, the `pyproject.toml` console script, operation modules, gateway/fake/real storage modules, and scenario/unit/integration tests.
  - The durable/incidental classification is recorded in `brmem-contract-inventory.md`, covering operations, flags, `--format json` envelopes, exit codes, git-ref layout, Entry Locator, key/namespace/branch rules, content limits, copy/export behavior, prompt resolution, and likely incidental Python implementation details.
  - Policy: read-only inventory and checked-in Objective/doc updates are directly executable.
  - Evidence: `brmem-contract-inventory.md` plus Semantic Update `updates/2026-06-13T150000Z-brmem-contract-inventory.md`.

- [x] Define the TypeScript migration boundary and package shape for `brmem`.
  - Decide the `ts/packages/brmem` package layout, library vs CLI export surface, the clinkr command tree, and the git-gateway interface (ref/blob/tree plumbing) with its in-memory fake.
  - Confirm the standalone-only boundary (no plugin) and that existing TS consumers are out of scope.
  - Policy: package scaffold, gateway interface, and compatibility docs are directly executable; installed-shim distribution and Python deletion are deferred to their own rows.
  - Evidence: `ts/packages/brmem` now has package metadata, curated exports, a Clinkr CLI shell, package-local gateway contracts, fake and real git-backed gateways, and Semantic Update `updates/2026-06-13T171806Z-typescript-brmem-first-slice.md`.

- [x] Port the git-ref storage layer and prove cross-language parity.
  - Port the `ref_layout` encoding (`refs/brmem/base|ns/...`, branch `/` → `---`), snapshot-tree construction, and Entry Locator formatting onto the git gateway.
  - This is the keystone seam: prove round-trip interoperability — entries written by Python are readable/listable by TypeScript and vice versa through the same refs — in a throwaway test repository.
  - Policy: directly executable after preview with fake and local-throwaway-repo git gateways. Ask before any change to the ref layout, branch encoding, or Entry Locator.
  - Evidence: `ts/packages/brmem/test/gateways/python-parity.test.ts` covers Python-written Base/named/nested Entries read and listed by TypeScript, TypeScript-written workflow Namespace Entries read and checked by Python, and TypeScript key-glob copy preserving Python-readable destination Entries. Real-git and fake-gateway tests cover snapshot-tree writes, deletes, copy conflicts, historical reads, and ref/locator helpers.

- [x] Port read-only operations: `get`, `check`, `list`.
  - Preserve `get` human-mode content-only output, `check` exit codes (`0`/`1`/`2`) and metadata, `list` single-branch and `--all-branches` behavior, `--at` historical lookup, and `--format json` envelopes.
  - Policy: directly executable after preview on the proven storage seam. Ask before changing exit-code or envelope semantics.
  - Evidence: TypeScript scenario tests cover `get`, `check`, and `list` human/JSON behavior, exit codes, branch/namespace resolution, hidden-command boundaries, and history-at reads; workspace validation passed for the branch evidence.

- [ ] Port write operations: `put` and `delete`.
  - Preserve overwrite semantics, `--file` / `--stdin` input modes, content limits (UTF-8, binary rejection, 1 MiB `--force` cap), Entry Key validation, detached-HEAD-when-branch-omitted handling, and post-mutation reporting (branch, namespace/base, key, Entry Locator, commit).
  - Policy: directly executable after preview with fake/local-throwaway-repo gateways. Ask before changing content limits or key/namespace validation.
  - Evidence: fake-driven and scenario tests for success, overwrite, validation-failure, and abort paths.

- [ ] Port `copy` and `export`.
  - `copy`: exactly-one-scope (`--base` / `--namespace`), `--key-glob` (where `*` matches `/`), conflict-abort-unless-`--overwrite`, `--dry-run`, cross-branch behavior.
  - `export`: base-only-when-namespace-omitted, fresh-temp-dir default, per-key relative paths, pre-write safety checks, `--overwrite`, `--dry-run`, `--format json` planned/exported paths and sizes.
  - Policy: directly executable after preview. Ask before changing copy-scope or export safety/abort semantics.
  - Evidence: scenario tests for scope selection, glob matching, conflict/abort, dry-run, and export path safety.

- [ ] Port `exec resolve-prompt`.
  - Preserve `.brmem/prompts/...` project/global tier resolution, `data.path` / `data.tier` JSON output, and exit-`2` failure surfacing.
  - Policy: directly executable after preview. Ask before changing prompt search order or tier semantics.
  - Evidence: scenario tests for project tier, global tier, and resolution failure.

- [ ] Cut over the public skill, wrapper, and distribution paths to the TypeScript default.
  - Make the standalone TypeScript `brmem` CLI the default invocation surface; provide a run-from-source shim installed by a `just` recipe (mirroring `pr-address`), allowed to require an asdl checkout with `ts/node_modules`.
  - Update the public skill and developer/distribution docs to point at the TypeScript path.
  - Policy: docs, wrapper behavior/tests, and local-checkout behavior are directly executable after preview. npm/PyPI publishing and checkout-free bundling are out of scope unless a new requirement is explicitly accepted.
  - Evidence: shim resolution checks (enclosing-worktree vs baked checkout, missing-`node_modules` failure) and updated skill/docs.

- [ ] Retire Python fallback and delete `packages/brmem` from active paths.
  - Gate on full operation parity, cross-language storage parity, run-from-source distribution evidence, and skill/docs naming the TypeScript CLI as the sole surface.
  - Remove the console script wiring, scrub workspace/config/test references, and record the post-deletion rollback reference.
  - Policy: the final gated deletion is directly executable once the gates are evidenced; otherwise ask before broad deletion. Validate with full `just`, not just the TS package.
  - Evidence: full-repo validation, grep guards clean, CLI smoke, and an Objective update recording the rollback reference.

- [ ] Feed lessons into the umbrella porting playbook.
  - Record reusable git ref/blob/tree plumbing and cross-language parity lessons for later capability ports; recommend any second-consumer-proven gateway seam to `ts-cli-foundation`.
  - Policy: directly executable once repeated evidence exists; do not generalize from a single operation slice.
  - Evidence: an update to `.asdl/objectives/port-asdl-toolkit-to-typescript/porting-playbook.md` and the umbrella ledger/roadmap reflecting brmem as TS-default.

## Parked

- Migrating existing TypeScript consumers (`@asdl/core/brmem-cli.ts` launcher, `branch-context/brmem-gateway.ts`) onto native brmem — deliberate follow-up outside this Objective; revisit once native brmem is TS-default.
- Extracting a shared git ref/blob/tree gateway into `@asdl/core` — keep brmem's plumbing package-local until a second consumer proves the seam, then coordinate with `ts-cli-foundation`.
- npm registry publishing and checkout-free bundled distribution of `brmem` — not required under the accepted run-from-source shim model; revisit only if a registry or checkout-free consumer appears.
- Any redesign of the git-ref storage layout, Entry Locator, or Entry Key / Namespace rules — frozen while Python and TypeScript must interoperate.
