# Neutral-Infra Gateway Consolidation

## Thesis

The `neutral-infra` tier is incoherent because `@sdl/core` is three packages fused into
one: pure utilities, real-world I/O gateways, and SDL runtime mechanics. Today all nine
capabilities import `@sdl/core/exec` (112 sites) and `@sdl/core/git` (45 sites) directly —
reaching raw process and git I/O that the architecture says they should only ever see
through injected gateways. This Objective decomposes `@sdl/core` and re-homes every subpath
by one classification rule, so each tier means exactly one thing: neutral-infra is pure,
real-world/external-tool gateways expose capability-facing seams through `@sdl/capability-kit`
with large real implementations placed by an explicit package-placement gate, and intrinsic host
services are provided by the SDK and hidden in the kernel.

It executes a structural rule that the umbrella `sdl-extension-architecture` Objective
asserts but never owns ("gateways are derivable from `exec` and belong above the SDK"). ADR
0019 refines that rule: Capability Kit owns the capability-facing seam, fake, and light adapter,
while large reusable real implementations may remain in or move to standalone packages so the kit
does not become a real-adapter dumping ground. That Objective drives capability migration and
deleting the transitional holding-pen; this sibling owns making the infra tier underneath it
coherent. It is a standalone, cross-referenced Objective, not a child of the umbrella and not a
rename of existing work.

## The classification rule

Each module is classified by **how a consumer reaches it**:

- **Pure utility** — a deterministic transform with no I/O and no SDL runtime knowledge
  (`text-*`, `result`, `primitives`, `time-format`, `markdown-frontmatter`, `managed-region`,
  slug parsers). Stays in `@sdl/core` as the pure-utility library; any layer may depend on it
  directly, no injection needed.
- **Kit gateway** — wraps real-world I/O or an external tool and is *derivable from `exec`*
  (`git`, `github-*`, `exec`, `graphite`, `cmux`). Its capability-facing seam moves to
  `@sdl/capability-kit` as a **per-domain subpath** (`@sdl/capability-kit/git`, `/github`,
  `/exec`, …) that owns the interface, fake/testing support, and any light adapter. ADR 0019's
  package-placement gate decides whether a large real implementation is kit-owned or remains in a
  standalone real package. Capabilities depend on the kit seam laterally and must not import raw
  `@sdl/core` I/O doors.
- **SDK-provided service** — an *intrinsic* host service the author reaches through `ctx` /
  the vended api object (`command-io` → `ctx.stdout`; `progress-phase` → progress). Its
  **interface lives in `sdl-sdk`** and its **implementation is hidden in the kernel**. The
  test: *if the author reaches it through the vended api object, it is SDK-provided.*
- **Runtime harness** — builds the runtime that *creates* the api object and is never reached
  through `ctx` (`cli-entry`). Lives in the kernel (or a neutral CLI-runtime infra home);
  never vended.

`@sdl/brmem` is the **named exception**: it is a stateful host service (not derivable from
`exec`), so it follows the SDK-provided pattern rather than the kit pattern. Its relocation
is deliberately out of scope here and tracked as a separate follow-up Objective.

## Scope

- Decompose `@sdl/core`: classify all ~36 subpaths by the rule above and re-home each. What
  remains in `@sdl/core` is pure utilities by construction.
- Relocate the kit gateways (`git`, `github-*`, `exec`, and the standalone `@sdl/graphite`
  and `@sdl/cmux` packages) to canonical package homes selected by ADR 0019: usually a
  `@sdl/capability-kit/<domain>` seam for interface + fake + light adapter, with large real
  implementations allowed to remain in standalone packages when the placement gate justifies it.
  Repoint every capability/consumer import and **delete the old `@sdl/core` doors** in the same
  slice.
- Move the SDK-provided services (`command-io`, `progress-phase`) so their interfaces sit in
  `sdl-sdk` and their implementations are hidden in the kernel behind `ctx`; repoint `flow`'s
  direct `progress-phase` import onto `ctx`.
