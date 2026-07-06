# Roadmap

## Work

- [x] Kernel shared `ns.toml` loader: single parse, Zod-validated `[points]` table and
  declared settings schemas, structured diagnostics.
  - Placement decided and initial API landed: `@nseng-ai/kernel` owns the internal
    project-config/points loader surface; `ns.points` manifest schema/types live with SDK
    manifest metadata.
  - Evidence: fake-driven kernel unit tests for parse/validation/diagnostics; real
    consumers migrated in later rows; targeted validation passes. Full `just` consistently
    reaches a known unrelated `@nseng-ai/objectives` topology-circle style-guard failure.
- [x] `ns.points` manifest discovery and point catalog computation: definitions joined
      with installations — installed-but-undefined (error), override-in-effect,
      defined-but-uninstalled; conventional `.ns/prompts/<point-id>.md` folded in.
  - Evidence: local branch `point-system-catalog-slice` commit `1e99c38a0` added kernel
    point definition discovery, `loadPointCatalog`/`computePointCatalog`, conventional
    prompt probing, and fake-driven unit coverage for catalog diagnostics.
- [x] Migrate `flow.submit.pre` as first consumer: declare the point in the flow extension
      manifest, replace `[flow.hooks].pre_submit` with `[points]."flow.submit.pre"` in the
      loader and this repo's `ns.toml`, update submit-hooks runtime and scenario tests.
  - Evidence: local branch `point-system-flow-submit-pre-W5pCnV` commit `1e89a46a0`
    declares the hook point, rewires flow submit hooks through the kernel catalog, removes
    flow's direct `smol-toml` dependency, rejects legacy `[flow.hooks]`, and passes targeted
    submit hook unit/scenario tests including `--no-hooks`.
- [x] Migrate prompt points: `flow.submit.pr-description` (manifest `default` file,
      id-based `.ns/prompts` name, generalized env dev-override reported by the catalog) and
      branch-context `plans-write`.
  - Landed: local branch `point-system-prompt-points-FRHJRE` commit `efa6745a2`
    declares both override prompt points, moves default prompt bodies into manifest markdown
    files, renames the checked-in plans-write prompt to `.ns/prompts/branch-context.plans-write.md`,
    and routes both readers through the kernel point catalog.
  - Completed: branch `point-system-prompt-env-catalog-zAmaUa` routes the legacy
    `NS_DEV_PR_DESCRIPTION_PROMPT` override through the kernel catalog as prompt env override
    source info with diagnostics while preserving behavior.
  - Policy: each rename cuts over reader and file in the same slice.
- [x] Migrate declared settings: roaster (`diff`, `model_profiles`), areg (`agents`),
  ns-init (`harnesses`) onto the shared loader; delete all four ad-hoc smol-toml parsers.
  - Landed: local branch `point-system-settings-loader-Pa0ixh` commit `a56987991`
    migrates `areg` `[areg].agents` onto the kernel loader with a declared settings schema
    and removes areg's direct `smol-toml` dependency.
  - Landed: local branch `point-system-roaster-settings-loader-ZdmM9j` commit `d9a13235f`
    migrates roaster `[roaster.diff]` and `[roaster.model_profiles]` onto the kernel loader
    with declared settings schemas and removes reviews' direct `smol-toml` dependency.
  - Landed: local branch `point-system/ns-init-settings-loader` commit `f73c3cde`
    migrates ns-init harness settings onto the kernel loader, removes ns-init's direct
    `smol-toml` dependency, and a targeted predecessor scan finds no remaining direct
    `smol-toml` imports/dependencies in the four retired config surfaces.
- [ ] CLI: `ns extension points` (catalog) and `ns extension point <id>` (detail) under
      the `ns extension` group, per `skills/ns-cli-design` conventions.
  - Evidence: CLI scenario tests including `--format` machine output.
- [ ] Graduate `brief.md`: author the ADR, add CONTEXT.md vocabulary (point, hook, prompt,
      install, define, point catalog), re-derive or retire this objective's `orientation.md`.
  - Policy: steer first — ADR/CONTEXT edits are decision-bearing; confirm wording with the user.

## Parked

- `ns extension install` / `update` UX (extension distribution effort).
- Global (XDG) installation tier — revisit only on a real cross-repo need.
- Agent-task `accepts` kind (needs the runner/harness story).
- SDLC view / `ns lifecycle` lens over the catalog; noun grouping metadata.
