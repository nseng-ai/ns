# Submit Pi Bridge Groundwork

## Summary

PR #1501 adds a keepable follow-up slice on top of the submit SDK groundwork. Evidence: branch diff against Graphite parent `sdl-submit-hard-cutover` changes `ts/packages/asdl-dev/src/output.ts`, `ts/packages/asdl-dev/src/cli.ts`, `ts/packages/asdl-dev/src/submit-cli-command.ts`, `ts/packages/pi-extensions/src/asdl-dev-extension.ts`, and `ts/packages/sdl/src/command-registry.ts`.

The slice consolidates duplicate command-result output writing into `asdl-dev` output helpers, reshapes the exported submit helper to receive SDL-shaped run dependencies, updates the SDL command runner to call command modules with an explicit request object, and adds a short transitional Pi `/code:submit` bridge that calls the submit helper directly while `sdl submit` and `/sdl:submit` are still absent.

Verification evidence: targeted `asdl-dev`, `@asdl/sdl`, and `@asdl/pi-extensions` checks passed; targeted `@asdl/sdl` tests and `@asdl/pi-extensions` tests passed; full TypeScript check passed. The `asdl-dev` test suite remains red for the known broader migration baseline where old tests still expect the removed `asdl-dev submit` command.

## Objective Impact

The `submit` hard-cutover row remains in progress. PR #1501 makes the submit helper more SDL-shaped and keeps the mutating submit workflow reachable from Pi during the gap between removing the old `asdl-dev submit` CLI registration and adding the durable `sdl submit` replacement.

The restored `/code:submit` bridge is a documented short transition exception, not a durable compatibility alias. It should be removed in the slice that introduces `sdl submit` and `/sdl:submit` with migrated behavior tests, docs, skills, and parity metadata.

## Follow-Ups

- Add `.asdl/commands/submit.ts` that delegates to the extracted submit helper with SDL request/schema parsing instead of shelling out to `asdl-dev submit`.
- Add `/sdl:submit` and remove the transitional `/code:submit` bridge in the same hard-cutover slice.
- Migrate submit behavior coverage, help/schema expectations, docs, skill prose, and parity metadata to SDL naming.
- Keep `pr-regen` deferred in the `asdl-dev` and `/code:pr-regen` surfaces until its own SDL migration decision lands.
