# Roadmap

## Work

- [x] Inventory PR Address surfaces, consumers, and compatibility constraints.
  - Guidance: inspect `ts/packages/pr-address/**`, `ts/packages/hosts/pi/src/pr/**`, `ts/packages/local-pi-tools/pr-previews/**`, `.pi` adapters if relevant, PR Address skills/prompts, install/shim references, package metadata, and source references to `pr-address`, `/pr:*`, `@sdl/pr-address`, `@sdl/core/github-pr-feedback`, and `@sdl/core/github-pr-status`.
  - Evidence: `updates/2026-06-28-pr-address-surface-inventory.md` records the current standalone CLI operations, Pi command/workflow names, API exports, output schemas, external GitHub read/write boundaries, and call sites affected by a command-face or API cutover.

- [x] Rebaseline `@sdl/pr-address/api` as the curated Capability API.
  - Guidance: start from concrete consumers rather than broad lower-package re-exporting. Preserve the ADR 0016 direction: PR-feedback seam in PR Address, neutral identity/status mechanics in `@sdl/core`, and no generic GitHub Capability package. Classify current DTO/gateway/status exports as stable Capability API, command-private, or lower-infra-only.
  - Evidence: `ts/packages/address/src/api.ts` now documents the Capability API classification: PR-feedback gateway/DTO/failure/mutation types are stable Address API; check/status DTOs are stable only through the Address `getPrChecks` seam while generic status mechanics remain in `@sdl/core/github-pr-status`; real adapters, GraphQL mechanics, command schemas, Clinkr/exec wrappers, and Pi presentation helpers are not exported. `ts/packages/address/README.md` records the same consumer guidance, and `test/unit/api-boundary.test.ts` typechecks the package export as the consumer import path. Source search found no non-PR Address PR-feedback consumers importing lower `@sdl/core/github-pr-feedback`; direct `@sdl/core/github-pr-status` imports remain neutral `worktree-status`/core-test status consumers. `updates/2026-06-28-address-package-rename.md` records the package rename from `@sdl/pr-address` / `ts/packages/pr-address` to `@sdl/address` / `ts/packages/address`, with no API alias and the transitional `pr-address` binary retained.

- [ ] Extract or tighten gateway-injected PR Address Domain Core seams.
  - Guidance: move reusable behavior out of CLI operation glue or Pi shell-out adapters when it is deterministic PR Address domain behavior. Candidate seams include feedback snapshot/summary construction, branch-to-PR mapping, feedback collection, check/status normalization, review-thread reply/resolve operations, and reusable watch/fingerprint primitives proven by Pi.
  - Evidence: fake-backed PR Address tests cover the domain seams without real GitHub, `gh`, git subprocesses, or Pi runtime state; real adapters remain at command/Pi edges. `updates/2026-06-28-pr-checks-core-seam.md` records the `pr-checks` slice: `ts/packages/address/src/core/pr-checks.ts` now owns PR-target resolution and stable check payload normalization behind injected Git/PR-feedback gateways, with fake-backed unit coverage plus retained `sdl address exec pr-checks` scenario coverage.

- [x] Decide the PR Address command-face disposition.
  - Guidance: evaluate whether portable operations should move to the SDL grouped command face `sdl address ...` using existing grouped-command mechanics, or whether the standalone `pr-address` CLI remains a documented transitional surface for now. Do not remove or alias command surfaces before call-site inventory and parity evidence exist.
  - Evidence: `updates/2026-06-28-address-command-group-naming.md` records the grouped command name decision. `updates/2026-06-28-address-sdl-exec-cutover.md` records the implementation: `.sdl/extensions/address` mounts retained operations as `sdl address exec ...`, active Pi/local consumers are cut over, and the standalone `pr-address` binary/install shim is removed. `updates/2026-06-28-sdl-command-adapter-consolidation.md` records the follow-on consolidation from per-operation extension stubs to a shared extension entry and package-owned `@sdl/capability-kit` SDL command adapter.

- [x] Align Pi PR feedback adapters over PR Address API/core or command leaves.
  - Guidance: preserve public Pi UX and command names while moving deterministic collection, normalization, branch/PR mapping, and review-thread mutation behavior to PR Address-owned seams where useful. Keep editor prefill, stack-prompt assembly, live watch UI/state, dirty-tree/idle gating, notifications, prompt injection, and session orchestration in Pi.
  - Evidence: Pi PR download/watch and local PR preview shell-outs now call `sdl address exec ...`; `@sdl/pi` and `@local-pi-tools/pr-previews` tests pass. `ts/packages/hosts/pi/CONTEXT.md` describes Pi as presentation/session residue around `sdl address exec ...` / `@sdl/address/api`.

- [ ] Refresh PR Address, Pi, SDL, root context, and parent Objective tracking.
  - Guidance: document the final or interim Capability API, Command Face, Domain Core, external GitHub safety boundary, and parked follow-ups. Update `sdl-extension-architecture` when this child is spawned, materially advanced, or completed.
  - Evidence: context/docs diffs, parent Objective update when appropriate, stale-term searches for old domain-owner wording, and targeted package checks/tests for touched packages.

## Parked

- Roaster capability migration and Roaster findings/comment ownership.
- Aretro capability migration and branch-retrospective evidence workflows.
- A generic GitHub Capability package; ADR 0016 keeps that out of scope.
- Dynamic arbitrary Pi mirroring for PR Address or other SDL extension commands.
- Real GitHub PR mutation as validation without explicit user confirmation.
- Broad redesign of PR review vocabulary across Roaster, GitHub reviews, review threads, checks, and PR Address summaries.
