# Rebaseline durable prose to the post-rename `sdl` namespace

## Summary

Trunk-explicit, non-closing rebaseline against current ground truth at HEAD. The Objective directory's last touch (baseline `a1cc7fb2b`) was the repo-wide "Rename repository namespace from asdl to sdl" commit, which moved `.asdl/` to `.sdl/` but left the durable prose written entirely in pre-rename `asdl`/`ASDL` terminology. Verification against HEAD:

- No skill-management subsystem package exists yet: `rg` for `agent-resources`/`assistant-resources`/`skill-management` matches only docs and `SKILL.md` files, and there is no `skills list`/`skills path`/`skills install` user CLI surface. Core implementation work remains unstarted; all roadmap rows stay `[ ]`.
- The repo is fully TypeScript: no `pyproject.toml`/`setup.py` anywhere. Even before the rename there was no `asdl` CLI bin — only `sdl` (`ts/packages/sdl`). The pre-rename `@asdl/core` package is now `@sdl/core`/`sdl-core`. The "core `asdl` CLI (possibly Python)" framing was therefore both stale and never grounded.
- `references/pup-skill-management-report.md` still present (verified).
- Reconcile targets still exist: the `skillx` skill (`skills/skillx/`) and the agent-registry CLI now packaged as `@sdl/areg` ("Manage SDL agent registry projects", `ts/packages/tools/areg`).

## Objective Impact

- Rewrote `objective.md` from scratch: `asdl`/`ASDL` -> `sdl`/`SDL`; package-name candidates `@asdl/*` -> `@sdl/*`; collapsed the ungrounded "core `asdl` and `sdl` CLIs" duality into the single first-party `sdl` CLI as first consumer with reuse preserved for other first-party CLIs and SDL extensions. Removed the now-moot Python-vs-TypeScript package-boundary risk and the "how should a Python `asdl` CLI consume a TS-first subsystem" open question; replaced the latter with a reuse-proof question naming a real second consumer (host CLI `ccc`/`sdlcc` or an SDL extension). Named `@sdl/areg` explicitly in the overlap risk.
- Rewrote `roadmap.md`: terminology updated to `sdl`; merged the redundant "core ASDL catalog" and "SDL catalog" steel-thread rows into one `sdl` CLI steel thread plus a distinct "prove reuse with a second consumer" row; updated the reconcile row to name `@sdl/areg`. Work shape otherwise unchanged (subsystem unimplemented).
- No closure: thesis, scope, and completion criteria remain valid open work.

Provenance: objective-refresh basis target=HEAD from=a1cc7fb2b

## Follow-Ups

- None new. Existing roadmap rows remain the actionable next steps; first decision is package/command vocabulary for the `sdl` CLI.
