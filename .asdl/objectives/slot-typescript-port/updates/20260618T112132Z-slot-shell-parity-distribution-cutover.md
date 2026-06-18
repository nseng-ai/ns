# Slot Shell Parity and Distribution Cutover

## Summary

Completed the selected `slot-typescript-port` slice: the TypeScript `slot` shell wrapper now has documented real-shell parity evidence, and the active/default distribution/config surface points to the TypeScript `@asdl/slot` standalone CLI while leaving `packages/asdl-slots/` as a dormant Python fallback artifact.

The real-shell check exposed one small wrapper robustness bug: with `set -e`, `read` can return non-zero when the directive file contains the intentionally bare destination string with no trailing newline. The wrapper now uses `IFS= read -r _slot_destination < "$_slot_cd_directive_file" || true` before `cd -- "$_slot_destination"`, preserving the bare directive-file contract while making the wrapper safe under the parity harness and stricter shell settings.

## Objective Impact

- Marked the OS-coupled row complete.
  - Ran a throwaway zsh parity check with:
    - temp `HOME=/var/folders/.../slot-real-shell.wJUepa/home`;
    - temp `SLOTS_ROOT=/var/folders/.../slot-real-shell.wJUepa/slots`;
    - temp `PATH` shim `/var/folders/.../slot-real-shell.wJUepa/bin/slot` invoking `node ts/packages/slot/src/cli.ts`;
    - temp Git repo `/var/folders/.../slot-real-shell.wJUepa/repo`.
  - `slot shell install --shell zsh --format json` and `slot completion install --shell zsh --format json` wrote marker blocks only to the throwaway `.zshrc`.
  - Throwaway `.zshrc` contained the shell marker, completion marker, `SLOT_CD_DIRECTIVE_FILE`, and `compdef _slot_completion slot` exactly once.
  - A `zsh -f` shell sourced a wrapper-only rc file, ran `slot goto -n 1 --no-clipboard`, and moved the parent shell to the managed slot path:
    `/private/var/folders/.../slot-real-shell.wJUepa/slots/repos/repo/worktrees/slot-01`.
  - The same zsh wrapper ran `slot goto -n 1 --no-clipboard --format json`, left the parent shell at the throwaway repo path, and emitted parseable JSON.
  - No real `~/.zshrc`, `~/.bashrc`, `$HOME/.local/bin/slot`, real `~/.slots`, or non-throwaway worktree was touched.
- Recorded best-effort bash parity in the same sandbox.
  - `slot shell install --shell bash --format json` and `slot completion install --shell bash --format json` wrote marker blocks only to throwaway `.bashrc`.
  - `.bashrc` contained the shell marker, completion marker, `SLOT_CD_DIRECTIVE_FILE`, and `complete -F _slot_completion slot` exactly once.
  - `bash --noprofile --norc` sourced a wrapper-only rc file; human `slot goto` moved the parent shell to the managed slot path, JSON mode left it at the repo path, and JSON parsed successfully.
- Marked the distribution/config cutover row complete.
  - Root `pyproject.toml` no longer includes `asdl-slots` in the uv workspace, uv sources, optional plugin dependency, dev dependency group, Ruff source/first-party lists, pytest testpaths, or ty include list.
  - Ruff excludes `packages/asdl-slots/` so the dormant fallback is no longer part of the active root lint surface.
  - Root scenario/plugin tests no longer import `asdl_slots` or smoke-test the parked Python plugin surface.
  - `packages/asdl-slots/pyproject.toml` no longer declares the `slot` console script or `asdl.plugins` entry point.
  - `just publish` no longer builds `asdl-slots`.
  - Existing `just install-slot` and `install-tools` TypeScript source-shim routing remain intact; `just install-slot` was not run.
  - Added `ts/packages/slot/README.md` documenting `@asdl/slot` as the TypeScript default, the `just install-slot`/`install-tools` source-shim model, shell/completion behavior, JSON no-cd behavior, and the lack of a TypeScript `asdl.plugins` analog.
  - Updated `packages/asdl-slots/README.md` with a legacy fallback notice and removed active standalone/plugin claims.
  - Updated `uv.lock`; `uv lock` removed `asdl-slots v0.1.0`.

Validation run for this update:

- Throwaway zsh real-shell parity: pass.
- Best-effort bash parity smoke: pass.
- `pnpm --dir ts/packages/slot run test`: pass, 26 files / 157 tests.
- `pnpm --dir ts/packages/slot run check`: pass.
- `pnpm --dir ts run check`: pass.
- `pnpm --dir ts run test`: pass, 259 files / 2638 tests.
- `uv lock --check`: pass.
- Initial `just python-check`: failed because root active surfaces still reached dormant `packages/asdl-slots` tests/import sorting and root plugin tests still imported `asdl_slots`; this was treated as cutover drift, not ignored.
- `just fix`: pass after removing active root `asdl_slots` plugin tests and excluding the dormant package from Ruff.
- `just python-check`: pass.
- `just python-test`: pass, 795 tests.
- `just dprint-check`: initially found roadmap Markdown formatting; `just dprint-fix` formatted it.
- `uv sync`: removed stale editable `asdl-slots==0.1.0` from the local project environment.
- `uv run python - <<'PY' ... importlib.util.find_spec('asdl_slots')`: returned `None`, confirming the active Python environment no longer exposes the fallback package.
- Final `just check` after `uv sync`: pass, including agent-instructions check, Ruff, ty, dprint, full TS workspace check/test, and Python tests (795 tests).

## Follow-Ups

- The later Python fallback retirement/deletion row remains open. It should delete `packages/asdl-slots/` source/tests/docs, scrub remaining dormant fallback references, and record a rollback reference commit after the full gates are satisfied.
- `slot gt exec stack-map-branches` remains deferred unless a live consumer appears.
- A real `just install-slot` smoke against `$HOME/.local/bin/slot` remains out of scope and should only run with explicit human permission.
