# CLI wiring layer (holistic)

Scope: all 15 `ts/packages/<pkg>/src/cli.ts` + `clinkr/src/group.ts` +
`clinkr/src/index.ts`. The clinkr framework itself is clean; the duplication
lives in the per-CLI wiring.

## B1. [BLOCKER] ~150 lines of identical boilerplate copy-pasted 15× → one `cli-entry` helper

Three pieces of boilerplate are mechanically identical (or derivable) across
every `cli.ts`:

### runtimeInfo() — 14 hand-written copies

Each returns the same two-line template varying only by `(binName, pkgName,
srcPath, runtime)`:

```ts
return "runtime: typescript\nentry_point: @asdl/<pkg> bin <bin> -> ts/packages/<pkg>/src/cli.ts\n";
```

Locations: `areg/src/cli.ts:107`, `aretro/src/cli.ts:82`,
`branch-context/src/cli.ts:381`, `brmem/src/cli.ts:167`, `ccc/src/cli.ts:176`,
`handoff/src/cli.ts:99`, `objective/src/cli.ts:136`, `packagechk/src/cli.ts:157`,
`plans/src/cli.ts:316`, `pr-address/src/cli.ts:60`, `roaster/src/cli.ts:129`,
`slot/src/cli.ts:327`, `vibechk/src/cli.ts:267`. `sdl/src/cli.ts:61-62` inlines
the same string into a `runtimeInfo:` arrow. `sdlcc/src/cli.ts:105` is the lone
`runtime: bun` variant. Every field is derivable from package.json (`name`, the
single `bin` key) plus a runtime literal. Because the strings are free text, a
renamed bin silently desyncs from `--runtime` with nothing enforcing it.

### Version — 14 hardcode, 1 reads (inconsistent)

`areg/src/cli.ts:26,92-105` has a 14-line `readPackageVersion()` that validates
and reads `../package.json`. Every other CLI hardcodes `const VERSION = "0.1.0"`
(`aretro:22`, `brmem:45`, `ccc:25`, `slot:83`, ...). After a version bump, 14
CLIs silently report stale; one won't. Having both patterns is the worst case.

### Entry footer + IO/cwd/env plumbing

1. Entry footer — identical in 14 files (`areg:111`, `aretro:86`, `brmem:171`,
   `ccc:180`, `handoff:103`, `objective:140`, `packagechk:161`, `pr-address:64`,
   `roaster:133`, `sdl:188`, `slot:331`, `vibechk:271`; `plans:320` and
   `branch-context:385` spell it across two lines for no reason):
   ```ts
   if (import.meta.main || isDirectCliInvocation(import.meta.url, process.argv[1])) {
       process.exitCode = await runCli(process.argv.slice(2));
   }
   ```
2. IO/cwd/env resolution — same shape everywhere (`aretro:69-79`, `areg:79-89`,
   `brmem:152-164`, `objective:128-133`, `slot:311-324`, `handoff:86-97`,
   `pr-address:44-57`):
   ```ts
   const io = resolveIo({ stdout: deps.stdout, stderr: deps.stderr });
   const cwd = deps.cwd ?? process.cwd();
   const env = deps.env ?? process.env;
   const context = deps.context ?? createReal...Context({ cwd, env });
   ```
   Several then re-merge `cwd`/`env`/`stdin` into a `runContext` spread
   (`areg:84-88`, `brmem:157-163`, `aretro:74-78`, `slot:316-323`) — the same
   `...context, cwd, env: deps.env ?? context.env` idiom 3–4 times.

### Remedy

