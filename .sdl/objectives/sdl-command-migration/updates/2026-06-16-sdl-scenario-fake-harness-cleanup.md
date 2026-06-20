# SDL Scenario Fake Harness Cleanup

## Summary

The current branch adds a shared SDL CLI fake harness for scenario tests and simplifies duplicate candidate grouping in the SDL extension registry without changing the public command surface. Evidence: local committed branch diff against Graphite parent `add-sdl-handoff-command-tree`, corroborated by PR #1600, modifies `ts/packages/sdl/src/extension-registry.ts`, refactors the `changes` and `cp` scenario tests to use `ts/packages/sdl/test/scenario/sdl-cli-fakes.ts`, and adds that shared fake harness.

Verification: targeted `@asdl/sdl` check passed; targeted `@asdl/sdl` test suite passed.

## Objective Impact

No migration roadmap row is complete from this branch: it does not add a new `sdl <command>` surface, remove an old `/code:*` or `asdl-dev` surface, or disposition a backlog command.

The branch does materially reduce test-maintenance risk for later SDL command slices. It keeps the `cp` and `changes` scenario coverage in SDL while replacing duplicated fake CLI plumbing with a shared harness, so future command migrations have a clearer path for proving non-Pi SDL reachability.

## Follow-Ups

- Keep using command-specific hard-cutover evidence before marking future migration rows complete.
- Reuse the shared SDL CLI fake harness when migrating `autobranch`, `autoslot`, landing, push, or review/metadata commands where scenario tests need fake git/model behavior.
- Continue to treat validation as evidence for semantic rows rather than standalone roadmap work.
