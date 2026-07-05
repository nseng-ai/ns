# ADR 0018: Four-bucket neutral-infra gateway classification

## Status

Accepted — refines ADR 0009, ADR 0012, ADR 0016, and ADR 0017. Refined by ADR 0019, which
adds a package-placement gate: this ADR's per-domain *bucket* stands, but the *concrete package*
that owns a large real implementation (and whether it folds into `@sdl/capability-kit` or stays in
a standalone/deferred home) is governed by ADR 0019.

(amended by ADR 0029: the `@sdl/core`/`ts/packages/infra/core` paths cited throughout this ADR's
disposition table are now `@nseng-ai/foundation` at `ts/packages/infra/foundation`; the per-export
bucket analysis below is otherwise unchanged.)

## Context

`@sdl/core` currently mixes pure utilities, real-world I/O gateways, SDK-like host services,
and CLI/runtime boot mechanics behind one `neutral-infra` package tier. That made the lower tier
look coherent in manifests while capabilities still reached raw process, git, GitHub, filesystem,
clock, timer, and command-output mechanics directly.

ADR 0009 established gateway-injected capability cores and rejected freezing derived gateways such
as `ctx.git` into the SDK. ADR 0012 split the above-SDK tier into Capability Kit plus
Capabilities and kept product domain out of the kit. ADR 0016 placed GitHub real mechanics in
`@sdl/core` while keeping the Address PR-feedback seam in `@sdl/address/api`. The current target
architecture needs a sharper rule: neutral infra is pure; first-party real-world/external-tool
gateways live in Capability Kit; intrinsic host services are reached through the SDK API object;
and program boot code lives with the kernel/runtime harness.

## Decision

### The four buckets

Each exported lower-level module is classified by how consumers should reach it.

1. **Pure utility** — deterministic transforms with no I/O and no SDL runtime knowledge. These stay
   in `@sdl/core`, which becomes the pure neutral-infra utility library.
2. **Kit gateway** — wrappers around real-world I/O, external tools, external protocols, or
   domain-specific filesystem-backed resources that capabilities should consume through an injected
   gateway. These move to `@sdl/capability-kit` as per-domain subpaths that co-locate interface,
   real adapter, and fake/testing support.
3. **SDK-provided service** — intrinsic host services reached by extension authors through the
   vended API object (`ctx`). Their author-facing interfaces live in `sdl-sdk`; implementations are
   hidden in the kernel. The test is: if the author reaches it through the vended API object, it is
   SDK-provided.
4. **Runtime harness** — code that creates or boots the runtime/API object and is never reached
   through `ctx`. This lives in the kernel or a named neutral CLI-runtime infra home, not in
   `@sdl/core` long term.

This refines ADR 0016: GitHub identity, status, CLI, and PR-feedback real mechanics no longer
belong in `@sdl/core` as target architecture. They belong under `@sdl/capability-kit/github` (with
narrower subpaths as needed), while the PR-feedback capability-facing seam remains owned by
`@sdl/address/api`.

This also broadens the first-party role of Capability Kit from only the thin `ctx`→gateway adapter
into the first-party gateway library for external tools/protocols and their fakes. It remains
capability-agnostic and is still not a product capability home.

`@sdl/brmem` is the named exception for this Objective. It is stateful host service territory, not
an external tool derivable from `exec`, but relocating the `@sdl/brmem` package is out of scope and
belongs to a separate follow-up Objective. The table below classifies only the current
`@sdl/core/brmem-cli` helper/export.

The import-ban guard that prevents capabilities from importing real-adapter subpaths directly is a
follow-up, not part of this decision slice.

### Disposition table for current `@sdl/core` exports

Source of truth: `ts/packages/infra/core/package.json` export map at the time of this ADR.

