# TypeScript Migration Docs and Domain-Language Rebaseline

## Summary

Rebaselined the remaining active docs, skill recipes, and domain-language map that still reflected Python-era capability ownership after the root `asdl exec` disposition work.

Concrete changes:

- `CONTEXT-MAP.md` now records the live workspace inventory as 1 Python package (`asdl-core`) and 19 TypeScript packages, replaces planned deleted-Python package context targets with active `@asdl/*` TypeScript package context targets, and rewrites relationship seeds away from retired Python package identities.
- Root `AGENTS.md` no longer uses deleted `packages/aretro` or Python `brmem` paths as active examples; scenario-test and hidden `exec` guidance now distinguishes Python dispatcher/plugin testing from active TypeScript standalone CLI examples.
- CCC availability, stack-map, and branch-triage skills now use the standalone TypeScript `slot gt exec stack-branches --format json` and `slot free ...` command surfaces rather than retired `asdl slot ...` / `uv run asdl slot ...` recipes.
- `docs/cmux/help-querying.md` and the stack-map display sketch clarify that new deterministic cmux/CCC helpers belong behind TypeScript-owned `ccc exec`, while root `asdl exec` is retired.

Validation/gate evidence from this branch:

- `find packages -maxdepth 2 -mindepth 2 -type f -name pyproject.toml -print | sort` returned only `packages/asdl-core/pyproject.toml`.
- `find ts/packages -maxdepth 2 -type f -name package.json -print | sort` returned 19 TypeScript package manifests.
- `slot --runtime` reported `runtime: typescript`, and `slot gt exec stack-branches --format json` plus `slot free --help` both returned supported command shapes.
- `rg -n "asdl slot gt exec|uv run asdl slot" skills/ccc-available-work/SKILL.md skills/ccc-stack-map/SKILL.md skills/ccc-branch-triage/SKILL.md skills/ccc-stack-map/references` returned no matches.
- `rg -n "packages/aretro|Python brmem|packages/asdl-core/src/asdl_core/brmem" AGENTS.md` returned no matches.
- `rg -n "Planned Python package contexts|packages/(areg|roaster|asdl-slots|asdl-objectives|packagechk|aretro|vibechk)" CONTEXT-MAP.md` returned no matches.
- Remaining `asdl exec` matches are in retired/provenance docs or wording that explicitly says the root surface is retired.

## Objective Impact

This burns down the docs/domain-language portion of the final migration cleanup row. Active agent-facing instructions no longer point to deleted Python capability packages, retired root `asdl exec` operations, or retired `asdl slot` / `uv run asdl slot` examples for current work. The remaining Python role is documented as `asdl-core` for root plugin dispatch/runtime diagnostics and shared reference substrate, not as the owner of migrated capabilities.

Do not close the umbrella Objective from this update alone: the migration-debt ledger review remains the next closure-oriented slice.

## Follow-Ups

- Review `migration-debt.md` and either burn down or deliberately recommit each remaining transitional compromise before Objective closure.
- Run a focused TypeScript package context rebaseline later if the project wants full `CONTEXT.md` files for all active `@asdl/*` packages; this update only reclassified targets and avoided inventing full context definitions.
