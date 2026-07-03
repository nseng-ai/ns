# Shell-Exit-Code Removed From Completion Surface; Clinkr Rehomed

## Summary

A trunk-explicit rebaseline (target=HEAD, baseline=f3afd9a2f) re-verified the static
completion planner against current ground truth and found one recorded claim now stale.

- The prior update `2026-06-22-static-clinkr-completion-planner.md` states the static
  engine completes the rendered-command framework option `--shell-exit-code`. That option
  no longer exists in the planner. Commit "Remove Clinkr shell-exit mode and make negative
  exits non-zero by default" deleted shell-exit handling. Evidence: at baseline
  `f3afd9a2f`, `ts/packages/clinkr/src/completion.ts` line 78 registered
  `flags: ["--shell-exit-code"]`; at HEAD, `rg -n "shell-exit"` over
  `ts/packages/infra/clinkr/src` returns nothing, while `--format` and `--json-schema`
  rendered-command options remain.
- The Clinkr package was rehomed by commit "Rehome workspace packages into hosts, infra,
  capabilities, and tools" from `ts/packages/clinkr/` to `ts/packages/infra/clinkr/`. The
  package name `@sdl/clinkr` and the `@sdl/clinkr/completion` export subpath are unchanged,
  so durable Objective prose that references the export (not a filesystem path) stays valid.

Re-verified and still true at HEAD: `ClinkrGroup.complete()` exists
(`ts/packages/infra/clinkr/src/group.ts:220`); the `@sdl/clinkr/completion` subpath is
exported (`package.json` exports `"./completion": "./src/completion.ts"`); `SurfacePlan`
exists (`surface.ts`, `group.ts`); the planner covers visible commands, visible options,
help (`-h/--help`), version (`-V/--version`), `--runtime`, `--format` enum, `--json-schema`,
option enum values, and positional enum values without invoking handlers
(`completion.ts`, `test/completion.test.ts`); installed Commander is 14.0.3 (catalog
`^14.0.0`). No shell bridge (bash/zsh/fish) and no `sdl completion` host command exist yet,
matching the unchecked roadmap rows.

## Objective Impact

No change to durable scope, criteria, risks, or open questions; `objective.md` and
`roadmap.md` remain accurate and were left unchanged. The first two roadmap rows
(architecture boundary, static completion engine) stay `[x]`; shell bridge, SDL
integration, dynamic-hooks decision, and documentation stay `[ ]`. This update corrects the
covered-surface inventory: `--shell-exit-code` is no longer part of the static completion
candidate set, so future shell-bridge/SDL-integration work should not assume it.

Provenance: objective-refresh basis target=HEAD from=f3afd9a2f

## Follow-Ups

- When resuming the shell-bridge / SDL-integration slices, treat the planner's
  rendered-command framework options as `--format` and `--json-schema` only (plus
  `-h/--help`, `-V/--version`, `--runtime`); do not reintroduce `--shell-exit-code`.
- Keep referencing the `@sdl/clinkr/completion` export rather than the package's filesystem
  location, which now lives under `ts/packages/infra/clinkr/`.
