# Roadmap

## Work

- [x] Inventory PR Address surfaces, consumers, and compatibility constraints.
  - Guidance: inspect the original package and command surface, Pi PR workflows, local PR preview tools, skills/prompts, install/shim references, package metadata, and source references to the old standalone CLI, `/pr:*`, Address API imports, `@sdl/core/github-pr-feedback`, and `@sdl/core/github-pr-status`.
  - Evidence: `updates/2026-06-28-pr-address-surface-inventory.md` records the standalone CLI baseline, Pi command/workflow names, API exports, output schemas, external GitHub read/write boundaries, and call sites affected by a command-face or API cutover.

- [x] Rebaseline `@sdl/address/api` as the curated Capability API.
  - Guidance: start from concrete consumers rather than broad lower-package re-exporting. Preserve the ADR 0016 direction: PR-feedback seam in Address, neutral identity/status mechanics in `@sdl/core`, and no generic GitHub Capability package. Classify current DTO/gateway/status exports as stable Capability API, command-private, or lower-infra-only.
  - Evidence: `ts/packages/address/src/api.ts` documents the Capability API classification: PR-feedback gateway/DTO/failure/mutation types are stable Address API; check/status DTOs are stable only through the Address `getPrChecks` seam while generic status mechanics remain in `@sdl/core/github-pr-status`; real adapters, GraphQL mechanics, command schemas, Clinkr/exec wrappers, and Pi presentation helpers are not exported. `ts/packages/address/README.md` records the same consumer guidance, and `test/unit/api-boundary.test.ts` typechecks the package export as the consumer import path. Source search found no non-Address PR-feedback consumers importing lower `@sdl/core/github-pr-feedback`; direct `@sdl/core/github-pr-status` imports remain neutral `worktree-status`/core-test status consumers. `updates/2026-06-28-address-package-rename.md` records the package rename to `@sdl/address` / `ts/packages/address`, with no API alias for the old identity; `updates/2026-06-28-address-sdl-exec-cutover.md` later records standalone binary removal.

- [x] Extract or tighten gateway-injected Address Domain Core seams.
  - Guidance: move reusable behavior out of CLI operation glue or Pi shell-out adapters when it is deterministic Address domain behavior. Candidate seams include feedback snapshot/summary construction, branch-to-PR mapping, feedback collection, check/status normalization, review-thread reply/resolve operations, and reusable watch/fingerprint primitives proven by Pi.
  - Evidence: fake-backed Address tests cover the domain seams without real GitHub, `gh`, git subprocesses, or Pi runtime state; real adapters remain at command/Pi edges. `updates/2026-06-28-branch-pr-mapping-core-seam.md` records the branch-to-open-PR mapping seam. `updates/2026-06-28-pr-checks-core-seam.md` records the `pr-checks` slice: `ts/packages/address/src/core/pr-checks.ts` owns PR-target resolution and stable check payload normalization behind injected Git/PR-feedback gateways, with fake-backed unit coverage plus retained `sdl address exec pr-checks` scenario coverage. `updates/2026-06-28-download-feedback-core-seam.md` records the `download-feedback` slice: `ts/packages/address/src/core/download-feedback.ts` owns target resolution, feedback snapshot orchestration, filtering/counts, payload construction, and Markdown prompt assembly behind injected Git/PR-feedback gateways, with fake-backed core coverage plus retained `sdl address exec download-feedback` scenario coverage. `updates/2026-06-28-review-thread-mutation-core-seam.md` records the review-thread mutation slice: `ts/packages/address/src/core/review-thread-mutations.ts` owns reply/resolve gateway orchestration and stable mutation payload construction behind injected PR-feedback gateways, with fake-backed success/failure coverage plus retained primitive scenario compatibility. `updates/2026-06-28-domain-core-closeout-decision.md` records the closeout review: remaining read primitives are direct gateway read command leaves plus stable payload mappers, and Pi watch/fingerprint remains host-resident presentation/session residue until a concrete non-Pi or Address API consumer appears.

- [x] Decide the Address command-face disposition.
  - Guidance: evaluate whether portable operations should move to the SDL grouped command face `sdl address ...` using existing grouped-command mechanics, or whether the standalone legacy CLI remains a documented transitional surface for now. Do not remove or alias command surfaces before call-site inventory and parity evidence exist.
  - Evidence: `updates/2026-06-28-address-command-group-naming.md` records the grouped command name decision. `updates/2026-06-28-address-sdl-exec-cutover.md` records the implementation: `.sdl/extensions/address` mounts retained operations as `sdl address exec ...`, active Pi/local consumers are cut over, and the standalone legacy binary/install shim is removed. `updates/2026-06-28-sdl-command-adapter-consolidation.md` records the follow-on consolidation from per-operation extension stubs to a shared extension entry and package-owned `@sdl/capability-kit` SDL command adapter.

- [x] Align Pi PR feedback adapters over Address API/core or command leaves.
  - Guidance: preserve public Pi UX and command names while moving deterministic collection, normalization, branch/PR mapping, and review-thread mutation behavior to Address-owned seams where useful. Keep editor prefill, stack-prompt assembly, live watch UI/state, dirty-tree/idle gating, notifications, prompt injection, and session orchestration in Pi.
  - Evidence: Pi PR download/watch and local PR preview shell-outs now call `sdl address exec ...`; `@sdl/pi` and `@local-pi-tools/pr-previews` tests pass. `ts/packages/hosts/pi/CONTEXT.md` describes Pi as presentation/session residue around `sdl address exec ...` / `@sdl/address/api`.

- [x] Refresh Address, Pi, SDL, root context, and parent Objective tracking.
  - Guidance: document the final Capability API, Command Face, Domain Core, external GitHub safety boundary, and parked follow-ups. Update `sdl-extension-architecture` when this child is spawned, materially advanced, or completed.
  - Evidence: `updates/2026-06-28-final-refresh.md` records the final docs/context refresh, stale-term searches with historical exceptions, parent Objective tracking update, and markdown formatting validation.

## Parked

- Roaster capability migration and Roaster findings/comment ownership.
- Aretro capability migration and branch-retrospective evidence workflows.
- A generic GitHub Capability package; ADR 0016 keeps that out of scope.
- Dynamic arbitrary Pi mirroring for Address or other SDL extension commands.
- Real GitHub PR mutation as validation without explicit user confirmation.
- Broad redesign of PR review vocabulary across Roaster, GitHub reviews, review threads, checks, and Address summaries.
- Watch/fingerprint extraction from Pi into `@sdl/address/api` until a concrete non-Pi or command-face consumer appears.
