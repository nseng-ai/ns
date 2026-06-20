# Plugin retirement + Python package deletion (endgame branches 7+8)

## Summary

Executed the two remaining destructive endgame rows as one combined feature branch
(`retire-pr-address-python-package-and-bridge`). The `asdl pr-address` plugin is retired,
the Python `packages/asdl-pr-address` package is deleted, the TypeScript legacy-Python
bridge is fully severed, and the golden corpus is relocated into the TS package. The
standalone TypeScript `pr-address` CLI (run-from-source shim) is now the sole invocation
surface.

Re-derived every edit from the current code (the older
`.claude/plans/plan-the-deletion-of-humming-tide.md` was stale and ignored). Work ran as a
multi-agent session: two concurrent file-disjoint territories (TS, DOCS), then a sequential
PY deletion gated on the golden relocation, then full-repo validation.

## What changed

### Branch 7 — plugin retirement

- `packages/asdl-pr-address/src/asdl_pr_address/cli/plugin.py` removed wholesale by the
  package deletion; the `asdl.plugins` entry point goes with it.
- `tests/scenario/test_plugins.py`: deleted `test_pr_address_plugin_integration` and its
  lone `PrAddressCliContext` import; the now-unused `PRSummary` import (used only by that
  test) was dropped by `just fix`. Shared plugin-test helpers (`FakePluginEntryPoint`,
  `FakePRGateway`, etc.) preserved — other plugin smoke tests still use them.
- Docs scrubbed of "the `asdl pr-address` plugin exists" / "legacy Python path" claims.

### Branch 8 — Python deletion + TS bridge severance

- **Golden corpus relocated** via a single `git mv packages/asdl-pr-address/tests/golden →
  ts/packages/pr-address/test/fixtures/golden` (219 tracked files, history preserved as
  renames). `GOLDEN_V1_ROOT` in `test/support/golden.ts` repointed to
  `../fixtures/golden/v1`; `REPO_ROOT` left unchanged (still used by other test files).
- **TS bridge removed:** deleted `src/legacy-python.ts` and `src/repo-root.ts`; removed the
  unknown-operation router block and the now-unused `formatErrorMessage` import from
  `src/cli.ts`; removed the `legacy` field/import/construction from `src/context.ts`.
  Unknown `exec <op>` (and `exec <op> --json-schema`) now falls through to clinkr natively
  → exit `2`, stderr `error: unknown command '<op>'\n`. This is a deliberate, documented
  behavior change (no Python dispatch).
- **TS bridge tests rewritten:** deleted the legacy gateway support/test files; collapsed
  `run-scenario.ts` to a single `runScenario` with no `legacy` field; dropped
  `LegacyPrAddressGateway` from the in-memory context; migrated every
  `runScenarioWithLegacy` caller (incl. the bespoke harness in
  `stack-feedback-preflight.test.ts`) to `runScenario` and stripped `run.legacy.calls`
  assertions / `legacyExitCodes` options; the two bridge-behavior tests now assert native
  clinkr unknown-command behavior.
- **Package deleted:** `git rm -r packages/asdl-pr-address`.
- **Config scrubbed:** all seven `asdl-pr-address`/`asdl_pr_address` entries removed from
  root `pyproject.toml` (workspace members, uv.sources, optional-dependencies plugins,
  dependency-groups dev, ruff src, ruff isort known-first-party, pytest testpaths);
  `--package asdl-pr-address` dropped from the `justfile` `publish` recipe
  (`install-pr-address`, the TS shim, left intact); `uv.lock` regenerated via `uv sync`.
- **TS README** reframed: dropped the legacy-Python compatibility-fallback framing; rollback
  is now the independently published PyPI `uvx --from asdl-pr-address==0.1.1 pr-address`,
  unrelated to the deleted in-repo source.

## Validation evidence

Full `just` green from repo root (validated end-to-end):

- ruff check / ruff format (461 files) / ty: all pass.
- ts check: all 9 workspace projects type-clean, including `packages/pr-address`.
- ts test (vitest): 160 files, 2013 tests, 0 failures.
- pytest: 2142 passed; `test_plugins.py` still green with the other plugins wired.
- dprint check: clean.

Guards:

- `grep -rn "asdl_pr_address|asdl-pr-address" --include='*.py' --include='*.toml' .` → zero
  matches (no live workspace/dependency/source wiring remains).
- `grep -rn "legacy-python|repo-root|InMemoryLegacyPrAddressGateway|findLegacyCheckoutRoot|pr-address-py" ts/packages/pr-address`
  → clean, except the intentional `uvx 0.1.1` rollback note in the TS README.
- CLI smoke: `node ts/packages/pr-address/src/cli.ts exec not-a-real-op` and the same with
  `--json-schema` → both exit `2`, stderr `error: unknown command 'not-a-real-op'\n`.
- Golden corpus confirmed at `ts/packages/pr-address/test/fixtures/golden/v1`;
  `packages/asdl-pr-address` no longer exists.

## Objective Impact

- Roadmap `[~]` "Cut over public skill, wrapper, plugin, and distribution paths to
  TypeScript default" → `[x]`: plugin retired, docs name the standalone CLI as the sole
  surface, run-from-source shim is the accepted installed model.
- Roadmap `[ ]` "Retire active Python fallback paths and fully delete
  `packages/asdl-pr-address`" → `[x]`: TS unknown-operation Python fallback removed, package
  deleted, references scrubbed, full-repo validation green. External rollback remains PyPI
  `asdl-pr-address==0.1.1`.
- Remaining endgame work: branch 9 (`playbook`) — feed lessons into the umbrella porting
  playbook.

## Follow-Ups (findings, not fixed here — out of this branch's scope)

- **Pre-existing AGENTS.md drift:** the "exec Subgroups" canonical-examples list cites
  `packages/asdl-core/src/asdl_core/brmem/group.py`, but brmem lives at
  `packages/brmem/src/brmem/group.py`. Unrelated to the pr-address removal; left untouched.
- **Optional TS hygiene:** tighten singular `read-feedback-detail` payload-path validation
  for parity with Python (carried over from the parity audit; never gated deletion).

## Notes

PR submission is out of scope for this launch. No commits/push/submit were made by the
implementation agents; changes are staged in the working tree on the feature branch.
