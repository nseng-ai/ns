# Roadmap

## Work

- [x] Write the four-bucket classification rule (pure util / kit gateway / SDK-provided /
      runtime harness) and the "reached-through-`ctx` ⇒ SDK-provided" test into CONTEXT/ADR,
      and produce the per-subpath disposition table covering all ~36 current `@sdl/core`
      exports.
  - Evidence: ADR 0018 (`docs/adr/0018-four-bucket-neutral-infra-gateway-classification.md`)
    records the four-bucket rule and a disposition table for every current `@sdl/core` export;
    `CONTEXT.md` now carries the concise vocabulary and ADR 0016 cross-references the GitHub
    placement refinement.

- [x] Relocate the `git` gateway per ADR 0019/0020: `@sdl/git` owns the canonical
      `GitGateway` contract, result/parameter types, local branch ref reader, and real adapter;
      `@sdl/capability-kit/git/testing` keeps the in-memory fake; kit-owned Git helpers remain under
      `@sdl/capability-kit/git`; repoint all capability/consumer imports off `@sdl/core/git`; delete
      the `@sdl/core/git` door in the same slice.
  - Evidence: ADR 0020 introduced the Capability Gateway Backend refinement; `@sdl/git` declares
    `sdl.tier: "capability-gateway-backend"` and exports the canonical Git contract plus
    `readLocalBranchRefs`; `@sdl/capability-kit/git/testing` imports the contract from `@sdl/git` and
    remains the fake surface; source search confirms no `@sdl/core/git` live import sites and no
    contract-only imports from `@sdl/capability-kit/git` remain. Validation: `just ts-deps-check`,
    `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, and
    `just ts-test-integration`.

- [x] Relocate the `exec` gateway per ADR 0019; repoint all `@sdl/core/exec` import sites and delete
      the door, keeping repoint + delete atomic so two doors never coexist.
  - Evidence: the pure command layer (types + formatting/normalization helpers) moved to the new
    neutral `@sdl/core/command` subpath; the real child-process adapter (`runCommand`,
    `NodeCommandExecApi`, `defaultCommandResolver`) moved to a new standalone package `@sdl/exec`,
    which re-exports `@sdl/core/command`. `@sdl/core/exec` source and export are deleted; source
    search confirms no live `@sdl/core/exec` import sites remain. `sdl-sdk` keeps only its minimal
    structural `ExecResult`/`ctx.exec` author surface (command-formatting and `withTemporaryFile`
    re-exports removed). Deviation from the original wording: rather than placing
    `ExecResult`/formatting at the SDK/kit boundary and tiering `@sdl/exec` as
    `capability-gateway-backend`, `@sdl/exec` is `neutral-infra` — exec is the foundational execution
    primitive the domain gateways (`@sdl/git`/`@sdl/graphite`/`@sdl/cmux`) build on, and a neutral
    home lets every tier depend on it without duplication, debt edges, or injection gymnastics for
    the neutral/sdk/local-pi-tool consumers that need it. See the Semantic Update for rationale.
    Validation: `just ts-deps-check`, `just ts-format-check`, `just ts-lint`, `just ts-check`,
    `just ts-test`, and `just ts-test-integration`.

- [x] Relocate the GitHub gateways (`github-cli`, `github-identity`, `github-pr-feedback`,
      `github-pr-status`) per ADR 0019: light seams under `@sdl/capability-kit/github` and
      standalone-real placement for complex PR-feedback/status implementations if warranted,
      honoring ADR 0016's address-owned PR-feedback seam; repoint consumers and delete the
      `@sdl/core` doors.
  - Evidence: `@sdl/github` now declares `sdl.tier: "capability-gateway-backend"` and owns the moved
    GitHub CLI, identity, PR-status, GraphQL JSON, and PR-feedback real backend mechanics. Consumers
    import `@sdl/github/*`; `@sdl/address/api` remains the PR-feedback capability seam and re-exports
    only consumer-facing DTOs. `@sdl/core` no longer contains or exports the old `github-*` doors, and
    source search confirms no live `@sdl/core/github-*` imports remain. No Capability Kit GitHub subpath
    was added because this slice did not introduce a separate light seam/fake beyond Address and the
    backend package. Validation: `just ts-deps-check`, `just ts-format-check`, `just ts-lint`,
    `just ts-check`, `just ts-test`, and `just ts-test-integration`.

- [x] Assess standalone `@sdl/graphite` and `@sdl/cmux` with ADR 0019/0020's placement gate;
      confirm they stay standalone Capability Gateway Backend packages for this slice rather than
      exposing additional kit seams.
  - Evidence: `@sdl/graphite` and `@sdl/cmux` declare `sdl.tier: "capability-gateway-backend"`;
    `@sdl/graphite` imports the local branch ref reader from `@sdl/git` and no longer depends on
    `@sdl/capability-kit`; no new `@sdl/capability-kit/graphite` or `@sdl/capability-kit/cmux` seam
    was introduced.

- [x] Move the SDK-provided services: place `command-io` and `progress-phase` interfaces in
      `sdl-sdk`, hide their implementations in the kernel, route capability access through
      `ctx`, and repoint `flow`'s direct `progress-phase` import.
  - Design evidence: ADR 0021 chooses narrow explicit SDK services (`ctx.commandIo: SdlCommandIo`
    and `ctx.progress: SdlProgress`) with SDK-owned command/progress types, existing low-level output
    hooks retained as compatibility primitives, and kernel/host-owned command I/O factories.
  - Evidence: `sdl-sdk` owns and exports `SdlCommandIo`, `SdlCommandMessageOptions`,
    `SdlNotifyLevel`, `SdlProgress`, `SdlProgressPhaseEvent`, and `SdlProgressPhaseListener`;
    `SdlExtensionApi` requires `commandIo` and `progress`; kernel real/CLI contexts populate both;
    Flow/CCC/Pi consumers use SDK types plus the kernel command-I/O adapter; the former core source
    files, tests, and package exports for command I/O and progress phase are deleted. Validation passed:
    `just ts-deps-check`, `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`,
    `just ts-test-integration`, and `just dprint-check`. Source search found no
    `@sdl/core/(command-io|progress-phase)` references.

- [ ] Re-home the runtime harness and residual subpaths: move `cli-entry` to its
      kernel/neutral-runtime home; confirm `runner-usage` is I/O-free and keep it a `@sdl/core`
      util; classify and re-home the remaining ambiguous subpaths (`machine-envelope`,
      `model-slug`, `branch-slug`, `temp-files`, `xdg`, `clock`, `timers`, `stdin`,
      `workspace-root`, `brmem-cli`) per the rule.

- [ ] Establish and prove the purity invariant: source-search confirms no `@sdl/core` subpath
      performs real-world I/O and no capability imports `@sdl/core/exec` or `@sdl/core/git`,
      and the runtime dependency graph stays acyclic. This is the Objective's gateway-purity proof,
      not a routine validation pass.

- [ ] Reorganize capability packages as the final cleanup slice after the gateway/service homes are
      settled: align capability package/import layout around the final `@sdl/capability-kit` seams,
      SDK-provided services, and capability APIs; remove legacy organization imposed by the old
      `@sdl/core` doors without redesigning capability behavior. Reference:
      `references/package-layout-and-core-inventory.md`.

## Parked

- [ ] `@sdl/brmem` SDK-provided relocation — make it the first *domain* service on the
      SDK-provided pattern (below the kernel, interface vended through the api object). Owned by
      a separate follow-up Objective; reconcile the umbrella's "no domain gateways in
      `sdl-sdk`" Non-Goal there.

- [ ] `SDL_TS_BAN_*` subpath guard forbidding capability-tier packages from importing
      `@sdl/capability-kit/<domain>` real-adapter subpaths — converts review-only enforcement
      into a structural guarantee once leak risk is observed.