| Export                    | Current source                    | Bucket                        | Target home                                                                                                                                                  | Rationale / follow-up                                                                                                                                                                                                      |
| ------------------------- | --------------------------------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `.`                       | `src/index.ts`                    | Pure utility                  | `@sdl/core` root                                                                                                                                             | Root currently re-exports pure primitives only. Keep the root pure as non-pure doors move out.                                                                                                                             |
| `./branch-slug`           | `src/branch-slug.ts`              | Pure utility                  | `@sdl/core/branch-slug`                                                                                                                                      | String normalization/sanitization only.                                                                                                                                                                                    |
| `./primitives`            | `src/primitives.ts`               | Pure utility                  | `@sdl/core/primitives`                                                                                                                                       | Generic record/error/path-containment/hash helpers; no real I/O despite `node:path`/`node:crypto` use.                                                                                                                     |
| `./result`                | `src/result.ts`                   | Pure utility                  | `@sdl/core/result`                                                                                                                                           | Result and error-detail formatting; `stdout`/`stderr` are data fields, not streams.                                                                                                                                        |
| `./command-io`            | `src/command-io.ts`               | SDK-provided service          | `sdl-sdk` interface plus kernel implementation                                                                                                               | Command output/progress is an intrinsic host service and should be reached through `ctx`, not imported by capability cores.                                                                                                |
| `./markdown-frontmatter`  | `src/markdown-frontmatter.ts`     | Pure utility                  | `@sdl/core/markdown-frontmatter`                                                                                                                             | Markdown/frontmatter string parsing and line-ending helpers only.                                                                                                                                                          |
| `./managed-region`        | `src/managed-region.ts`           | Pure utility                  | `@sdl/core/managed-region`                                                                                                                                   | Managed-region string boundary calculation only.                                                                                                                                                                           |
| `./text-table`            | `src/text-table.ts`               | Pure utility                  | `@sdl/core/text-table`                                                                                                                                       | Text rendering helper over strings and ANSI width handling; no writer.                                                                                                                                                     |
| `./terminal-escapes`      | `src/terminal-escapes.ts`         | Pure utility                  | `@sdl/core/terminal-escapes`                                                                                                                                 | ANSI escape stripping/formatting constants and transforms.                                                                                                                                                                 |
| `./terminal-presentation` | `src/terminal-presentation.ts`    | Pure utility                  | `@sdl/core/terminal-presentation`                                                                                                                            | Presentation string helpers; no terminal I/O.                                                                                                                                                                              |
| `./text-normalization`    | `src/text-normalization.ts`       | Pure utility                  | `@sdl/core/text-normalization`                                                                                                                               | Deterministic text cleanup; already re-exported by SDK docs as pure helpers.                                                                                                                                               |
| `./text-truncation`       | `src/text-truncation.ts`          | Pure utility                  | `@sdl/core/text-truncation`                                                                                                                                  | Deterministic excerpt/truncation helpers.                                                                                                                                                                                  |
| `./time-format`           | `src/time-format.ts`              | Pure utility                  | `@sdl/core/time-format`                                                                                                                                      | Formats provided durations/timestamps; does not read the clock.                                                                                                                                                            |
| `./xdg`                   | `src/xdg.ts`                      | Kit gateway                   | `@sdl/capability-kit/xdg`                                                                                                                                    | Resolves environment-backed XDG paths and creates private directories. Keep this as a narrow XDG/storage primitive; callers should still prefer domain-specific storage gateways rather than a generic filesystem gateway. |
| `./clock`                 | `src/clock.ts`                    | SDK-provided service          | `sdl-sdk` time interface plus kernel implementation                                                                                                          | System time is an intrinsic host service. Current direct `systemClock` imports should move behind `ctx` where extensions need time; fakes/testing support follows the service.                                             |
| `./timers`                | `src/timers.ts`                   | SDK-provided service          | `sdl-sdk` timer interface plus kernel implementation                                                                                                         | Scheduling timers is an intrinsic host service. Current direct `systemTimerScheduler` imports should move behind `ctx` for extension code.                                                                                 |
| `./cli-entry`             | `src/cli-entry.ts`                | Runtime harness               | Kernel or neutral CLI-runtime infra package                                                                                                                  | Boots Clinkr programs, reads package metadata, resolves argv/env/cwd, and sets `process.exitCode`; it creates the runtime edge rather than being reached through `ctx`.                                                    |
| `./exec`                  | `src/exec.ts`                     | Kit gateway                   | `@sdl/capability-kit/exec`                                                                                                                                   | Child-process gateway and command-result formatting; interfaces, real adapter, and fakes belong together in the kit.                                                                                                       |
| `./shell-support`         | `src/shell-support.ts`            | Kit gateway                   | `@sdl/capability-kit/shell`                                                                                                                                  | Reads/writes shell rc files and detects shell/home environment. Keep it domain-specific to shell integration, not a generic filesystem seam.                                                                               |
| `./model-slug`            | `src/model-slug.ts`               | Kit gateway                   | Split: pure model-ref parsing in `@sdl/core/model-slug`; slug derivation runner in `@sdl/capability-kit/model-slug` or text-generation kit subpath           | The export mixes pure model-reference parsing with `process.env` and `pi` subprocess execution. The move should split the pure parser from the real derivation gateway.                                                    |
| `./github-cli`            | `src/github-cli.ts`               | Kit gateway                   | `@sdl/capability-kit/github/cli`                                                                                                                             | Wraps the external `gh` CLI via an injected command runner.                                                                                                                                                                |
| `./github-pr-feedback`    | `src/github-pr-feedback/index.ts` | Kit gateway                   | `@sdl/capability-kit/github/pr-feedback` for real mechanics; `@sdl/address/api` keeps the PR-feedback seam                                                   | Real adapter, GraphQL args/queries/schemas, pagination, and normalization are GitHub gateway mechanics. Address remains the capability API owner for PR-feedback consumer vocabulary.                                      |
| `./github-identity`       | `src/github-identity.ts`          | Kit gateway                   | `@sdl/capability-kit/github/identity`                                                                                                                        | Pure URL/remote parsing today, but it is GitHub external-protocol mechanics and should move with the GitHub gateway family rather than keeping a `github-*` door in core.                                                  |
| `./github-pr-status`      | `src/github-pr-status.ts`         | Kit gateway                   | `@sdl/capability-kit/github/pr-status`                                                                                                                       | GraphQL query args, parsing, status normalization, and check tally mechanics belong with the GitHub gateway family.                                                                                                        |
| `./stdin`                 | `src/stdin.ts`                    | SDK-provided service          | `sdl-sdk` input interface plus kernel implementation                                                                                                         | Reads `process.stdin` / readline; extension authors should consume host input through `ctx`, while standalone tools may use a kernel/runtime adapter.                                                                      |
| `./temp-files`            | `src/temp-files.ts`               | Kit gateway                   | `@sdl/capability-kit/temp-files`                                                                                                                             | Uses OS temp directories and filesystem writes/removal; already has a kit re-export. Keep it as a precise temp-resource helper, not a generic filesystem gateway.                                                          |
| `./git`                   | `src/git/index.ts`                | Kit gateway                   | `@sdl/capability-kit/git`                                                                                                                                    | Git gateway interface, real adapter, parsers, and errors are the core example of a gateway derived from `exec`.                                                                                                            |
| `./git/testing`           | `src/git/testing.ts`              | Kit gateway                   | `@sdl/capability-kit/git/testing`                                                                                                                            | In-memory `GitGateway` fake should co-locate with the Git gateway contract.                                                                                                                                                |
| `./brmem-cli`             | `src/brmem-cli.ts`                | SDK-provided exception helper | Hold temporarily, then move with the separate brmem SDK-provided follow-up                                                                                   | This helper runs/checks the `brmem` command and parses its machine envelopes. Do not use it to relocate `@sdl/brmem` in this Objective; classify only the core helper as exception-adjacent debt.                          |
| `./workspace-root`        | `src/workspace-root.ts`           | Kit gateway                   | `@sdl/capability-kit/workspace-root`                                                                                                                         | Filesystem marker search over cwd ancestry. Keep it as a workspace-root environment helper; do not generalize to a shared filesystem gateway.                                                                              |
| `./testing`               | `src/testing/index.ts`            | Kit gateway testing support   | Split by member: pure helpers in `@sdl/core/testing`, gateway fakes and real temp/subprocess helpers under matching `@sdl/capability-kit/*/testing` subpaths | Aggregates subprocess CLI smoke helpers, temp repo/filesystem helpers, scripted exec/text-generation fakes, manual clocks, and timers. It must not preserve old gateway doors after individual moves.                      |
| `./runner-usage`          | `src/runner-usage.ts`             | Pure utility                  | `@sdl/core/runner-usage`                                                                                                                                     | JSONL usage parsing and token/cost aggregation only; no I/O.                                                                                                                                                               |
| `./machine-envelope`      | `src/machine-envelope.ts`         | Pure utility                  | `@sdl/core/machine-envelope`                                                                                                                                 | Parses and formats machine-envelope JSON data. It currently imports pure `tailText` through `./exec`; extract or duplicate the pure truncation helper so the module remains pure when `exec` moves.                        |
| `./text-repair`           | `src/text-repair.ts`              | Kit gateway helper            | `@sdl/capability-kit/text-repair`                                                                                                                            | Orchestrates an injected text generator, validation, retry, and progress heartbeat. ADR 0012 already treats text-repair as a Capability Kit helper.                                                                        |
| `./progress-phase`        | `src/progress-phase.ts`           | SDK-provided service          | `sdl-sdk` progress interface plus kernel implementation                                                                                                      | Source is pure event/listener types today, but the service is progress emission/observation reached through `ctx`; `flow` should not import it directly from core.                                                         |

