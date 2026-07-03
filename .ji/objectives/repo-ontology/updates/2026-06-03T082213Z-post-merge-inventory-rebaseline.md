# Post-Merge Inventory Rebaseline

## Summary

Rechecked `repo-ontology` against clean `master` after the known outstanding changes reached trunk. There is no current branch or PR diff to apply; the relevant evidence is the current checkout inventory and recent trunk commits.

Current ground truth:

- The Python workspace now has 12 tracked packages: `areg`, `aretro`, `asdl-core`, `asdl-dispatcher`, `asdl-handoff`, `asdl-objectives`, `asdl-pr-address`, `asdl-slots`, `brmem`, `packagechk`, `roaster`, and `vibechk`.
- `asdl-dispatcher` remains out of context scope because its Clinkr group still has `operations=[]`.
- The in-scope Python context target is therefore 11 packages: the prior 8 plus `areg`, `asdl-handoff`, and `vibechk`.
- The TypeScript workspace now has two repo-local package context targets: `ts/packages/asdl-dev` and `ts/packages/pi-extensions`. `@asdl/pi-extensions` depends on `asdl-dev` and mirrors `asdl-dev` commands into Pi namespaces.
- Existing context files are still only root `CONTEXT.md`, `packages/asdl-core/CONTEXT.md`, `packages/brmem/CONTEXT.md`, and `ts/packages/pi-extensions/CONTEXT.md`; `CONTEXT-MAP.md` still marks brmem as planned and lacks the new post-merge surfaces.

Evidence considered: clean `git status`, current branch `master` at `origin/master`, no local diff against `origin/master`, no PR for `master`, package `pyproject.toml` inventory, TypeScript `package.json` inventory, context-file inventory, package dependency/import scans, `asdl-dispatcher` group source, and targeted reads of the new `areg`, `asdl-handoff`, `vibechk`, `asdl-dev`, and Pi command-mirror source/docs.

## Objective Impact

- `objective.md`: updated the thesis, scope, completion criteria, assumptions, risks, and open questions for the current post-merge baseline: 11 in-scope Python package contexts plus `asdl-dev` and `@asdl/pi-extensions` TypeScript contexts.
- `roadmap.md`: Phase 4 is now the completed Objective rebaseline for the post-merge inventory; Phase 3 remains the next product phase because `/CONTEXT-MAP.md` still needs the current checkout map catch-up. New context phases were added for `areg`, `asdl-handoff`, `vibechk`, `asdl-dev`, and a refresh of `@asdl/pi-extensions`; the final map/readback phase moved to Phase 16.
- No `/CONTEXT-MAP.md` or package context file was edited by this tracking update, so no map/context product row was marked complete.

## Follow-Ups

- Next work should be Phase 3: update `/CONTEXT-MAP.md` to mark brmem present and rebaseline the map to the current 12-Python-package / 2-TypeScript-package checkout.
- Context sessions should then proceed in the smaller roadmap slices, starting with `areg` and `asdl-handoff` unless a more urgent package boundary needs grilling first.
- During the TypeScript phases, assign CLI command semantics to `asdl-dev` and Pi discovery/mirroring/presentation semantics to `@asdl/pi-extensions` to avoid duplicating vocabulary.
