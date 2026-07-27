# Roadmap

## Work

- [x] Record the progressive-disclosure architecture and ownership contracts. ADR 0049 defines the seven portable skills, harness-independent `@nseng-ai/objectives` enhancement, required-`ns` `@nseng-ai/pi-ns-objectives` integration, invariant records, operation-specific capability adaptation, and provenance-bound artifact ownership; canonical Objective, skill, package, Pi, context, and install/removal docs are reconciled to that contract.
      Evidence: `docs/adr/0049-progressively-disclosed-objective-product.md` and `updates/2026-07-27T043706Z-architecture-contract-recorded.md`; the accepted documents agree on dependency direction, canonical-source ownership, capability adaptation, the `pi-ns-<domain>` host boundary, and the deferred public-support verdict.
- [~] Establish the seven canonical portable skills. The family contract, minimal portable `objective-list`, operation-specific capability adaptation in the umbrella, and clean `objective-critique` cutover are implemented. Rewrite create, next, update, refresh, and close so each has complete CLI-free behavior and uses optional `ns` capabilities only after look-before-use detection. Preserve portable best-effort blocked/edge authoring, record-only next recommendations, all prose patterns, and `ns`-only automatic orientation loading.
  Evidence: `objective-list` installs through `npx skills`, passes command-backed exposure and exact-family content checks, and its Node-only fixture lists direct open records as `open` or `blocked` with an empty `PATH`; focused Objective extension and Pi replacement tests pass. The remaining five workflow rewrites and seven-skill checkout-independent acquisition proof remain open.
- [ ] Adapt `@nseng-ai/objectives` as the deterministic and automation enhancement. Preserve list/show/check, Tracking Gate and Git facts, orientation loading, machine interfaces, ADR 0024 runner verification, and ADR 0037 publication safety; provision runner/autorun as enhanced incubating skills while sharing canonical portable content and respecting pre-existing `npx skills` ownership.
      Evidence: enhanced ordinary workflows use the same records with stronger deterministic guarantees, runner/autorun remain unavailable as portable promises, and install/update/remove tests prove collision-free artifact ownership.
- [ ] Extract all Objective-specific Pi integration into `@nseng-ai/pi-ns-objectives` under the Pi host's extension ownership. Move slash commands, picker/completion, skill expansion, runner orchestration, and their tests; require `@nseng-ai/objectives`; consume only its curated package API and neutral Pi-runtime interfaces; remove the old Objective-owned Pi surface with no alias.
      Evidence: package topology and dependency guards pass, private deep imports are absent, and Pi parity/interaction tests pass from the new owner.
- [ ] Prove the progressively enhanced product in three checkout-independent scenarios: seven skills installed through `npx skills` without `ns`; `@nseng-ai/objectives` installed over the same records with deterministic mechanics and runner/autorun; and `@nseng-ai/pi-ns-objectives` installed on top with Pi interaction and orchestration. Exercise removal in reverse and confirm `npx skills`-owned portable skills and Objective records survive unchanged.
      Evidence: reproducible smoke transcripts or automated scenarios cover acquisition, representative lifecycle operations, enhancement, Pi use, and ownership-preserving removal; relevant repository validation passes.

## Parked

- Promote the seven portable Objective skills to `skills/public/objectives/` after a separate support-warrant review of the evidence gathered here.
- CI policy or repository-hosted Objective checks.
- Pi operation directly over skill-only Objectives without `@nseng-ai/objectives`.
- Rich portable list metadata such as titles, summaries, update recency, dirty state, branch attribution, or Git-aware freshness.
