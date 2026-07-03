# Submit SDK Groundwork

## Summary

The submit migration has keepable groundwork but is not yet the complete SDL hard-cutover slice. Evidence: local branch diff against Graphite parent `master` adds `ts/packages/asdl-dev/src/submit-cli-command.ts`, removes the inline `asdl-dev submit` registration from `ts/packages/asdl-dev/src/cli.ts`, exports that helper through `ts/packages/asdl-dev/package.json`, re-exports `PositionalSpec` through `@asdl/clinkr/raw`, and extends `@asdl/sdl/sdk` command/context types for request schemas, positionals, output streams, confirmation prompts, and extension bags. PR #1498 corroborates the same current file set.

This branch does not yet add `.asdl/commands/submit.ts`, selected-command schema parsing in the SDL CLI/registry path, `/sdl:submit`, Pi parity updates, submit-surface tests, or SDL submit docs/skill updates.

## Objective Impact

The `submit` hard-cutover roadmap row is now in progress rather than untouched. The new SDK/request-schema and submit helper extraction reduce risk for moving `submit --restack` into a repo-local SDL command module, and the old inline `asdl-dev submit` CLI registration has been removed as part of the hard-cut direction.

The row cannot be marked complete yet because the durable SDL replacement surfaces and agent-facing updates are still absent. The next slice should finish the hard cutover by adding `sdl submit` and `/sdl:submit`, removing `/code:submit`, migrating behavior coverage, and updating docs/skills/parity metadata so users and agents have the SDL path available.

## Follow-Ups

- Finish selected-command schema plumbing through SDL command registration/execution so project command schemas can drive `sdl submit --help`, `--json-schema`, and parsed requests.
- Add `.asdl/commands/submit.ts` that delegates to the extracted submit helper without shelling out to `asdl-dev submit`.
- Add `/sdl:submit`, remove `/code:submit`, migrate submit scenario coverage, and update durable docs/skills/parity metadata to SDL naming.
- Keep `pr-regen` deferred in the `asdl-dev` and `/code:pr-regen` surfaces until its own SDL migration decision lands.
