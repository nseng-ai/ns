# Roadmap

## Work

- [ ] Inventory PR Address surfaces, consumers, and compatibility constraints.
  - Guidance: inspect `ts/packages/pr-address/**`, `ts/packages/hosts/pi/src/pr/**`, `ts/packages/local-pi-tools/pr-previews/**`, `.pi` adapters if relevant, PR Address skills/prompts, install/shim references, package metadata, and source references to `pr-address`, `/pr:*`, `@sdl/pr-address`, `@sdl/core/github-pr-feedback`, and `@sdl/core/github-pr-status`.
  - Evidence: a durable Objective update or roadmap note names the current standalone CLI operations, Pi command/workflow names, API exports, output schemas, external GitHub read/write boundaries, and all call sites affected by a command-face or API cutover.

- [ ] Rebaseline `@sdl/pr-address/api` as the curated Capability API.
  - Guidance: start from concrete consumers rather than broad lower-package re-exporting. Preserve the ADR 0016 direction: PR-feedback seam in PR Address, neutral identity/status mechanics in `@sdl/core`, and no generic GitHub Capability package. Classify current DTO/gateway/status exports as stable Capability API, command-private, or lower-infra-only.
  - Evidence: API source, package exports, tests, and docs/context make clear what consumers may import and why; any consumer that needs PR-feedback semantics imports `@sdl/pr-address/api` rather than private paths or lower PR-feedback modules.

- [ ] Extract or tighten gateway-injected PR Address Domain Core seams.
  - Guidance: move reusable behavior out of CLI operation glue or Pi shell-out adapters when it is deterministic PR Address domain behavior. Candidate seams include feedback snapshot/summary construction, branch-to-PR mapping, feedback collection, check/status normalization, review-thread reply/resolve operations, and reusable watch/fingerprint primitives proven by Pi.
  - Evidence: fake-backed PR Address tests cover the domain seams without real GitHub, `gh`, git subprocesses, or Pi runtime state; real adapters remain at command/Pi edges.

- [ ] Decide the PR Address command-face disposition.
  - Guidance: evaluate whether portable operations should move to an SDL grouped command face such as `sdl pr-address ...` using existing grouped-command mechanics, or whether the standalone `pr-address` CLI remains a documented transitional surface for now. Do not remove or alias command surfaces before call-site inventory and parity evidence exist.
  - Evidence: an explicit decision record and implementation/docs either establish SDL command leaves with targeted tests or document why the standalone CLI remains and what would trigger a later cutover.

- [ ] Align Pi PR feedback adapters over PR Address API/core or command leaves.
  - Guidance: preserve public Pi UX and command names while moving deterministic collection, normalization, branch/PR mapping, and review-thread mutation behavior to PR Address-owned seams where useful. Keep editor prefill, stack-prompt assembly, live watch UI/state, dirty-tree/idle gating, notifications, prompt injection, and session orchestration in Pi.
  - Evidence: Pi tests where touched, source searches showing reduced shell-out/domain duplication where migrated, and docs/context wording that describes Pi as presentation/session residue around PR Address rather than the domain owner.

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
