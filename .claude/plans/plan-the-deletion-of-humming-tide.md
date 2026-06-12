# Delete the Python `pr-address` package (and retire the TS legacy-Python bridge)

## Context

The PR-feedback tool `pr-address` exists twice in this repo:

- **Python** — `packages/asdl-pr-address/` (import `asdl_pr_address`), the original implementation. Standalone console script `pr-address-py`, plus an `asdl pr-address` plugin subgroup.
- **TypeScript** — `ts/packages/pr-address/` (`@asdl/pr-address`), the **live** implementation. The `pr-address` binary on `PATH` (installed by `just install-pr-address`) is a shim over the TS sources.

The TS port is complete: all 19 `exec` operations run in TypeScript. The Python package now survives only as (a) a source of golden test fixtures the TS tests load, and (b) the target of a "legacy bridge" the TS CLI falls back to for a few invalid-flag click error messages and the unused `asdl pr-address` plugin. Every skill, collector, and doc that actually *runs* pr-address invokes the TS `pr-address` binary, not the Python one.

This change deletes the Python package, ports its golden fixtures into the TS package, and **fully retires** the TS legacy-Python bridge so nothing in the repo depends on the Python implementation at runtime.

**Key exploration finding — there is no transitively-exclusive shared code to delete.** Everything `asdl-pr-address` imports from `asdl-core` (`clinkr`, `gh`, `git`, `payloads`, `plugin`) is heavily used by other packages (asdl-slots, aretro, asdl-handoff, asdl-objectives, brmem, roaster, etc.). Nothing in `asdl-core` becomes dead. `roaster` is independent (pr-address never imports it). So the deletable Python surface is the `asdl-pr-address` package itself — the rest of the work is removing references and retiring the now-orphaned TS bridge.

### Scope decisions (confirmed with user)

