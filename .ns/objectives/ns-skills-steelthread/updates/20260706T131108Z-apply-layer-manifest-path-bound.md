# Apply Layer and Manifest Path Bound

## Summary

The harness-artifacts steelthread now binds the install-manifest location as a hidden JSON file inside the resolved harness artifact root: `<targetRoot>/.ns-harness-artifacts-manifest.json`, where `targetRoot` is the harness/scope skill root such as `.pi/skills`, `.claude/skills`, or `.agents/skills`. The manifest travels with the concrete provision location, keeps project-scope and user-scope installs separate by construction, and avoids a repo-global database.

The apply layer now treats materialization as plan-plus-apply: preview builds the same plan and manifest-driven classifications without writing, while apply collects real target hash facts from the filesystem, refuses locally edited conflicts unless forced, copies source skill files, and writes the manifest entry with per-file content hashes.

## Objective Impact

Advances the implementation row's materialization slice and closes the design follow-up from the previous update by deciding the manifest file path at the apply boundary.

## Follow-Ups

Wire this materialization API into the later `ns skills` command surface and the `@nseng-ai/ns-init` `SkillMaterializer` seam; no CLI wiring landed in this slice.
