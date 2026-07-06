# Roadmap

## Work

- [x] Establish the package and command vocabulary for the `ns` CLI.
      Decided (see `updates/20260702T035321Z-harness-artifact-vocabulary-and-layering.md`): domain term **harness artifact** with kinds `skill`/`agent`/`extension-bundle`; user-facing command `ns skills`; verb **provision**; **harness** over "platform"; AREG re-read as Artifact Registry. Package name confirmed and landed as `@nseng-ai/harness-artifacts` at `ts/packages/capabilities/harness-artifacts`, seeded by pushing down areg's lockfile/mirror/frontmatter convention code (see `updates/20260706T100934Z-harness-artifacts-package-seeded-by-areg-pushdown.md`).

- [x] Subobjective `ns-skills-steelthread`: designed and validated the `ns skills` thread end-to-end. **Closed 2026-07-06 as completed** (see the child's `## Closure` and umbrella synthesis `updates/20260706T153500Z-steelthread-closed-synthesis.md`).
      The child delivered the full thread: the artifact model / harness path table / provision plan / install manifest, and `ns skills list/path/install [--dry-run] [--force]` provisioning the real `objective` skill for `pi`/`claude-code`/`codex` at both scopes with a per-file-SHA-256-hashed install manifest, zero `npx skills` dependency, consumed through the `@nseng-ai/ns-init` `RealSkillMaterializer` seam. Every Completion Criterion was independently re-verified against the real system and full `just` is green (main suite 4539, style-guard 120, tsgo, edge sweep `sweep-ok`). Cross-child lesson synthesized in the update above.

- [ ] Decide the disposition of each parked-breadth row after the steelthread validates.
      Per the Steelthread pattern: each row below either widens the validated thread as a follow-on slice or splits into its own Subobjective (edge-tracked). Record dispositions as Semantic Updates.

## Parked

Deferred breadth from the 2026-07-06 steelthread reshape — widening the validated thread, as follow-on rows here or split-out Subobjectives:

- [~] npm-module-bundled artifact provisioning (was "Extension-carried artifact provisioning"; merged with the AREG re-platform row).
  **Graduated 2026-07-06 into the Subobjective `npm-bundled-artifact-provisioning`** (edge-tracked). Product decision (see `updates/20260706T160000Z-npm-bundled-provisioning-and-areg-inspector-reframe.md`): first-party provisioning generalizes to any harness artifact statically declared and bundled inside a resolved **npm module** — first-party `@nseng-ai/*` packages, ns extensions (one case), or any opt-in npm package — via the `ns` `package.json` field, no code executed at discovery, triggered by module install/enable and the decided `ns update` reconcile hook (`updates/20260702T041140Z-reconcile-primitive-and-sdl-update-hook.md`). The former AREG "re-platform (wrap npx)" row is **reframed and merged in**: AREG stops wrapping `npx skills` (features removed, accepted) and is kept as a standalone whole-project inspector across all artifact sources. Where the `ns update` surface lives (kernel/extension-lifecycle vs. here) resolves with this row. Keep this `[~]` current and synthesize the child's closure here.

- [ ] Reconcile with existing skill workflows, docs, and vocabulary.
      Compare the new subsystem against `skillx`, the `@nseng-ai/areg` CLI, `npx skills`, repo skill conventions, and harness skill-invocation docs so the new CLI behavior is additive. Includes the bare-"artifact" collision cleanup: handoff artifact and consumer artifact stay owned by their domains; AREG's "managed artifacts" overlay sense is renamed (e.g. "kind overlays").

- [ ] Marketplace or remote catalog discovery.
- [ ] Remote acquisition sources for artifact-bearing modules (npm registry, git, local-path specs).
      Today modules arrive only by directory presence (committed `.ns/extensions/`, XDG root); vendoring gives pinning for free via git. If a fetch path is ever built (anticipated `ns.toml` `artifact-packages` list, child decision `20260706T194500Z` §6), start from pi's debugged design — uniform `npm:pkg@ver` / `git:host/user/repo@ref` / local-path spec grammar and its pinning semantics (pinned npm skipped by updates; git refs reconciled, not advanced). See `npm-bundled-artifact-provisioning/updates/20260706T215708Z-pi-update-mechanism-comparison.md`.
- [ ] Update/uninstall/version-resolution command surface, stale-after-upgrade detection, and rename cleanup (the thread's install manifest enables these later; the commands themselves are not thread work).
      Pi reference for uninstall (`pi remove` deletes install + settings entry) and for keeping self-update a separate surface from artifact update, per the comparison update above.
- [ ] Drift detection / staleness nudge.
      `ns update` reconciles only when invoked; pulled module updates run stale until then (known accepted gap, child decision `20260706T194500Z` §7 load-time fingerprint backstop). Pi self-heals at startup (auto-install missing, reinstall on version mismatch) and exposes a non-blocking update check. ns shape: read-only desired-vs-manifest diff (the reconcile pure planner computes it) surfaced as a nudge. Candidate follow-on slice once `ns update` lands.
- [ ] Project trust gating for provisioned artifacts.
      A cloned repo's `.ns/extensions` module provisions skill files (prompt-injection payloads by design) into harness dirs on `ns update` with no consent gate. Accepted while ns is private/unreleased with trusted-repo assumptions — recorded as a deliberate divergence in the child's slice plan, not an oversight. Pi's project-trust model (trust store + `--approve`, refuse project-scoped install/load until trusted) is the design to adopt if the audience widens.
- [ ] Per-resource filtering / enable-disable on top of reconcile.
      Child decision `20260706T194500Z` §3 frames selective install as a future desired-state filter; pi's per-package filter objects (globs, `!` exclusions, `+`/`-` exact overrides, `autoload:false` deltas) are the template.
- [ ] Provisioning the `agent` and `extension-bundle` kinds (modeled in types from day one; skills ship first).
- [retired] Replacing AREG's `npx skills add` acquisition channel for third-party GitHub skills with a first-party fetch-and-vendor path.
  **Retired 2026-07-06** (product decision, see `updates/20260706T160000Z-...`): first-party support provisions only npm-module-bundled artifacts; we do not wrap or replace `npx skills` and do not build first-party GitHub acquisition. Third-party skills are inspected by AREG wherever they land, not acquired by us.
