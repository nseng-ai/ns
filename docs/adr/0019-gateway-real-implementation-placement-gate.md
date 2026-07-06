# ADR 0019: Gateway real-implementation placement gate

## Status

Accepted — refines ADR 0018 (and through it ADR 0009, ADR 0012, ADR 0016).

(amended by ADR 0029: the `@sdl/core`/`ts/packages/infra/core` paths cited throughout this ADR's
per-domain placement table are now `@nseng-ai/foundation` at `ts/packages/infra/foundation`; the
placement analysis below is otherwise unchanged.)

(amended by the gateway-consumer-hygiene slice, 2026-07-06: the `git` row's "revisit
`capability-kit-owned` after the split" is resolved toward **`capability-kit-owned`** —
`RealGitGateway` and the `GitGateway` seam live in `@nseng-ai/capability-kit/git`. Evidence: 15
consumers across four consumption tiers, three exec-adapter construction seams
(`NodeCommandExecApi`, `NsCommandExecApi`, and Pi exec bridging), no cycle pressure materialized,
and adapter LOC stayed stable rather than bloating the kit. Consumer-facing shape rules — how
consumers narrow against the seam and what the kit may export as standalone command-shape — now
live in `docs/conventions/consumer-gateways-and-command-shape.md`.)

## Context

ADR 0018 established the four-bucket rule for decomposing `@sdl/core` (pure utility, Kit gateway,
SDK-provided service, runtime harness) and a per-export disposition table. Its target home for every
Kit gateway is a per-domain `@sdl/capability-kit/<domain>` subpath that co-locates interface, real
adapter, and fake.

Taken literally, that target would relocate every real adapter — `git` (~1233 LOC), the GitHub
PR-feedback family (~1304 LOC), `graphite` (~1784 LOC), `cmux` (~883 LOC), `exec` (~461 LOC), and
more — wholesale into `@sdl/capability-kit`. That risks turning Capability Kit into a large
real-adapter implementation package rather than the first-party seam/fake/light-adapter substrate
described in `CONTEXT.md`. It also ignores that some real implementations capture substantial
reusable complexity that could serve the kernel, SDK-provided services, standalone tools, or
non-capability libraries, and that some moves may be cycle-sensitive depending on the live
dependency graph and must be checked per domain rather than assumed.

(Note: an earlier draft of this ADR cited `@sdl/kernel` depending on `@sdl/graphite` as a live
cycle risk. That edge was a stale, unused manifest dependency — no kernel `.ts` imported
`@sdl/graphite` — and it has since been removed from `ts/packages/kernel/package.json`. The
graphite/cmux rows below reflect the corrected graph.)

The four-bucket rule answers *which tier* a `@sdl/core` export belongs to. It does not, on its own,
answer *which concrete package* should own a large real implementation once the old `@sdl/core` door
is gone. This ADR refines ADR 0018 to add that second decision as an explicit gate, applied per
domain, before any migration code lands.

ADR 0018's hard invariant is preserved unchanged: when a non-pure export is relocated, the old
`@sdl/core` door is deleted in the same atomic slice so two canonical homes never coexist. This ADR
only refines *where the real implementation lands*; it never licenses leaving a `@sdl/core/<gateway>`
door in place.

## Decision

### A multi-factor placement gate

Before migrating a gateway domain, assess it against all of the following factors. No single factor
(and in particular no raw LOC threshold) decides placement; the factors are weighed together.

1. **Complexity / maintenance weight** — LOC, file count, parsing/state/error-handling complexity,
   and integration-test burden of the real adapter.
2. **Reusable host/runtime/library value** — whether the real implementation could plausibly serve
   the kernel, an SDK-provided service implementation, a standalone tool, or a non-capability
   library, rather than only capability cores.
3. **Dependency / cycle pressure** — whether folding the implementation into Capability Kit would
   create a package cycle or an awkward upward/downward edge in the Extension Dependency Graph.
