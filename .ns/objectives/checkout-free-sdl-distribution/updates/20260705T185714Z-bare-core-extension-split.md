# Bare-core / objectives-extension split

Status note (2026-07-06): this is a superseded planning update. The authoritative
closed Objective state records registry-verified `@nseng-ai/ns@0.1.1` with Objective
commands loading through the preinstalled command catalog, plus all 19 intended public
packages verified. Do not read the bare-core split below as current/published state.

## Summary

Planning session with the owner (2026-07-05) charting the documentation happy-path launch
(`npm install -g @nseng-ai/ns` → `ns install @nseng-ai/objectives` → `ns init` → first
objective) briefly targeted a published `@nseng-ai/ns` core that would ship **bare** —
no capabilities preinstalled. In that superseded plan, `@nseng-ai/objectives` would
publish standalone (extending the same-day standalone-package-publishing decision) and
reach users through a Pi-style `ns install <source>` surface, mimicking
`pi install`/`pi remove`/`pi update`.

At the time, this would have superseded the recorded shape in which the published core
package *includes* objectives via preinstalled in-process loader thunks. The Pi-style
bundle strategy (real npm CLI package, prebuilt `dist` JS, standalone runtime packages
where feasible) stood unchanged in that plan; what changed was objectives moving from
bundled-preinstall to installed-extension delivery.

## Recorded Impact At The Time

- Thesis and Completion Criteria would have made the checkout-free bar bare kernel from
  a global install, plus `ns objective …` working once `@nseng-ai/objectives` was
  installed; the "published package includes objectives" criterion would have been
  superseded.
- Module-loader roadmap row (`[~]`) would have redirected remaining work to runtime
  resolution of installed extension packages, not bundled preinstall thunks. Rework risk
  was recorded.
- Publish row would have split in two: artifact split (bare core + standalone objectives
  closure), then the two-package first publish verified via `ns install`.
- Ownership boundary recorded: `ns install` acquisition UX is designed under
  `ship-objectives-to-customers`; loader-side resolution of installed packages stays
  here.

## Historical Follow-Ups

- Triage the `@nseng-ai/objectives` dependency closure for standalone publish
  (capability-kit / foundation / extension-kit).
- Decide what rides in the bare core (kernel runtime deps; whether `ns init` is core).
- Reconcile the checkout-free smoke and pack pipeline with two artifacts.