- Move `cli-entry` to its runtime-harness home (kernel or neutral CLI-runtime infra); keep
  `runner-usage` as a pure `@sdl/core` util once confirmed I/O-free.
- Classify the residual ambiguous subpaths (`machine-envelope`, `runner-usage`, `model-slug`,
  `branch-slug`, `temp-files`, `xdg`, `clock`, `timers`, `stdin`, `workspace-root`,
  `brmem-cli`) by the `ctx`/I/O test and document each disposition.
- Document the four-bucket classification rule in CONTEXT/ADR so the tiers stay coherent after
  the move.
- As the final cleanup slice, reorganize capability packages/import structure around the final
  `@sdl/capability-kit` seams and SDK-provided services so capabilities no longer carry legacy
  organization imposed by the old `@sdl/core` doors.

## Definition of Progress

Future `objective-next` executions may autonomously advance one coherent semantic slice when the slice is bounded by this Objective, the roadmap guidance, and the policies below. Each slice should remove one old `@sdl/core/*` residual door or complete one documented decision/proof, not mix unrelated residual families for convenience.

For relocated first-party doors, the default compatibility policy is **atomic repoint + delete**: move the implementation/tests to the chosen home, repoint all live in-repo imports, remove the old `@sdl/core` export/source/test in the same slice, and do not leave a compatibility shim. A temporary shim or staged migration requires fresh evidence that the in-repo dependency graph or validation cannot support the atomic move.

Straightforward ADR-classified gateway helpers (`temp-files`, `xdg`, `workspace-root`, `shell-support`, and `text-repair`) should use `@sdl/capability-kit` as the default target home. A slice may choose a narrower standalone neutral/gateway package only when live dependency checks show a tier violation, dependency cycle, or other concrete package-boundary failure; record that adaptation in the Semantic Update.

`model-slug` should be handled as one atomic split: separate the pure model-reference parsing surface from the process/env-backed slug derivation runner, repoint consumers to the appropriate homes, and delete the old mixed `@sdl/core/model-slug` door in the same slice if validation permits.

`clock` and `timers` should keep their pure interface types (`Clock`, `TimerScheduler`, and related structural types) available from `@sdl/core`; autonomous work should move only concrete system adapters (`systemClock`, `systemTimerScheduler`, raw `Date.now` / timer bindings) out of core. Do not force neutral-infra packages through `sdl-sdk` or kernel APIs to use low-level time abstractions.

`brmem-cli` and the broad `@sdl/core/testing` aggregate are final residual cleanup, not early migration drivers. Do not relocate or re-tier `@sdl/brmem` in this Objective. Split `@sdl/core/testing` member-by-member only after the corresponding production surfaces have moved, matching each helper to the final home of the thing it supports.

## Runner Policy

When asked to execute this Objective or continue from `objective-next`, future agents may implement the next roadmap slice without another design prompt if all of the following are true:

- the work is one coherent residual-cleanup, purity-proof, or capability-layout slice named or implied by the roadmap;
- source-search and package-manifest evidence keep the slice inside the Objective's scope and do not require relocating `@sdl/brmem`;
- the chosen target home follows the Definition of Progress above, or any deviation is explicitly evidence-backed and recorded;
- validation can include source-search invariants, targeted package checks/tests for touched packages, and the broad TS lane when feasible;
- the slice writes exactly one new Semantic Update under this Objective with summary, objective impact, follow-ups, and validation/source-search evidence.

Routine validation failures may be fixed locally when they are direct consequences of the slice. If validation fails twice after reasonable local fixes, or the slice would need to cross a Non-Goal or parked follow-up, stop and report the blocker instead of widening scope. Git commits, pushes, Graphite submits, and other external writes still require the invoking workflow or user to explicitly permit them.

## Non-Goals

- Do not relocate or re-tier `@sdl/brmem` — it is the named exception; its SDK-provided
  relocation (below the kernel, vended through the api object) is a separate follow-up
  Objective.