4. **Capability Kit size impact** — whether folding would make Capability Kit *mostly* real-adapter
   implementation for that domain instead of a seam/fake/light-adapter substrate.
5. **Consumer semantics** — whether capability consumers need only an interface, fake, and light
   factory, while the heavy real implementation can sit behind a separate package.

### Allowed placement outcomes

Each gateway domain resolves to one of the following. Several are explicitly *temporary* states that
defer the final package boundary while still closing the `@sdl/core` door.

- **`capability-kit-owned`** — interface, fake, and real implementation all live under
  `@sdl/capability-kit/<domain>`. Appropriate when the real adapter is light and capability-shaped.
- **`kit-interface-standalone-real`** — `@sdl/capability-kit/<domain>` owns the interface, types
  needed by capability cores, and the fake/testing support, while a standalone package owns the
  complex real implementation for now. A light factory may bridge them only when it does not create
  an unwanted dependency edge.
- **`sdk-provided`** — the author-facing interface moves to `sdl-sdk`; the kernel hides the
  implementation; capabilities reach it through `ctx`.
- **`runtime-harness`** — the code moves to the kernel or a named neutral CLI-runtime infra home; it
  is never reached through `ctx`.
- **`deferred-exception`** — the old `@sdl/core` door is deleted, but the final real-implementation
  home is explicitly recorded as deferred with a current package owner and a follow-up trigger.

### Hard invariant

`deferred` (and every other outcome) **must never** mean leaving `@sdl/core/<gateway>` in place as
the old door. Deferral concerns only the *final* home of an already-relocated real implementation,
not whether the `@sdl/core` raw-I/O door is closed. The door is always deleted in the same atomic
slice that repoints its consumers.

### Process placement

This assessment is a standalone first deliverable, produced (in this ADR and its table below) before
any gateway migration code changes. Each subsequent migration slice re-checks the gate for its domain
if the placement is not already fully settled here, creates the target package exports first,
repoints consumers, deletes the old `@sdl/core` door, moves the owning tests, and records a Semantic
Update.

### Per-domain placement assessment

Source of truth for current homes/exports: `ts/packages/infra/core/package.json`,
`ts/packages/infra/graphite`, and `ts/packages/cmux` at the time of this ADR. Sizes are approximate
LOC of the implementation directory/file; "consumers" counts `.ts` files importing the subpath under
`ts/` at the time of this ADR. These are decision inputs, not exact metrics.