## Consequences

- `@sdl/core`'s target role is pure utility only. When a non-pure export is relocated, the old
  core door should be deleted in the same slice so two canonical homes do not coexist.
- Capability Kit becomes the first-party gateway library for `exec`, `git`, GitHub, shell, XDG,
  workspace-root, temp-file, text-repair, and similar precise gateway/helper domains. It still does
  not own product capability policy.
- SDK-provided services are limited to intrinsic host services reached through `ctx`, such as
  command I/O, progress, stdin/input, time, and timers. This is not permission to move every
  non-deterministic helper into the SDK.
- ADR 0016 remains historical for the Address seam decision, but its target placement of GitHub
  real mechanics in `@sdl/core` is superseded by this ADR.
- `@sdl/brmem` remains parked for a separate follow-up. This ADR does not relocate that package or
  resolve its eventual SDK-provided surface.

## Rejected Alternatives

- **Leave reusable real mechanics in `@sdl/core`.** Rejected because it preserves the current
  incoherent neutral-infra tier and keeps capability-facing raw I/O doors open.
- **Expose derived gateways as SDK methods such as `ctx.git`.** Rejected consistently with ADR
  0009: external-tool gateways are derivable from `exec` and belong in the opinionated first-party
  gateway kit, not the public SDK contract.
- **Create a generic filesystem gateway.** Rejected because filesystem-backed boundaries must be
  domain-specific seams with their own path vocabulary, containment, and persistence semantics.
- **Relocate `@sdl/brmem` as part of this slice.** Rejected because the Objective records brmem as a
  named exception with a separate follow-up.