- Do not add a lint guard forbidding capability→real-adapter imports in this Objective.
  Enforcement of "capabilities use the interface, not the real adapter" is **review-only for
  now**; the guard is a tracked follow-up.
- Do not redesign capability behavior, command faces, or the `sdl-sdk` author API beyond moving
  existing interfaces to their classified home and reorganizing capability package layout/imports to
  consume the final seams cleanly.
- Do not take on the umbrella's transitional-package-deletion work. Capability reorganization is now
  in scope only as the final cleanup slice needed to align capability package layout/imports with the
  completed gateway/service re-homing; do not redesign capability behavior or product domain policy.
- Do not migrate the standalone tools (`areg`, `vibechk`, `packagechk`, `worktree-status`)
  off-axis, except where they import a relocated `@sdl/core/*` subpath.

## Completion Criteria

- `@sdl/core` exports only pure utilities; no `@sdl/core` subpath performs real-world I/O or
  wraps an external tool. `@sdl/core/exec` and `@sdl/core/git` no longer exist as
  capability-facing doors.
- `git`, `github-*`, `exec`, `graphite`, and `cmux` no longer have `@sdl/core` raw-I/O doors;
  capability-facing access goes through `@sdl/capability-kit/<domain>` seams, while large real
  implementations may live in standalone packages when ADR 0019's placement gate justifies it.
  No capability imports raw I/O directly.
- `command-io` and `progress-phase` are reached by capabilities through `ctx`; their
  interfaces live in `sdl-sdk` and implementations in the kernel; `flow` no longer imports
  `progress-phase` directly.
- `cli-entry` lives in its runtime-harness home; `runner-usage` is a pure util or, if it does
  I/O, is reclassified and re-homed accordingly.
- Every one of `@sdl/core`'s original subpaths has a documented disposition under the
  four-bucket rule, and the rule itself is recorded in CONTEXT/ADR.
- Capability packages are reorganized around the final gateway/service seams, with legacy
  `@sdl/core`-driven package/import organization removed where it no longer matches the architecture.
- Evidence: targeted package tests for touched packages pass; source searches confirm
  capability imports of `@sdl/core/exec` / `@sdl/core/git` are gone; the runtime dependency
  graph remains acyclic.

## Assumptions and Risks

Assumptions:

- The "reached-through-`ctx` ⇒ SDK-provided" test cleanly classifies every core subpath;
  ambiguous cases (`machine-envelope`, `runner-usage`) resolve by inspecting whether the
  author touches them through the api object or only as a pure shape.
- Gateways genuinely are derivable from `exec`, so moving them above the SDK into
  `@sdl/capability-kit` requires no new kernel surface.
- Revised by ADR 0019: `@sdl/capability-kit` should not automatically absorb every large real
  gateway adapter. Its durable role is the capability-facing seam/fake/light-adapter substrate;
  complex reusable real implementations may remain in standalone packages while `@sdl/core` doors
  are still deleted.
- `@sdl/brmem` is separable as the one stateful service that follows the SDK-provided pattern
  rather than the kit pattern, and isolating it does not block the rest of this work.

Risks:

- **Review-only enforcement leak.** Whether real adapters are kit-owned or standalone, a
  capability can still import a real adapter directly and skip the injected gateway seam,
  re-creating today's `core/exec` leak one tier up. Mitigation: a `SDL_TS_BAN_*` subpath guard is
  an easy follow-up; track whether leaks actually appear before building it.
- **Broad mechanical repoint.** `@sdl/core` has fan-in 31 and `exec` alone has 112 import
  sites; repointing touches nearly every package, risking a partial migration that leaves two
  doors open at once. Mitigation: delete each old subpath in the *same* slice that repoints
  its consumers.
- **Ambiguous subpaths misfiled.** `machine-envelope` and `runner-usage` may not classify
  cleanly; filing them in the wrong bucket re-introduces the incoherence this Objective
  removes. Mitigation: classify by concrete consumer evidence and document the call.
