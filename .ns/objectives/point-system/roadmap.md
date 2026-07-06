# Roadmap

## Work

- [ ] Kernel shared `ns.toml` loader: single parse, Zod-validated `[points]` table and
  declared settings schemas, structured diagnostics.
  - Policy: decide module placement (kernel vs foundation) here, per ADR 0009 layering,
    before writing code; steer if placement forces new cross-package dependencies.
  - Evidence: fake-driven unit tests for parse/validation/diagnostics; full `just`.
- [ ] `ns.points` manifest discovery and point catalog computation: definitions joined
  with installations — installed-but-undefined (error), override-in-effect,
  defined-but-uninstalled; conventional `.ns/prompts/<point-id>.md` folded in.
- [ ] Migrate `flow.submit.pre` as first consumer: declare the point in the flow extension
  manifest, replace `[flow.hooks].pre_submit` with `[points]."flow.submit.pre"` in the
  loader and this repo's `ns.toml`, update submit-hooks runtime and scenario tests.
  - Evidence: `ns flow submit` scenario coverage (pass/fail/`--no-hooks`) against the new key.
- [ ] Migrate prompt points: `flow.submit.pr-description` (manifest `default` file,
  id-based `.ns/prompts` name, generalized env dev-override reported by the catalog) and
  branch-context `plans-write`.
  - Policy: each rename cuts over reader and file in the same slice.
- [ ] Migrate declared settings: roaster (`diff`, `model_profiles`), areg (`agents`),
  ns-init (`harnesses`) onto the shared loader; delete all four ad-hoc smol-toml parsers.
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
