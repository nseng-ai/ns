# General SDL Command Loading

## Summary

General SDL CLI project command loading is implemented beyond the previous `cp`-only override. The SDL CLI now discovers flat direct `.asdl/commands/*.ts` filenames, rejects invalid direct `.ts` stems, ignores `.d.ts` files, registers project-only names for CLI help without importing project modules, and imports/validates only the selected command module on invocation. Built-in `cp` remains available when no project override exists, and `.asdl/commands/cp.ts` still overrides it through the same generic runner.

Validation evidence: targeted SDL package test/check passed; targeted Pi extension package test/check passed; full TypeScript test/check passed; docs dprint check passed.

## Objective Impact

The roadmap row for general project-specific SDL command loading is complete. The public command-author SDK surface remains `@asdl/sdl/sdk` with the existing no-argument `run(ctx)` shape; no compatibility aliases, YAML specs, hidden registries, task databases, nested groups, or new public SDK subpaths were added.

Documentation now records the implemented CLI-only behavior and the deferred follow-ups. Dynamic exact Pi `/sdl:<name>` mirrors are still deferred because they need registration-time cwd/discovery design or a different Pi command model. Typed option/argument support remains deferred before migrating option-bearing commands such as `submit --restack`.

## Follow-Ups

- Design typed option/argument support in `@asdl/sdl/sdk` before migrating option-bearing lifecycle commands.
- Design dynamic Pi mirror discovery/registration if project-only command modules should appear as exact `/sdl:<name>` commands.
- Migrate `submit` as the next hard-cutover SDL lifecycle command after this general CLI loading slice.
