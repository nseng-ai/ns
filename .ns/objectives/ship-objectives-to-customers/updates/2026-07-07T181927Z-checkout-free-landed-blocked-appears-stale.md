# Checkout-free dependency landed and published; Blocked Sentence appears stale

Provenance: objective-refresh basis target=9fa6a502d from=trunk-HEAD

## Summary

An objective-refresh pass against trunk HEAD ground truth found that the hard
dependency the Blocked Sentence gates on has landed:

- `checkout-free-sdl-distribution` is **closed** (`closed.md`, 2026-07-06). Its final
  update records the full public `@nseng-ai/*` set (19 packages) published and
  registry-verified at `0.1.1`, `@nseng-ai/ns@0.1.1` carrying `bin.ns` plus the expected
  kernel subpath exports, and a registry-backed checkout-free smoke —
  `npx -y @nseng-ai/ns@0.1.1 objective list --format md` run from a throwaway foreign git
  repo with no ns checkout — executing successfully.
- `@nseng-ai/objectives@0.1.1` is in that verified published set, so the customer-facing
  install vector for objectives exists on npm today.

Two other consumed dependencies also progressed:

- `ns-skills-steelthread` is **closed**: the first-party `ns skills` surface
  (`list`/`path`/`install`, in `@nseng-ai/harness-artifacts`) now exists and lists the
  first-party `objective` skill. This corrects the roadmap's stale "No `ns skills` command
  exists yet" note.
- `ns init`'s production context now wires `RealSkillMaterializer` (not a stub), which
  provisions the objective skill via `provisionFirstPartySkill` from
  `@nseng-ai/harness-artifacts`. The prior "faked SkillMaterializer until the bundle
  lands" framing is superseded.
- `ns update` has landed (manifest-tracked harness-artifact updates). The Pi-style
  `ns install <source>` / `ns remove` acquisition surface is still not built, so that
  design row stays open.

## Objective Impact

- **The Blocked Sentence appears stale.** It gates first external publish on
  `checkout-free-sdl-distribution` landing so a customer can install `ns` from npm and run
  it checkout-free — a condition now met by the closed, published, npx-verified
  dependency. Per refresh rules the frontmatter `blocked:`/`edges:` were left **verbatim**;
  the flip is left to the owner. Clearing it safely may also touch the counterpart record,
  which is out of this single-slug refresh's scope.
- Corrected verified-stale prose in `objective.md` (Thesis, sequencing list, Risks,
  Assumptions, the resolved "where objective skills ship" Open Question) and in
  `roadmap.md`: the checkout-free dependency row flips to `[x]`; the `ns skills` bundling
  row and the real-`SkillMaterializer` wiring row flip to `[~]`; the scaffold-row note
  drops the "pending-bundle skill stub" wording; the `ns install`/`update` design row and
  docs row are annotated with the landed publish.
- Edge note: frontmatter edges #1 (`checkout-free-sdl-distribution`) and #2
  (`ns-skills-steelthread`) now point to **closed** objectives (dependencies satisfied);
  edges #3 (`cross-harness-parity`) and #4 (`eve-parity-docs-site`) remain open. The body
  prose historically referenced `skill-management-subsystem` (open umbrella) for skill
  delivery while the edge is `ns-skills-steelthread` (closed steelthread) — both exist;
  this is granularity drift, not a broken edge.

## Follow-Ups

- Owner decision: clear the `blocked` frontmatter (and reconcile any counterpart record) if
  the checkout-free gate is agreed resolved.
- Verify onboarding end-to-end on Claude Code from the published `@nseng-ai/ns@0.1.1`
  (install → `ns init` → skill provisioning → create/next/update/close) in a throwaway
  non-ns repo — the still-open first-slice bar.
- Remove the "coming with the first release" npm gate copy in the docs-site pages
  (owned/coordinated with `eve-parity-docs-site`) now that `0.1.1` is published.
