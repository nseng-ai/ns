# Platform and Consumer: ns Is Self-Hosting

Routed from the root `AGENTS.md` ("Architecture rules" section). Read before deciding whether new code is a platform capability or a consumer instance.

ns is **self-hosting**: the same `ns` repo that **develops** the platform is also its **first consumer**. The reviews engine, objectives, handoffs, branch-context, and review loaders are capabilities built here — and the concrete `.ns/reviews/*` and `.ns/objectives/*` instances that exercise those capabilities are authored and run here too. Dogfooding is not incidental; it is the default state of the repo. Because both live side by side, developer-hat and consumer-hat get conflated constantly. This doc exists to make the distinction explicit.

## The two hats

Ask which of these you are doing:

- **Platform (developer hat):** changing a *capability* — the engine, loader, CLI, or storage contract that many instances depend on. Lives in `ts/packages/*` (for example `ts/packages/capabilities/reviews`, `ts/packages/capabilities/objectives`), is tested, and ships to every consumer of that capability.
- **Consumer (consumer hat):** changing an *instance* — one concrete artifact that a capability loads and runs. Lives in `.ns/*` (for example a single `.ns/reviews/<slug>/review.md` review or a `.ns/objectives/<slug>/` objective). It is configuration and content, not capability.

Rule of thumb: if your change alters what the tool *can do*, it is platform; if it alters one thing the tool *is currently doing to this repo*, it is consumer.

## The decision rule

When a new artifact could plausibly be either, prototyping consumer-side in place is fine — colocate it with the instance it serves and iterate quickly. Reach for a tested package when the behavior is deterministic, reused across instances, or needs to be reliable enough that other consumers should depend on it — but a tested package is not automatically *platform*. Consumer-side tooling can be package-grade without being platform surface (see the middle rung below).

The one requirement: **a provisional consumer artifact must carry an explicit promotion path.** State, in the artifact or its objective, the intent to promote it — to a tested `packages/internal/*` package, and onward to platform if it earns that status — and roughly when. Provisional must not silently become permanent by default.

Live example: for a review-specific detector tool, the fork was (1) build it as a tested platform package now, or (2) colocate review-specific TypeScript with the review and refactor it into a package later. Option 2 was chosen — a deliberate consumer-side-first bet *with* a stated promotion path. That is the pattern this rule generalizes: prototype in the consumer, name the path back to a package.

## The middle rung: tested consumer tooling (`packages/internal/*`)

Not every tested package is platform. Between the two hats sits a third rung: **consumer-side tested tooling** — tested workspace packages under the reserved `@internal/*` scope that live in `ts/packages/internal/*`. They wear the consumer hat (they exist only to operate this repo) but are package-grade code rather than `.ns/*` content, and they are *not* platform surface. The charter for the space lives in [`ts/packages/README.md`](../../ts/packages/README.md).

The rung defines two promotion paths:

- **In (from `.ns/*`):** a consumer-side `.ns/*` prototype that has outgrown in-place prototyping graduates into `packages/internal/*`, becoming a tested workspace citizen. This is the concrete first stop of the **explicit promotion path** the decision rule requires — the path back to a package does not have to jump straight to platform.
- **Out (to platform):** an internal package that earns platform status — deterministic, reused, reliable enough that other consumers should depend on it — graduates to a platform package (`ts/packages/*` outside `internal/`) and leaves the space.

The boundary that keeps the rung honest: internal packages have **no outside runtime dependents**, enforced by the style-guard rule `NS_TS_INTERNAL_SPACE_ADMISSION`, and are **never published**. Consumption from outside the space is limited to `devDependencies` and test-only use. When code inside `internal/` genuinely needs runtime dependents outside the space, that is the signal it has earned the platform rung — promote it out rather than piercing the boundary.

## Why it matters

Conflating the two hats produces two failure modes: over-engineering a one-off instance into premature platform machinery, or letting a quick consumer hack ossify into de-facto platform code that nobody tested or promoted. The middle rung is the pressure valve for the second: consumer tooling can become tested and package-grade without being mislabeled platform. Naming which hat you are wearing — and, for consumer artifacts, the promotion path through `packages/internal/*` — keeps both failure modes from happening.