| Domain / export(s)              | Current home                                            | Size (LOC) | Consumers (files) | ADR 0018 bucket                | Chosen target pattern                                                                 | Concrete next home                                                                                                                      | Old door(s) to delete                                        | Risk / cycle notes                                                                                                                                                                                                                                                                   |
| ------------------------------- | ------------------------------------------------------- | ---------- | ----------------- | ------------------------------ | ------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `git`, `git/testing`            | `ts/packages/infra/core/src/git/`                       | ~1233      | 110               | Kit gateway                    | `kit-interface-standalone-real` (revisit `capability-kit-owned` after split)          | `@sdl/capability-kit/git` owns interface + types + fake; complex `RealGitGateway` stays in a standalone/real package unless it shrinks  | `@sdl/core/git`, `@sdl/core/git/testing`                     | Central, high-fan-out (110 files). `sdl-capability-kit/src/git.ts` currently imports `RealGitGateway` from `@sdl/core/git`. Avoid bloating the kit with the adapter.                                                                                                                 |
| `exec`                          | `ts/packages/infra/core/src/exec.ts`                    | ~461       | 161               | Kit gateway                    | `kit-interface-standalone-real` + `sdk-provided` boundary for result/formatting types | Real child-process adapter outside `@sdl/core` (standalone/kernel-adjacent); `ExecResult`/formatting via stable `sdl-sdk`/kit boundary  | `@sdl/core/exec`                                             | Largest mechanical slice (161 files). `sdl-sdk/src/execution.ts` re-exports `ExecResult` + formatting from `@sdl/core/exec`; needs a stable type boundary first.                                                                                                                     |
| `github-cli`                    | `ts/packages/infra/core/src/github-cli.ts`              | small      | 5                 | Kit gateway                    | `capability-kit-owned`                                                                | `@sdl/capability-kit/github/cli`                                                                                                        | `@sdl/core/github-cli`                                       | Light `gh` wrapper over injected command runner.                                                                                                                                                                                                                                     |
| `github-identity`               | `ts/packages/infra/core/src/github-identity.ts`         | small      | 5                 | Kit gateway                    | `capability-kit-owned`                                                                | `@sdl/capability-kit/github/identity`                                                                                                   | `@sdl/core/github-identity`                                  | Pure-ish URL/remote parsing, but GitHub-protocol mechanics; move with the family.                                                                                                                                                                                                    |
| `github-pr-feedback`            | `ts/packages/infra/core/src/github-pr-feedback/`        | ~1304      | 3                 | Kit gateway                    | `kit-interface-standalone-real`                                                       | `@sdl/capability-kit/github/pr-feedback` for real mechanics; `@sdl/address/api` keeps the capability-facing PR-feedback seam (ADR 0016) | `@sdl/core/github-pr-feedback`                               | Complex GraphQL/pagination/normalization. Must preserve ADR 0016's Address-owned seam.                                                                                                                                                                                               |
| `github-pr-status`              | `ts/packages/infra/core/src/github-pr-status.ts`        | ~563       | 5                 | Kit gateway                    | `kit-interface-standalone-real`                                                       | `@sdl/capability-kit/github/pr-status` for the interface/fake; complex real mechanics behind a standalone/real package if warranted     | `@sdl/core/github-pr-status`                                 | GraphQL args/parsing/tally complexity.                                                                                                                                                                                                                                               |
| `graphite`                      | `ts/packages/infra/graphite/src/`                       | ~1784      | 45                | Kit gateway (standalone today) | `kit-interface-standalone-real` or documented standalone exception                    | Likely keep standalone `@sdl/graphite` for the real implementation; expose interface/fake via kit only if needed                        | n/a — already standalone, not a `@sdl/core` door             | The previously assumed `@sdl/kernel` → `@sdl/graphite` edge was a stale, unused manifest dependency (no kernel `.ts` imported it) and has been removed; not cycle-sensitive on the current graph. Decide fold-vs-standalone on kit-size impact; re-verify the graph before any move. |
| `cmux`                          | `ts/packages/cmux/src/`                                 | ~883       | 16                | Kit gateway (standalone today) | `kit-interface-standalone-real` or documented standalone exception                    | Decide fold-vs-standalone by dependency graph; default to keeping standalone if folding bloats the kit                                  | n/a — already standalone, not a `@sdl/core` door             | No kernel/graphite edges; tier `neutral-infra`, depends only on `@sdl/core`, sole consumer is `@sdl/ccc`. Not cycle-sensitive — decide fold-vs-standalone on kit-size impact alone.                                                                                                  |
| `command-io`                    | formerly `ts/packages/infra/core/src/command-io.ts`     | small      | 9                 | SDK-provided service           | `sdk-provided`                                                                        | Interface in `sdl-sdk`; implementation hidden in `@sdl/kernel`; reached via `ctx`                                                       | the former `@sdl/core` command-io door                       | Avoid leaking derived gateways onto `ctx`.                                                                                                                                                                                                                                           |
| `progress-phase`                | formerly `ts/packages/infra/core/src/progress-phase.ts` | small      | 6                 | SDK-provided service           | `sdk-provided`                                                                        | Interface in `sdl-sdk`; kernel implementation; `flow` consumes via `ctx` instead of importing core                                      | the former `@sdl/core` progress-phase door                   | Source is pure event/listener types today; the *service* is the SDK-provided concept.                                                                                                                                                                                                |
| `stdin`                         | `ts/packages/infra/core/src/stdin.ts`                   | small      | 9                 | SDK-provided service           | `sdk-provided`                                                                        | `sdl-sdk` input interface + kernel implementation; standalone tools may use a kernel/runtime adapter                                    | `@sdl/core/stdin`                                            | Reads `process.stdin`/readline.                                                                                                                                                                                                                                                      |
| `clock`                         | `ts/packages/infra/core/src/clock.ts`                   | small      | 8                 | SDK-provided service           | `sdk-provided`                                                                        | `sdl-sdk` time interface + kernel implementation; fakes follow the service                                                              | `@sdl/core/clock`                                            | Direct `systemClock` imports move behind `ctx`.                                                                                                                                                                                                                                      |
| `timers`                        | `ts/packages/infra/core/src/timers.ts`                  | small      | 8                 | SDK-provided service           | `sdk-provided`                                                                        | `sdl-sdk` timer interface + kernel implementation                                                                                       | `@sdl/core/timers`                                           | Direct `systemTimerScheduler` imports move behind `ctx`.                                                                                                                                                                                                                             |
| `cli-entry`                     | `ts/packages/infra/core/src/cli-entry.ts`               | ~302       | 13                | Runtime harness                | `runtime-harness`                                                                     | `@sdl/kernel` or a named neutral CLI-runtime infra package                                                                              | `@sdl/core/cli-entry`                                        | Creates the runtime edge (boots Clinkr, sets `process.exitCode`); never reached via `ctx`.                                                                                                                                                                                           |
| `xdg`                           | `ts/packages/infra/core/src/xdg.ts`                     | small      | 8                 | Kit gateway                    | `capability-kit-owned`                                                                | `@sdl/capability-kit/xdg` as a narrow XDG/storage primitive                                                                             | `@sdl/core/xdg`                                              | Keep domain-specific; do not generalize into a filesystem gateway.                                                                                                                                                                                                                   |
| `temp-files`                    | `ts/packages/infra/core/src/temp-files.ts`              | small      | 6                 | Kit gateway                    | `capability-kit-owned`                                                                | `@sdl/capability-kit/temp-files` (kit re-export already exists)                                                                         | `@sdl/core/temp-files`                                       | `sdl-sdk/src/execution.ts` re-exports `withTemporaryFile`; handle with the temp-files move.                                                                                                                                                                                          |
| `workspace-root`                | `ts/packages/infra/core/src/workspace-root.ts`          | small      | 2                 | Kit gateway                    | `capability-kit-owned`                                                                | `@sdl/capability-kit/workspace-root`                                                                                                    | `@sdl/core/workspace-root`                                   | Keep as workspace-root env helper, not a generic filesystem gateway.                                                                                                                                                                                                                 |
| `shell-support`                 | `ts/packages/infra/core/src/shell-support.ts`           | small      | 1                 | Kit gateway                    | `capability-kit-owned`                                                                | `@sdl/capability-kit/shell`                                                                                                             | `@sdl/core/shell-support`                                    | Domain-specific to shell rc integration.                                                                                                                                                                                                                                             |
| `model-slug`                    | `ts/packages/infra/core/src/model-slug.ts`              | ~366       | 25                | Kit gateway (mixed)            | split: pure stays + `capability-kit-owned` real                                       | Pure model-ref parsing in `@sdl/core/model-slug`; slug-derivation runner in a kit/text-generation subpath                               | `@sdl/core/model-slug` (only the non-pure half)              | Mixed module: pure parsing + `process.env`/`pi` subprocess. Split rather than bucket whole.                                                                                                                                                                                          |
| `machine-envelope`              | `ts/packages/infra/core/src/machine-envelope.ts`        | small      | 3                 | Pure utility                   | stays pure                                                                            | `@sdl/core/machine-envelope`                                                                                                            | none (pure) — remove its `./exec` dependency                 | Currently imports pure `tailText` via `./exec`; extract/duplicate the pure helper so it stays pure when `exec` moves.                                                                                                                                                                |
| `text-repair`                   | `ts/packages/infra/core/src/text-repair.ts`             | small      | 3                 | Kit gateway helper             | `capability-kit-owned`                                                                | `@sdl/capability-kit/text-repair`                                                                                                       | `@sdl/core/text-repair`                                      | Orchestrates injected text generator + retry; ADR 0012 already treats it as a kit helper.                                                                                                                                                                                            |
| `testing` (`@sdl/core/testing`) | `ts/packages/infra/core/src/testing/`                   | mixed      | n/a               | Kit gateway testing support    | split by member                                                                       | Pure test helpers in `@sdl/core/testing`; gateway fakes + real temp/subprocess helpers under matching `@sdl/capability-kit/*/testing`   | partial — only the non-pure members' doors                   | Must not leave old gateway doors after individual members move.                                                                                                                                                                                                                      |
| `brmem-cli`                     | `ts/packages/infra/core/src/brmem-cli.ts`               | small      | n/a               | SDK-provided exception helper  | `deferred-exception`                                                                  | Hold temporarily; move with the separate `@sdl/brmem` SDK-provided follow-up                                                            | `@sdl/core/brmem-cli` (when the brmem follow-up takes it on) | Do not relocate `@sdl/brmem` in this Objective; only the core helper is classified.                                                                                                                                                                                                  |
| `runner-usage`                  | `ts/packages/infra/core/src/runner-usage.ts`            | small      | n/a               | Pure utility                   | stays pure                                                                            | `@sdl/core/runner-usage`                                                                                                                | none — confirm I/O-free and keep                             | JSONL parsing / token aggregation only.                                                                                                                                                                                                                                              |

