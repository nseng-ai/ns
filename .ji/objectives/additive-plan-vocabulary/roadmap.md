# Roadmap

## Work

- [x] Rename the saved-plan CLI group/bin to `enriched-plan`, with `write` → `save`, updating workspace references and scenario tests.
      Evidence: `ts/packages/plans/` remains the implementation package by explicit scope correction, while its public bin/group is `enriched-plan`; TS scenario suite passed and `plans exec write` is absent from active package sources.
- [x] Re-key the local plan store to the `enriched-plan` store path (out from under `planned-branch/`), no migration shim; move any live saved plans manually and note the move in the PR description.
      Evidence: saved-plan store primitives use `~/.asdl/enriched-plan`; no migration shim was added.
- [x] Update Pi command mirrors in `ts/packages/pi-extensions/`: `/plans:write` → `/enriched-plan:save`, `/plans:grill-and-write` → `/enriched-plan:grill-and-save`, renaming old-group references in touched modules.
      Evidence: Pi extension tests passed with the new command names.
- [x] Rename the `plans-write` skill to `enriched-plan-save` per skill-management conventions; update its body to invoke `enriched-plan exec save` and refresh old-surface references in the branch-context skill family.
      Evidence: skill symlinks and `skills-lock.json` were refreshed; `enriched-plan-save` invokes `enriched-plan exec save`.
- [x] Add branch-context ADR coverage and update this Objective's thesis/roadmap to include the planned-branch dissolution.
      Evidence: `docs/adr/0006-branch-context.md` records the concept, loading contract, namespace/key, surfaces, and accepted breakage.
- [x] Rename the TypeScript package `ts/packages/planned-branch/` to `ts/packages/branch-context/`, including package metadata, command names, constants, fixed `plan.md` load semantics, and dependent import paths.
      Evidence: TS check/test passed under `branch-context exec from-plan` and `branch-context exec load`.
- [x] Add branch-context primitives: `attach`, `list`, `check`, and `delete`, with fake-driven unit/gateway/scenario coverage.
      Evidence: primitive round-trips and collision refusal are covered in tests.
- [x] Rename Pi and CCC surfaces from planned-branch to branch-context, including command names, wrapper files, prompt wording, session artifact type, and no-key default implementation dispatch.
      Evidence: Pi extension and CCC tests passed with `/branch-context:*` command names, including `/branch-context:from-plan` and bare `/branch-context:impl` dispatch.
- [x] Rename planned-branch skills/docs to branch-context, refresh skill links/lockfile, and sweep remaining active references.
      Evidence: active docs/skills use branch-context terminology; remaining `planned-branch` hits are CONTEXT drift, historical records, or explicitly retained fixtures.
- [x] Sweep remaining repo references to the old enriched-plan and branch-context surfaces (docs, prompts, fixtures), excluding CONTEXT files and historical records; report CONTEXT drift as findings for the rebaseline session.
      Evidence: grep found no active `/plans:write`, `/plans:grill-and-write`, `plans exec write`, old store path, or active `/branch-context:create-branch` / `branch-context exec create-branch` command references outside allowed historical/fixture/context cases.

## Parked

- [ ] CONTEXT-MAP / CONTEXT rebaseline for enriched-plan vocabulary (retire "Saved plan" / "Source branch plan file", add the vibechk "run" ambiguity pairing) — requires a dedicated context session per repo policy.
