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

- [x] Relocate the `git` gateway per ADR 0019: `@sdl/capability-kit/git` owns the
      capability-facing interface, fake/testing support, and light adapter, while the complex real
      implementation may stay standalone if the placement gate still justifies it; repoint all
      capability/consumer imports off `@sdl/core/git`; delete the `@sdl/core/git` door in the same
      slice.
  - Evidence: `@sdl/capability-kit/git` and `@sdl/capability-kit/git/testing` now own the seam,
    helper functions, ref-reader utility, and in-memory fake; `@sdl/git` owns `RealGitGateway`;
    `@sdl/core` no longer exports `./git` or `./git/testing`; source search confirms no
    `@sdl/core/git` live import sites remain. Validation: `just ts-deps-check`,
    `just ts-format-check`, `just ts-lint`, `just ts-check`, `just ts-test`, and
    `just ts-test-integration`.

- [ ] Relocate the `exec` gateway per ADR 0019; stabilize `ExecResult`/formatting at the
      SDK/kit boundary before moving real child-process execution, repoint all `@sdl/core/exec`
      import sites, and delete the door. Largest mechanical slice — keep repoint + delete atomic so
      two doors never coexist.

- [ ] Relocate the GitHub gateways (`github-cli`, `github-identity`, `github-pr-feedback`,
      `github-pr-status`) per ADR 0019: light seams under `@sdl/capability-kit/github` and
      standalone-real placement for complex PR-feedback/status implementations if warranted,
      honoring ADR 0016's address-owned PR-feedback seam; repoint consumers and delete the
      `@sdl/core` doors.

- [ ] Assess standalone `@sdl/graphite` and `@sdl/cmux` with ADR 0019's placement gate;
      explicitly confirm whether they stay standalone real packages or expose additional kit seams.
      The stale manifest-only `@sdl/kernel` → `@sdl/graphite` edge has been removed, so the next
      decision is kit-size/consumer-semantics driven rather than cycle-driven.

- [ ] Move the SDK-provided services: place `command-io` and `progress-phase` interfaces in
      `sdl-sdk`, hide their implementations in the kernel, route capability access through
      `ctx`, and repoint `flow`'s direct `progress-phase` import.

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
