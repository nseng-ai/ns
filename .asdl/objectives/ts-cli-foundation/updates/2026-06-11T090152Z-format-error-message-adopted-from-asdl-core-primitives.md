# formatErrorMessage adopted from @asdl/core primitives

## Summary

`formatErrorMessage` is now centralized in `@asdl/core/primitives` and consumed from that subpath by the remaining local duplicate users in `asdl-dev`, `pr-address`, `ccc`, `pi-extensions`, and `pi-extension-runtime`. The duplicate exported helper copies in those consumer packages are removed; the deliberately inlined clinkr legacy copy remains separate.

Evidence: local branch diff against Graphite parent `repoint-pr-address-on-clinkr`; PR #1265 corroborates the same file set and commit.

## Objective Impact

This does not complete a roadmap row: the remaining tracked rows are still the two clinkr migrations, shared git gateway, payload home, Zod boundary validation, `asdl-dev` public surface, and scenario-test scaffolding.

It does strengthen the `@asdl/core` foundation side of the Objective. The adoption demonstrates a narrow leaf-module path for shared primitives: packages can consume `@asdl/core/primitives` without also adopting unrelated core modules, partially de-risking the "new monolith" concern recorded in `objective.md`.

## Follow-Ups

- Continue the existing roadmap sequence; no new roadmap row is needed for this completed primitive consolidation.
- Keep the clinkr legacy copy separate unless a future clinkr/legacy ownership decision makes that dependency appropriate.