Add `defineCli({ buildCli, createContext }, import.meta.url)` (or
`runClinkrEntrypoint`) to `@asdl/core/cli-entry` (which already hosts
`isDirectCliInvocation` at `asdl-core/src/cli-entry.ts` and is imported by 14/15
CLIs — the natural home). It owns: `resolveIo`, cwd/env defaulting, the
`import.meta.main || isDirectCliInvocation` guard, `process.exitCode` assignment,
runtimeInfo derivation from package.json, and version reading. Each `cli.ts`
shrinks to a `buildCli` factory + a `createContext(deps)` callback + one call.
This is the single biggest structural win in the codebase; it also deletes
`areg`'s bespoke `readPackageVersion` and kills the stale-version and
runtimeInfo-desync latent bugs. Mitigate fleet-wide risk by landing it behind
`--version`/`--runtime`/`-h` scenario coverage.

## B2. [HIGH] hidden `exec` group hand-constructed 9× with 8 free-text descriptions

The convention (AGENTS.md: skill-invoked commands under a `hidden` nested `exec`
group) is followed correctly everywhere — `isHidden:true` always passed to the
constructor, never mutated. No violations found. But construction is boilerplate
and descriptions are ad-hoc:

- `aretro:40-44` / `areg:69-73` / `brmem:134-138` — "Commands for use by skills
  (not interactive users)."
- `branch-context:112-116` — "Run hidden deterministic branch-context operations
  for agents."
- `ccc:71-75` — "Run hidden deterministic CCC operations for agents."
- `plans:100-104` — "Run hidden deterministic saved-plan operations for agents."
- `objective:91-95` — "Commands for use by objective skills."
- `pr-address:34-38` — "Operations for the pr-address skill."
- `roaster:79-83` — "Operations for roaster automation."
- `slot:286-290` — "Skill-invoked Graphite operations."

Eight phrasings for one concept. Remedy: a `clinkr` `execGroup(description?)`
factory (or `ClinkrGroup.exec()`) defaulting `name:"exec"` + `isHidden:true` + a
standard description. Centralizes the convention so it cannot be wired wrong and
makes the boundary auditable in one place.

## MED — minor inconsistencies

- `packagechk/src/cli.ts:5` imports `resolveIo as resolveClinkrIo` while all 14
  others import plain `resolveIo`. The alias buys nothing; drop it.

## LOW — three command "flavors" split the fleet with no documented rule

- Rendered `command({ schema, handler, renderHuman })`: areg, aretro, brmem,
  handoff, objective, roaster, slot, vibechk(×3 of 4).
- `rawCommand` (raw exit code, manual stdout/stderr): ccc, roaster(exec),
  packagechk, sdlcc, sdl, vibechk(`run`).
- `legacyCommand` (`LegacyPayload` machine/human): **plans and branch-context
  only**, and they use it for *every* command (e.g. `branch-context:117-174`,
  `plans:90-123`). `group.ts:43-49` self-describes `legacyCommand` as a
  "deprecated-from-birth escape hatch" pinned to the migration-debt ledger.
  These two CLIs hand-roll `*Json()` snake_case serializers
  (`branch-context:307-379`, `plans:238-289`) that the rendered path's
  `resultSchema` + `renderHuman` would otherwise own. They are the two CLIs
  furthest from the framework's intended shape and the clearest migration
  candidates — PARKED pending the open question of whether that migration belongs
  in this Objective.

## clinkr framework notes (group.ts ~550 lines) — clean, no required change

- Re-entrant `run()` rebuilds the commander tree per invocation
  (`group.ts:218-242`); zod owns required-arg validation while commander
  declares everything bracket-optional (`buildCommanderArgument:466-475`) so the
  usage-error channel stays uniform; the two `as`-casts in
  `executionOf`/`rawExecutionOf` (`286-317`) are localized and documented as
  zod-backed.
- Minor smell: `--runtime` is added as a real `Option` for help rendering
  (`group.ts:251-253`) but intercepted by a raw `argv[0] === "--runtime"` string
  check before parsing (`group.ts:224-227`) — so it only works as the literal
  first arg and bypasses commander. Low severity; add a comment or a real action
  handler. `findBareGroupPath` (274-283) interacts subtly with this but no bug
  found.

No framework change is *required* to enable the dedup wins above; the helpers
belong in `@asdl/core/cli-entry`.
