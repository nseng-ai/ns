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

- [ ] Relocate the `git` gateway into `@sdl/capability-kit/git` (interface + real + fake
      co-located); repoint all capability/consumer imports off `@sdl/core/git`; delete the
      `@sdl/core/git` door in the same slice.

- [ ] Relocate the `exec` gateway into `@sdl/capability-kit/exec`; repoint all `@sdl/core/exec`
      import sites (~112) and delete the door. Largest mechanical slice — keep repoint + delete
      atomic so two doors never coexist.

- [ ] Relocate the GitHub gateways (`github-cli`, `github-identity`, `github-pr-feedback`,
      `github-pr-status`) into `@sdl/capability-kit/github` per-domain subpaths, honoring ADR
      0016's address-owned PR-feedback seam; repoint consumers and delete the `@sdl/core`
      doors.

- [ ] Fold the standalone `@sdl/graphite` and `@sdl/cmux` gateway packages into
      `@sdl/capability-kit` per-domain subpaths (or explicitly confirm they remain separate
      gateway packages); repoint consumers and reconcile the resulting kernel/graphite edges.

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
      and the runtime dependency graph stays acyclic. This is the Objective's completion
      marker, not a routine validation pass.

## Parked

- [ ] `@sdl/brmem` SDK-provided relocation — make it the first *domain* service on the
      SDK-provided pattern (below the kernel, interface vended through the api object). Owned by
      a separate follow-up Objective; reconcile the umbrella's "no domain gateways in
      `sdl-sdk`" Non-Goal there.

- [ ] `SDL_TS_BAN_*` subpath guard forbidding capability-tier packages from importing
      `@sdl/capability-kit/<domain>` real-adapter subpaths — converts review-only enforcement
      into a structural guarantee once leak risk is observed.
