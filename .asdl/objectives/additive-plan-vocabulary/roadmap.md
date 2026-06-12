# Roadmap

## Work

- [ ] Rename the TypeScript package `ts/packages/plans/` to `ts/packages/enriched-plan/` and its CLI group to `enriched-plan`, with `write` → `save`, updating workspace references and scenario tests.
      Evidence: TS scenario suite green under the new group; `plans exec write` absent from package sources.
- [ ] Re-key the local plan store to the `enriched-plan` store path (out from under `planned-branch/`), no migration shim; move any live saved plans manually and note the move in the PR description.
- [ ] Update Pi command mirrors in `ts/packages/pi-extensions/`: `/plans:write` → `/enriched-plan:save`, `/plans:grill-and-write` → `/enriched-plan:grill-and-save`, renaming old-group references in touched modules (e.g. `saved-plan-content-slug`).
- [ ] Rename the `plans-write` skill to `enriched-plan-save` per skill-management conventions; update its body to invoke `enriched-plan exec save` and refresh old-surface references in the `planned-branch` umbrella skill and `references/lifecycle.md`.
- [ ] Sweep remaining repo references to the old surfaces (docs, prompts, fixtures), excluding CONTEXT files and historical records; report CONTEXT drift as findings for the rebaseline session.
      Evidence: repo grep for `plans exec write`, `/plans:write`, and the old store path returns only CONTEXT files and historical records.

## Parked

- [ ] CONTEXT-MAP / CONTEXT rebaseline for enriched-plan vocabulary (retire "Saved plan" / "Source branch plan file", add the vibechk "run" ambiguity pairing) — requires a dedicated context session per repo policy.