1. **TS legacy bridge → fully retire.** Delete `legacy-python.ts`, `repo-root.ts`, and all five `{ type: "fallback" }` routes; render those invalid-flag cases natively in TS and fail unknown operations natively. This is a deliberate behavior change (those edge cases now return a TS `invalid_request` envelope / exit 2 instead of Python click's usage-error text). It consciously overrides the README's per-operation "fallback retirement" protocol, which is documented as part of this change.
2. **Reference cleanup → fix stale mentions too.** Repoint AGENTS.md canonical examples, drop the CONTEXT-MAP planned entry, and fix stale Python-specific mentions in skills / docs-site install instruction / TS README. **Keep** the docs-site tool pages (they describe the surviving TS tool) and **keep** the historical `.asdl/objectives/pr-address-*` records.

---

## Phase A — Port golden fixtures into the TS package

The TS scenario tests load fixtures from `packages/asdl-pr-address/tests/golden/v1/` at module-load time. Move them so the Python tree can be deleted without breaking TS.

- **Move** the whole tree `packages/asdl-pr-address/tests/golden/` (the `v1/` dir — 9 operation subdirs, 219 files — and `README.md`) → **`ts/packages/pr-address/test/fixtures/golden/`** (alongside the existing `test/fixtures/json-schemas/`). Use `git mv` to preserve history.
- **Update the three consumers** to resolve the new in-package path relative to the test file instead of via repo root. In each, replace:
  ```ts
  const GOLDEN_ROOT = join(REPO_ROOT, "packages/asdl-pr-address/tests/golden/v1");
  ```
  with a path resolved from the test file, e.g.:
  ```ts
  const GOLDEN_ROOT = fileURLToPath(new URL("../fixtures/golden/v1", import.meta.url));
  ```
  Files:
  - `ts/packages/pr-address/test/scenario/classification-core.test.ts` (line 16; also the literal `join(GOLDEN_ROOT, ...)` reads at 126/155/186/218 keep working unchanged)
  - `ts/packages/pr-address/test/scenario/mutation-operations.test.ts` (line 14)
  - `ts/packages/pr-address/test/scenario/payload-finalization.test.ts` (line 16; lines 137/142/149 keep working)
- Drop the now-unused `REPO_ROOT` constant from any of those files where it was only used for `GOLDEN_ROOT` (payload-finalization and mutation-operations; classification-core — check for other uses). Keep the `fileURLToPath`/`URL` imports.

Verify: `pnpm --dir ts --filter @asdl/pr-address run test` is green with the Python tree still present, proving the fixture move alone is correct before deletion.

---

## Phase B — Delete the Python package

- **Delete the directory** `packages/asdl-pr-address/` in full (src, tests — golden already moved in Phase A, `README.md`, `docs/development.md`, `pyproject.toml`). This removes the `pr-address-py` console script and the `asdl pr-address` plugin entry point.

---

## Phase C — Remove root config, build, and plugin-test references

These are correctness-required (build/tests/lint must stay green).

- **`pyproject.toml`** (root) — remove every `asdl-pr-address` / `asdl_pr_address` entry:
  - `[tool.uv.workspace] members` → `"packages/asdl-pr-address"`
  - `[tool.uv.sources]` → `asdl-pr-address = { workspace = true }`
  - `[project.optional-dependencies] plugins` → `"asdl-pr-address"`
  - `[dependency-groups] dev` → `"asdl-pr-address"`
  - `[tool.ruff] src` → `"packages/asdl-pr-address/src"`
  - `[tool.ruff.lint.isort] known-first-party` → `"asdl_pr_address"`
  - `[tool.pytest.ini_options] testpaths` → `"packages/asdl-pr-address/tests"`
- **`justfile`** — remove `--package asdl-pr-address` from the `publish` recipe (~line 110). Leave `install-pr-address` (it builds the TS shim, no Python dependency).
- **`tests/scenario/test_plugins.py`** — delete `test_pr_address_plugin_integration()` (lines ~216–254) and the top-level import `from asdl_pr_address.cli.pr_address.context import PrAddressCliContext` (line 19). This is a clean, localized deletion — its helpers (`FakePluginEntryPoint`, `_entry_point_source`, `FakePRGateway`, `FakeGitGateway`) are shared with the other plugin tests and stay. There is no parametrized plugin list to edit.
- **`uv.lock`** — regenerated automatically by `uv sync`/`uv lock`; no manual edit. Expect it to change.

---

## Phase D — Fully retire the TS legacy-Python bridge

The bridge is the runtime dependency on the Python implementation. Removing it severs that dependency entirely.

### D1 — `src/` changes

- **Delete files:** `ts/packages/pr-address/src/legacy-python.ts` and `ts/packages/pr-address/src/repo-root.ts`.
- **`src/context.ts`** — remove the `legacy` field from `PrAddressContext` and its construction in `createRealPrAddressContext()`. (Keep `github`/`git`/`payloadClock`.)
- **`src/operation-registry.ts`** — remove `{ type: "fallback" }` from the `ExecOperationDispatchResult` union (line 39). After this, the union is just `exit` | `raw-exit`.
- **`src/cli.ts` `runExecCommand`** — remove the `case "fallback"` arm and the entire trailing `try { return await deps.context.legacy.run(...) } catch { ... }` block (lines ~107–117). Replace the unknown-operation path: when `deps.registry.get(operation)` is `undefined` (and, for the `--json-schema` route, when `buildOperationSchemaDocument` returns `undefined`), emit a native error — stderr `Unknown operation: <op>\n\n` + `execHelp()`, return exit `2` — mirroring the existing top-level `Unknown command` handling (cli.ts lines 62–65). Also update the `execHelp()` "Current behavior" paragraph (line 144) to drop the "legacy Python pr-address CLI is invoked..." sentence.
- **Replace the five `{ type: "fallback" }` returns** with native `invalid_request` exits using the existing idiom (`failure("invalid_request", <message>)` → `{ type: "exit", exit: ... }`, same shape already used a few lines above each site):
  - `src/feedback-collection.ts:31` — invalid `--payload-mode` for `get-feedback`
  - `src/prepare-run.ts:44` — invalid `--payload-mode` for `prepare-run` (use the local `exitFailure` helper)
  - `src/stack-feedback.ts:292` — invalid `--stdout-mode` for `stack-feedback-prep` (use `exitFailure`)
  - `src/stack-feedback.ts:356` — invalid `--stdout-mode` for `stack-feedback-plan` (use `exitFailure`)
  - `src/summarize-feedback.ts:106` — non-integer `--body-chars` for `summarize-feedback` (use `failure(...)`)
  Pick clear messages, e.g. `--payload-mode must be 'inline' or 'payload'.`, `--stdout-mode must be one of: <STDOUT_MODES>.`, `--body-chars must be an integer.`
- **`src/index.ts`** — remove the two `./legacy-python.ts` export lines and the `./repo-root.ts` (`findLegacyCheckoutRoot`) export line. (`LEGACY_PR_ADDRESS_VERSION`, `RealLegacyPrAddressGateway`, `runProcessWithInheritedStdio`, the legacy types, and `findLegacyCheckoutRoot` all go.)
- **`src/operation-schemas.ts:13`** — comment mentions "legacy Python (Pydantic) request/result contracts"; reword to drop "legacy" (cosmetic, optional).

### D2 — Test changes (mechanical sweep across scenario tests)

The `legacy` gateway is threaded through almost every scenario test's local context. The pattern repeats, so apply it uniformly rather than per-line:

- **Delete** `ts/packages/pr-address/test/support/in-memory-legacy-pr-address-gateway.ts`.
- **In every scenario test that builds a CLI context with `legacy:`**, remove the `legacy: InMemoryLegacyPrAddressGateway` field from the local `CliRun`/context interface and its construction, drop the `InMemoryLegacyPrAddressGateway` import, and delete `expect(run.legacy.calls).toEqual([])` assertions. Affected files (representative — apply the same shape to each):
  `cli.test.ts`, `json-schema-routes.test.ts`, `repo-context.test.ts`, `readonly-collection.test.ts`, `map-branch-prs.test.ts`, `stack-feedback.test.ts`, `stack-feedback-diff-current.test.ts`, `stack-resolve-thread-payloads.test.ts`, `prepare-run.test.ts`, `payload-operations.test.ts`, `summarize-feedback.test.ts`, `mutation-operations.test.ts`. (Since the CLI no longer needs `legacy`, the `context` passed to `runCli` simply omits it.)
- **`cli.test.ts` — rewrite the bridge-specific tests:**
  - Delete the entire `describe("legacy Python fallback routing", ...)` block (lines 395–441) and the `RealLegacyPrAddressGateway` / `ProcessRunRequest` import.
  - Rewrite the three fallback-route tests (lines 105–131: "delegates exact exec args...", "preserves arbitrary operation argv...", "preserves nonzero legacy exit codes") to assert the **new native behavior**: invalid `--stdout-mode`/`--payload-mode` now returns exit `2` with the native `invalid_request` envelope (no delegation).
  - Add/repoint an unknown-operation test asserting exit `2` + `Unknown operation:` stderr.
- **`json-schema-routes.test.ts`** — the unknown-op `--json-schema` test (lines ~120–122) currently asserts delegation to legacy; rewrite to assert the native unknown-operation error.
- **`test/wrapper/pr-address-shim.test.ts`** — referenced by the README; confirm it tests only TS shim dispatch (no Python). Update only if it asserts the `pr-address-py`/`uvx 0.1.1` fallback.

### D3 — TS README

Rewrite `ts/packages/pr-address/README.md` to reflect that the Python implementation and bridge are gone:
- Line 5 / "Current migration status" (7–26): drop the "legacy Python CLI remains as a compatibility fallback" framing and the entire "Compatibility-backed behavior that must stay in place" list; state all behavior is native TS, including the previously-delegated invalid-flag cases (now native `invalid_request`).
- Line 35 "Rollback" and line 49 (`uv run pr-address-py`): the local Python package no longer exists. Either drop these or reframe rollback as the independently-published `uvx --from asdl-pr-address==0.1.1 pr-address` (still on PyPI, unrelated to the deleted source).
- "Fallback retirement" section (65–77): remove or replace with a one-line note that the fallback has been fully retired.

---

## Phase E — Fix stale doc/skill mentions

- **`AGENTS.md`** — repoint the canonical examples that cite the deleted package (keep the surviving co-cited examples, which exist on disk):
  - "CLI Scenario Testing Convention" (~line 132/134): replace the `pr-address` / `packages/asdl-pr-address/tests/scenario/` example with an existing CLI package's, e.g. `roaster` and `packages/roaster/tests/scenario/` (verify path during edit).
  - "Skill-Invoked CLI Commands (exec Subgroups)" (~line 140/145): drop the `pr-address exec get-reviews` example and the `packages/asdl-pr-address/src/asdl_pr_address/cli/pr_address/group.py` canonical path; keep the already-cited `packages/roaster/src/roaster/cli/roaster/exec/group.py` and `packages/asdl-core/src/asdl_core/brmem/group.py` (both confirmed present).
- **`CONTEXT-MAP.md`** — remove the planned `packages/asdl-pr-address/CONTEXT.md` bullet (~line 30) and the `asdl-pr-address → asdl-core...` relationship line (~line 60).
- **`skills/pr-address/SKILL.md`** and **`skills/pr-address/references/cli-reference.md`** — remove the now-false statements that the `asdl pr-address` plugin / legacy Python path still exists (SKILL.md ~lines 73–74; cli-reference legacy-compat note). The skill keeps invoking the TS `pr-address` binary, so no functional change. `skills/stack-address/` invokes TS `pr-address` and needs no change.
- **`docs-site/src/content/docs/start/installation.md`** — fix/remove the `uv tool install asdl-pr-address` (Python) instruction; the tool is now installed via `just install-pr-address`. Keep the other docs-site pages (`tools/pr-address.md`, `guides/addressing-pr-feedback.md`, `skills/pr-address.md`, etc.) — they document the surviving TS tool; only correct any Python-specific install/runtime references they contain.
- **`docs/adr/0004-pr-address-typescript-package-boundary.md`** — leave as a historical ADR (optionally append a closing note that the Python package was removed).

---

## Deliberately NOT deleted

- **`asdl-core`** and all its `clinkr`/`gh`/`git`/`payloads`/`plugin` modules — shared infrastructure, used everywhere. Nothing is pr-address-exclusive.
- **`roaster`** — independent package; pr-address never imported it.
- **`packages/asdl-reviewer`** — already not a workspace member; unrelated.
- **docs-site tool pages** and **`.asdl/objectives/pr-address-*`** — kept (live TS-tool docs; historical objective records).
- **Published `asdl-pr-address==0.1.1` on PyPI** — independent of the deleted source; remains available as a manual rollback if the README keeps that note.

---

## Verification

Run from the repo root (autofix lint/format failures with `just fix` / `just dprint-fix`, per AGENTS.md — do not hand-edit to satisfy the formatter):

1. **Python**: `uv sync` (regenerates `uv.lock`), then `just` (ruff + ty + pytest). Confirm:
   - The suite passes with no `asdl_pr_address` import errors.
   - `tests/scenario/test_plugins.py` passes (pr-address case removed; other plugins still wired).
   - No references to `asdl_pr_address` remain: `grep -rn "asdl_pr_address\|asdl-pr-address" --include='*.py' --include='*.toml' .` returns only intentional doc/rollback mentions.
2. **TypeScript**: `pnpm --dir ts run check` and `pnpm --dir ts run test` (or `just ts-test`). Confirm:
   - All scenario tests pass with golden fixtures resolved from `test/fixtures/golden/v1`.
   - The rewritten invalid-flag tests assert native exit `2` / `invalid_request` (no delegation), and unknown operations fail natively.
   - No `legacy`/`repo-root` references remain: `grep -rn "legacy-python\|repo-root\|InMemoryLegacyPrAddressGateway\|findLegacyCheckoutRoot\|pr-address-py" ts/packages/pr-address` is clean (allow only an intentional `uvx 0.1.1` rollback mention in the README).
3. **CLI smoke**: `node ts/packages/pr-address/src/cli.ts exec get-feedback 1 --payload-mode bogus` returns exit 2 with the native `invalid_request` message (not a Python click error); `... exec not-a-real-op` returns exit 2 with `Unknown operation:`.
4. **Branch/PR**: do the work on a feature branch (not `master`), via Graphite per the repo's source-control rules.
