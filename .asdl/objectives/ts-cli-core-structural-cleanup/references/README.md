# Reference: thermo-nuclear review findings

These files capture the full findings from the holistic thermo-nuclear
code-quality review of all 15 TypeScript CLIs + `asdl-core` that seeded this
Objective. They preserve file:line evidence and concrete remedies so a future
implementer can act without re-deriving the analysis.

Scope reviewed: every `ts/packages/<pkg>/src/cli.ts` (areg, aretro,
branch-context, brmem, ccc, handoff, objective, packagechk, plans, pr-address,
roaster, sdl, sdlcc, slot, vibechk) plus `ts/packages/asdl-core/src/**` and the
`clinkr` framework. All paths below are relative to `ts/packages/`.

## Verification status

The load-bearing cross-cutting claims were independently verified during the
review (grep/read), not just asserted by sub-reviewers. Verified facts:

- 14/15 CLIs hardcode `const VERSION = "0.1.0"`; only `areg` reads package.json.
- 14 CLIs share the identical `runtime: typescript\nentry_point: ...` string.
- 14 CLIs share the identical `isDirectCliInvocation` entry footer.
- `asdl-core/src/brmem-cli.ts:129` `resolveBrmemCommandCandidates` `void`s both
  params and returns one hardcoded `[{command:"brmem", prefixArgs:[]}]`.
- `branch-context/src/brmem-gateway.ts:8,192` shells out via
  `runAvailableBrmemCommand`; `handoff/src/context.ts:26` uses
  `new RealGitBrmemGateway(...)` + typed `deps.brmem.listEntries(...)`.
- The `@asdl/core` root `.` export has exactly one bare importer:
  `pi-extensions/src/harness-session.ts:1` (`truncatedSha256Digest`, also in
  `/primitives`).
- `graphqlErrorsFromJson` (`github-graphql-json.ts:29`) and
  `readOptionalBrmemBooleanField` (`brmem-cli.ts:396`) have no consumers.
- `areg/src/real-gateways.ts` exports 6 `Real*` gateway classes in 1358 lines.

## Severity legend

- BLOCKER — presumptive merge blocker per the review standard (god-file/god-fn
  over the cohesion line, or large preserved complexity with a clear deletion).
- HIGH — strong structural win, usually cross-package "code judo".
- MED — real cleanup, contained to a package.
- LOW — small dedup / legibility.

## Files

- `overall-verdict.md` — the synthesized verdict, priority ordering, and what is
  already right (calibration: do NOT "fix" these).
- `cli-wiring-layer.md` — the holistic CLI-layer findings (defineCli, execGroup,
  version, runtimeInfo, legacyCommand debt) + clinkr framework notes.
- `asdl-core.md` — asdl-core foundation findings (submit/ pipeline, `.` export,
  brmem-cli framework, dead exports, formatOutputSection, result alias).
- `branch-memory-access.md` — the two-paths-to-one-store finding (B3/B4) in depth.
- `cross-package-dedup.md` — git gateways, branch resolution, branch-name
  validation, roaster GitHub leaf helpers.
- `areg.md` — areg god-file + policy-fork + fake-divergence findings.
- `ccc.md` — ccc landing god-function, metadata read paths, git/github boundary
  split-brain, small dedup, and the atomicity positive-finding.
- `aretro-sdlcc.md` — aretro JSONL parser blend + sdlcc Zod/dead-data findings.
- `per-package-cleanups.md` — roaster, sdl, vibechk, packagechk, pr-address.
