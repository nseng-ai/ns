# Roadmap

## Work

- [ ] Rename the TypeScript package `ts/packages/plans/` to `ts/packages/enriched-plan/` and its CLI group to `enriched-plan`, with `write` → `save`, updating workspace references and scenario tests.
      Evidence: TS scenario suite green under the new group; `plans exec write` absent from package sources.
- [ ] Re-key the local plan store to the `enriched-plan` store path (out from under `planned-branch/`), no migration shim; move any live saved plans manually and note the move in the PR description.
- [ ] Update Pi command mirrors in `ts/packages/pi-extensions/`: `/plans:write` → `/enriched-plan:save`, `/plans:grill-and-write` → `/enriched-plan:grill-and-save`, renaming old-group references in touched modules (e.g. `saved-plan-content-slug`).
- [ ] Rename the `plans-write` skill to `enriched-plan-save` per skill-management conventions; update its body to invoke `enriched-plan exec save` and refresh old-surface references in the branch-context skill family.
- [ ] Add branch-context ADR coverage and update this Objective's thesis/roadmap to include the planned-branch dissolution.
      Evidence: `docs/adr/0006-branch-context.md` records the concept, loading contract, namespace/key, surfaces, and accepted breakage.
- [ ] Rename the TypeScript package `ts/packages/planned-branch/` to `ts/packages/branch-context/`, including package metadata, command names, constants, fixed `plan.md` load semantics, and dependent import paths.
      Evidence: TS check/test green under `branch-context exec create-branch` and `branch-context exec load`.
- [ ] Add branch-context primitives: `attach`, `list`, `check`, and `delete`, with fake-driven unit/gateway/scenario coverage.
      Evidence: primitive round-trips and collision refusal covered in tests.
- [ ] Rename Pi and CCC surfaces from planned-branch to branch-context, including command names, wrapper files, prompt wording, session artifact type, and no-key default implementation dispatch.
      Evidence: Pi extension and CCC tests green with `/branch-context:*` command names.
- [ ] Rename planned-branch skills/docs to branch-context, refresh skill links/lockfile, and sweep remaining active references.
      Evidence: repo grep for active `planned-branch` references returns only CONTEXT drift, historical records, and explicitly retained fixtures.
- [ ] Sweep remaining repo references to the old enriched-plan and branch-context surfaces (docs, prompts, fixtures), excluding CONTEXT files and historical records; report CONTEXT drift as findings for the rebaseline session.
      Evidence: repo grep for `plans exec write`, `/plans:write`, the old store path, and active `planned-branch` surfaces returns only allowed hits.

## Parked

- [ ] CONTEXT-MAP / CONTEXT rebaseline for enriched-plan vocabulary (retire "Saved plan" / "Source branch plan file", add the vibechk "run" ambiguity pairing) — requires a dedicated context session per repo policy.
