# Roadmap

## Work

- [x] Inventory the current public `handoff` contract and confirm plugin-retirement policy.
  - Deliverable: `contract-inventory.md` reviewed against the current Python package, skills, Pi extension code, root plugin tests, and package context.
  - Contract sources to inspect before editing implementation: `packages/asdl-handoff/CONTEXT.md`, `packages/asdl-handoff/pyproject.toml`, `packages/asdl-handoff/src/asdl_handoff/cli/handoff/*.py`, `packages/asdl-handoff/src/asdl_handoff/testing/fake_brmem_gateway.py`, `packages/asdl-handoff/tests/scenario/test_handoff_cli.py`, `.agents/skills/handoff*.md`, `skills/handoff*.md` if present, `ts/packages/pi-extensions/src/handoff.ts`, `ts/packages/pi-extensions/src/handoff/shared.ts`, `tests/scenario/test_plugins.py`, `justfile`, and `CONTEXT-MAP.md`.
  - Classify durable contract vs incidental implementation detail. Durable by default: command names, flags, JSON data fields, exit codes, Handoff Namespace/key/slug rules, Branch State values, markdown table shape, interactive confirmation semantics, and stderr/stdout separation under JSON mode. Incidental by default: exact Rich table bytes, exact Commander/Click usage wording, Python module boundaries, and Python plugin mechanics unless active user-facing usage proves otherwise.
  - Policy: direct documentation/inventory edits are allowed. Stop if active docs/skills instruct users to run `asdl handoff`; ask whether to preserve the plugin or retire it with compatibility notes.
  - Evidence: checked-in contract inventory plus focused grep evidence for plugin usage and public command references.

- [x] Add `@asdl/clinkr` markdown renderer support if still needed.
  - Current planning evidence: TypeScript Clinkr accepted `--format markdown` and `--format md`, but `ts/packages/clinkr/src/group.ts` routed them through the human channel until a `renderMarkdown` hook existed. Python `handoff list` has a distinct markdown renderer and tests assert markdown table output.
  - Implemented the smallest framework change: an optional `renderMarkdown` command spec field; `--format md` normalizes to markdown; markdown/md use `renderMarkdown` for ok exits when present and fall back to `renderHuman`/indented JSON when absent; JSON, legacy machine output, raw commands, and non-ok exits remain unchanged.
  - Policy: direct execution after preview. Ask before changing machine-envelope behavior, failure exit codes, raw command behavior, or unrelated Clinkr surface semantics.
  - Evidence: local branch diff against `add-handoff-typescript-port-objective`; PR #1504 corroborates the same file set; `pnpm --dir ts/packages/clinkr run check`; `pnpm --dir ts/packages/clinkr run test`; `pnpm --dir ts run check`; `pnpm --dir ts run test`; `git diff --check`.

- [x] Scaffold `ts/packages/handoff` and port `handoff list` as the first vertical slice.
  - Package identity: npm/workspace package `@asdl/handoff`, bin `handoff`, version `0.1.0`, root export `./src/index.ts`, Node ESM, strict TS, Vitest, dependencies on `@asdl/clinkr`, `@asdl/core`, `@asdl/brmem`, and `zod`.
  - Initial files: `package.json`, `tsconfig.json`, `README.md`, `CONTEXT.md`, `src/cli.ts`, `src/context.ts`, `src/contracts.ts`, `src/identity.ts`, `src/inventory.ts`, `src/brmem-gateway.ts`, `src/real-brmem-cli-gateway.ts`, `src/fake-brmem-gateway.ts`, `src/operations/list.ts`, `src/operations/shared.ts`, `src/index.ts`, and focused tests under `test/scenario`, `test/gateways`, and `test/support`.
  - CLI runtime: `handoff --runtime` should print `runtime: typescript` and `entry_point: @asdl/handoff bin handoff -> ts/packages/handoff/src/cli.ts`.
  - `list` must preserve `--branch`, `--all`, `--include-deleted`, JSON fields, markdown table rows, current-branch resolution, deleted-branch filtering, namespace/key filtering, and sorting.
  - Policy: direct execution after preview. Ask before changing `--all` to `--all-branches`, changing `branch_state`, changing JSON fields, or dropping markdown output.
  - Evidence: TypeScript package files under `ts/packages/handoff/**`; scenario tests for help/version/runtime/list and exact markdown sorting; fake gateway coverage; validation passed with `pnpm --dir ts/packages/handoff run check`, `pnpm --dir ts/packages/handoff run test`, `pnpm --dir ts run check`, `pnpm --dir ts run test`, and `just`.

- [x] Port `handoff delete`.
  - Preserve command shape: `handoff delete [--branch <branch>] [-f|--force] <slug>`.
  - Preserve slug validation: non-empty slug, no `.md` suffix, no `/`, generated Handoff Key `<slug>.md`, Branch Memory Entry Key validation through public `@asdl/brmem` helpers.
  - Preserve branch behavior: explicit `--branch` works in detached HEAD; omitted branch uses current branch; detached HEAD error says to pass `--branch <branch>`.
  - Preserve confirmation behavior: prompt on stderr when not forced; `y`/`yes` deletes; empty/`n`/`no` cancels; invalid input repeats; JSON stdout remains machine-readable.
  - Preserve JSON fields: `branch`, `slug`, `key`, `entry_locator`, `deleted`, `cancelled`, `commit`.
  - Policy: direct execution after preview with fake and throwaway-repo tests. Ask before changing prompt text/stream semantics, force behavior, slug rules, or missing-handoff error type.
  - Evidence: TypeScript `delete` operation and scenario tests cover force, explicit deleted branch, interactive accept/decline with JSON stdout separation, slug/branch validation, not-found, and detached-head behavior; validation passed with focused package gates, TypeScript workspace gates, and `just`.