## Consequences

- The migration may legitimately leave some complex real implementations in standalone packages
  (`kit-interface-standalone-real`) or in their current standalone packages (`graphite`, `cmux`)
  rather than folding everything into `@sdl/capability-kit`. Capability Kit stays a seam/fake/light-
  adapter substrate, not a real-adapter dumping ground.
- Every gateway slice still deletes its old `@sdl/core` door in the same atomic slice. A `deferred`
  outcome defers only the final home of the relocated real implementation, never the door deletion.
- `git`, `exec`, GitHub PR-feedback/PR-status are pre-judged toward `kit-interface-standalone-real`
  pending detailed inspection during their slices; `github-cli`/`github-identity`, `xdg`,
  `temp-files`, `workspace-root`, `shell-support`, and `text-repair` toward `capability-kit-owned`;
  `command-io`, `progress-phase`, `stdin`, `clock`, `timers` toward `sdk-provided`; and `cli-entry`
  toward `runtime-harness`.
- ADR 0018's disposition table remains the bucket authority; this ADR is the package-placement
  authority layered on top of it. Where the two appear to disagree about a *home*, this ADR's
  placement gate governs and should be cited in the relevant slice's Semantic Update.

## Rejected Alternatives

- **Fold every real adapter into `@sdl/capability-kit` per ADR 0018's literal target.** Rejected
  because it would make Capability Kit a large real-adapter package and contradict its
  seam/fake/light-adapter role in `CONTEXT.md`.
- **Decide placement by a raw LOC threshold alone.** Rejected; size is one factor among reuse value,
  cycle pressure, kit-size impact, and consumer semantics.
- **Keep old `@sdl/core/<gateway>` doors as compatibility shims while deferring the final home.**
  Rejected; ADR 0018's door-deletion invariant is preserved. Deferral never reopens a `@sdl/core`
  door.
- **Block all migration until every final package boundary is decided.** Rejected; the
  `deferred-exception` and `kit-interface-standalone-real` outcomes let slices close `@sdl/core`
  doors now while recording a documented follow-up for the final home.
