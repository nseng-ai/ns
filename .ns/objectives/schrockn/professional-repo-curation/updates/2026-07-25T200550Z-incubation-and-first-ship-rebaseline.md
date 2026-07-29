# Incubation and First-Ship Rebaseline

## Summary

Two roadmap facts had landed without being synthesized into this umbrella. First, commit `4afa42169` and ADR 0044 renamed the kit and extension tiers and moved all 11 ns extensions directly into `ts/packages/incubator/`. This is a completed first half of the reorganization, not a future 14-capability demotion commit. Hosts and rough tool/internal packages remain outside the zone, `ts/packages/incubator/README.md` is absent, and the stronger no-clean→incubator dependency invariant is not implemented; ADR 0044 only exempts incubator paths from tier-directory projection.

Second, the closed `objectives-bare-core-release` record verifies coordinated npm `0.1.3`: a foreign repository installed bare `@nseng-ai/ns`, acquired `@nseng-ai/objectives`, provisioned all ten Objective skills, and ran `ns objective list` without this checkout. The first ship is therefore landed evidence, although Objectives still depends on incubating Branch Context and Flow and that product-boundary verdict remains open.

Presentation is not landed: root `README.md` is one line, `why-ns.md` is absent, and PR Feedback's README still describes source-checkout, unpublished use. The repository remote remains `github.com/nseng-ai/ns`, so no transfer completion is claimed.

Provenance: objective-refresh basis target=5d52b257cc380143528f8353e3712e3cf63152fe from=trunk-HEAD

## Objective Impact

The umbrella now tracks partial completion of the two-zone reorganization, treats checkout-free Objectives as completed evidence requiring product-boundary reconciliation rather than fresh implementation, and narrows remaining work to package placement/invariant, foundation contracts, semantic rename closure, presentation/PR Feedback, hardening, and transfer.

## Follow-Ups

- Finish the rename child and begin the Clinkr README-driven child.
- Decide placement for hosts and rough tool/internal packages, add the incubator contract, and enforce no clean→incubator dependencies.
- Decide whether Objectives' Branch Context/Flow dependencies satisfy the intended single-player boundary.
- Verify a checkout-free PR Feedback path before drafting the root quickstart.