- **Drift with the umbrella.** Making `brmem` SDK-provided (in its follow-up) contradicts the
  umbrella's current "no domain gateways in `sdl-sdk`" Non-Goal. This is a recorded,
  principled exception (a stateful service, not derivable from `exec`), to be reconciled in
  the umbrella's wording when the brmem follow-up lands — not silently resolved here.

## Open Questions

- Does `cli-entry` belong in the kernel or in a neutral CLI-runtime infra package, given that
  non-extension tools (`areg`, `vibechk`, `brmem`) also import it to boot their programs?
- Is `machine-envelope` an SDK-provided output service (interface in `sdl-sdk`, impl in
  kernel) or a kit gateway? It is an output protocol, not obviously derivable from `exec`.
- When `brmem` becomes SDK-provided in its follow-up Objective, is the umbrella's "no domain
  gateways in `sdl-sdk`" Non-Goal rewritten, or does `brmem` ride a distinct "host service"
  surface kept separate from the gateway non-goal?
- Should per-domain kit seams expose `real` and `fake` under nested subpaths (`/git/real`,
  `/git/testing`) only for kit-owned real implementations, and use separate standalone-real package
  names for complex implementations, to make a future ban-guard trivial even though enforcement is
  deferred?

## Closure

Outcome: completed. The Objective's non-parked scope has landed on the current branch and is being
carried by the final delivery PR.

Key evidence:

- ADR 0018 records the four-bucket classification rule and the `@sdl/core` subpath disposition table;
  ADR 0019/0020/0021 refine gateway placement, capability-gateway backend placement, and SDK-provided
  service shape.
- `@sdl/core` is now pure/abstract for the current repository state. The gateway-purity proof found no
  direct filesystem, subprocess, environment, network, concrete host-time, runtime-boot, or old raw-I/O
  gateway implementation in `ts/packages/infra/core/src` or the core package manifest.
- Deleted raw-I/O doors such as `@sdl/core/exec`, `@sdl/core/git`, `@sdl/core/github-*`,
  `@sdl/core/command-io`, `@sdl/core/progress-phase`, `@sdl/core/cli-entry`, `@sdl/core/stdin`,
  `@sdl/core/temp-files`, `@sdl/core/xdg`, `@sdl/core/workspace-root`, `@sdl/core/shell-support`,
  `@sdl/core/text-repair`, `@sdl/core/brmem-cli`, and `@sdl/core/testing` are absent from live imports
  and package exports.
- The final capability package/import-layout cleanup is complete: pure command contracts and formatting
  helpers are imported from `@sdl/core/command`, real execution remains on `@sdl/exec`, and capability
  packages no longer carry layout shaped by the deleted raw-I/O core doors.
- Validation recorded in the final Semantic Update passed: `just ts-deps-check`, `just ts-format-check`,
  `just ts-lint`, `just ts-check`, `just ts-test`, `just ts-test-integration`,
  `just ts-test-typescript-style-guard`, and `just dprint-check`.

PR evidence:

- PR #2563 (current PR): final capability layout reorganization and Objective closure — completes the
  last non-parked roadmap row and records the closure event for the branch that ships the final work.

Remaining caveats and follow-ups:

- `@sdl/brmem` SDK-provided relocation remains deliberately parked for a separate follow-up Objective;
  this Objective only moved the exec-derived brmem CLI helper surface and did not re-tier the brmem
  domain package.
- The `SDL_TS_BAN_*` direct-real-adapter import guard remains parked until leak risk warrants turning
  review-only enforcement into a structural guarantee.
- The durable rule worth carrying forward is the four-bucket placement discipline: keep `@sdl/core` pure,
  put external-tool gateway seams in Capability Kit or ADR-selected backend packages, reach intrinsic
  host services through SDK `ctx`, and keep runtime harness code out of `@sdl/core`.