- [x] Port `handoff gc`.
  - Preserve command shape: `handoff gc [--dry-run] [-f|--force]`.
  - Preserve `--dry-run`/`--force` conflict with error type `conflicting_flags`.
  - Preserve actions: `kept_active`, `would_delete`, `deleted`, `error`.
  - Preserve count fields: `would_delete_count`, `deleted_count`, `kept_count`, `error_count`, `dry_run`, `cancelled`.
  - Preserve interactive behavior: preview and prompt on stderr under JSON mode; no prompt when no candidates; declined confirmation returns success with `cancelled: true` and no deletion.
  - Policy: direct execution after preview with fake and throwaway-repo tests. Ask before changing candidate classification, action names, count semantics, or confirmation behavior.
  - Evidence: TypeScript `gc` operation and scenario tests cover dry-run, force deletion, interactive accept/decline with JSON stdout separation, no-candidate behavior, and `--dry-run`/`--force` conflict; validation passed with focused package gates, TypeScript workspace gates, and `just`.

- [x] Cut over public shim, install recipe, skills, and docs to the TypeScript default.
  - Add `ts/packages/handoff/scripts/handoff-shim`, modeled on `ts/packages/brmem/scripts/brmem-shim`: inside an asdl checkout, run enclosing checkout source; outside, run baked canonical checkout; require `ts/node_modules`; fail clearly with `just ts-install`, `just install-handoff`, or `just install-tools` instructions.
  - Add `just install-handoff` through the shared `_install-ts-shim` helper.
  - Update `just install-tools` to install TypeScript `handoff` shim instead of uv-installing Python `packages/asdl-handoff`, while keeping Python package present until deletion.
  - Refresh README/skills/docs so public install/runtime instructions point to the TypeScript path. Keep command snippets stable unless inventory proves they were stale.
  - Policy: direct execution after preview. Ask before changing the accepted run-from-source distribution model, publishing to npm/PyPI, or changing skill create/pickup workflow semantics.
  - Evidence: `ts/packages/handoff/scripts/handoff-shim`; wrapper tests; `just install-handoff`; bare `handoff --runtime` reports TypeScript after removing a stale project-venv console script; `handoff --help`; `handoff list --format json`; docs/context updates; focused TS validation; dprint validation; full `just`.

- [ ] Retire the Python fallback and remove the `asdl handoff` plugin path.
  - Gate on complete TypeScript operation parity, real shim evidence, docs/skills pointing to TS, and explicit plugin-retirement decision.
  - Delete `packages/asdl-handoff` from active source paths.
  - Remove Python workspace/source/dev/optional dependency entries, Ruff source and first-party config, pytest testpaths, publish package list, and handoff plugin smoke imports/tests.
  - Move active Handoff package context from `packages/asdl-handoff/CONTEXT.md` to `ts/packages/handoff/CONTEXT.md` and update `CONTEXT-MAP.md` relationships.
  - Record rollback/reference commit: the last commit containing `packages/asdl-handoff` before deletion.
  - Policy: ask before starting broad deletion if any parity or plugin-retirement gate is missing. Once gates are evidenced, direct deletion is allowed after preview. Validate with full `just`, not only TypeScript package tests.
  - Evidence: `uv lock --check`; focused plugin/root Python tests updated and passing; TS package/workspace checks/tests; final `just`; runtime smoke after install.

- [ ] Feed lessons into the umbrella TypeScript migration Objective and close this child Objective when ready.
  - Update `.asdl/objectives/port-asdl-toolkit-to-typescript/objective.md` migration ledger to mark Handoff / `handoff` as TS-default with Python package retired.
  - Update umbrella roadmap with Handoff completion evidence and next capability (`objective`) per persisted order.
  - Update umbrella `porting-playbook.md` with lessons: Branch Memory consumer capabilities can depend on the public TypeScript `brmem` CLI; per-entry timestamp semantics may require narrow package-local git plumbing; plugin retirement must be explicit; markdown rendering became a real Clinkr framework seam; create/pickup workflows can remain skill/Pi-owned while CLI owns inventory/admin.
  - Close `handoff-typescript-port` if completion criteria are satisfied.
  - Policy: direct Objective/doc updates after implementation evidence exists. Do not rewrite historical updates; append new Semantic Updates.
  - Evidence: Semantic Updates in this Objective and umbrella Objective; dprint validation; final validation references.

## Parked

- Adding `handoff create` or `handoff pickup` CLI operations. These remain skill/Pi workflows unless a separate design decision expands the CLI surface.
- Migrating Pi `/handoff:create`, `/handoff:pickup`, `/handoff:list`, or `/ccc:handoff-tab` UX logic into `@asdl/handoff`. The TS package should only preserve CLI contracts needed by those consumers.
- Preserving `asdl handoff` through a Python shim after standalone TS cutover. Revisit only if fresh inventory finds active consumers that cannot use standalone `handoff`.
- Shared Branch Memory consumer abstractions in `@asdl/core`. Keep the Handoff gateway package-local until a second consumer proves the seam.
- Exposing per-entry updated timestamp as a new public `brmem` operation/API. Handoff may keep narrow read-only git plumbing locally for now.
- npm registry publishing or checkout-free bundled distribution.
- Redesigning Handoff Artifact storage, introducing manifests/indexes, or changing namespace/key layout.
