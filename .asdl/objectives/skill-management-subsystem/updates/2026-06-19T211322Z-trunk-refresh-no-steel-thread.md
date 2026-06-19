# Trunk Refresh Confirms No Resource Installer Steel Thread Yet

## Summary

Provenance: objective-refresh basis target=efcb08ba982e3581bd0440d4a1cd4a4491f5fc18 from=70e3939e16343fee989228412052b380c50ee9ba

A trunk refresh found no Objective-file changes since the previous `skill-management-subsystem` refresh commit, and no implemented core ASDL/SDL resource-installer steel thread in the current checkout. The Objective remains correctly open and implementation-oriented: the reusable catalog/path/install-plan subsystem, core `asdl` resource CLI surface, and `sdl` resource CLI surface are still future work.

Verification evidence that mattered:

- `git diff 70e3939e16343fee989228412052b380c50ee9ba..HEAD -- .asdl/objectives/skill-management-subsystem/` produced no Objective prose or roadmap changes.
- `git ls-files -- .asdl/objectives/skill-management-subsystem/references/pup-skill-management-report.md` and a file existence check confirmed the Pup research report is still checked in at the referenced Objective path.
- `find ts/packages packages -maxdepth 2/4 -type d` found no package directory matching a reusable `*resource*`, `*skill*`, or `*agent*` subsystem name.
- The TypeScript workspace package list contains `@asdl/areg`, `@asdl/sdl`, and other existing packages, but no `@asdl/agent-resources`, `@asdl/assistant-resources`, or `@asdl/skill-management` package.
- `ts/packages/sdl/src/command-registry.ts` lists built-in SDL commands `changes`, `cp`, `regenerate-pr`, and `submit`; no built-in `skills`, `resources`, or `agent-resources` command is present.
- `ts/packages/areg/src/cli.ts` and `ts/packages/areg/src/operations/skill-kind.ts` show existing areg workflows for project skill initialization/check/update, local skill invocation metadata inspection, and hidden `skillx`; this overlaps the Objective's reconciliation risk but is not the desired bundled ASDL/SDL resource installer.

## Objective Impact

No closure criteria are met by this refresh. The roadmap should stay in its current order: first decide package/command vocabulary, then design the resource model and platform path table before implementing core ASDL and SDL catalog steel threads.

The existing `areg` and `skillx` evidence reinforces, rather than resolves, the roadmap item to reconcile with established skill workflows. They are current overlap points to account for when designing the new subsystem, not substitutes for a Pup-style static bundled resource catalog and deterministic install planner.

## Follow-Ups

- Keep the Pup report as the design reference for the first implementation branch.
- When implementation begins, verify the package/command vocabulary against current `areg`, `skillx`, and SDL command-extension behavior before adding a new public surface.
- Do not treat this Objective as closure-ready until core `asdl` and `sdl` can both list/path/plan-or-install bundled resources through shared catalog/install-planning logic.
