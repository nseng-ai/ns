# Platform and Consumer: SDL Is Self-Hosting

Routed from the root `AGENTS.md` ("Architecture rules" section). Read before deciding whether new code is a platform capability or a consumer instance.

SDL is **self-hosting**: the same `sdl-tools` repo that **develops** the platform is also its **first consumer**. The roaster engine, objectives, handoffs, branch-context, and review loaders are capabilities built here — and the concrete `.ji/reviews/*` and `.ji/objectives/*` instances that exercise those capabilities are authored and run here too. Dogfooding is not incidental; it is the default state of the repo. Because both live side by side, developer-hat and consumer-hat get conflated constantly. This doc exists to make the distinction explicit.

## The two hats

Ask which of these you are doing:

- **Platform (developer hat):** changing a *capability* — the engine, loader, CLI, or storage contract that many instances depend on. Lives in `ts/packages/*` (for example `ts/packages/capabilities/roaster`, `ts/packages/capabilities/objective`), is tested, and ships to every consumer of that capability.
- **Consumer (consumer hat):** changing an *instance* — one concrete artifact that a capability loads and runs. Lives in `.ji/*` (for example a single `.ji/reviews/<slug>/review.md` review or a `.ji/objectives/<slug>/` objective). It is configuration and content, not capability.

Rule of thumb: if your change alters what the tool *can do*, it is platform; if it alters one thing the tool *is currently doing to this repo*, it is consumer.

## The decision rule

When a new artifact could plausibly be either, prototyping consumer-side in place is fine — colocate it with the instance it serves and iterate quickly. Reach for platform code (a tested package) when the behavior is deterministic, reused across instances, or needs to be reliable enough that other consumers should depend on it.

The one requirement: **a provisional consumer artifact must carry an explicit promotion path.** State, in the artifact or its objective, the intent to promote it to platform code and roughly when. Provisional must not silently become permanent by default.

Live example: for a review-specific detector tool, the fork was (1) build it as a tested platform package now, or (2) colocate review-specific TypeScript with the review and refactor it into a package later. Option 2 was chosen — a deliberate consumer-side-first bet *with* a stated promotion path. That is the pattern this rule generalizes: prototype in the consumer, name the path back to the platform.

## Why it matters

Conflating the two hats produces two failure modes: over-engineering a one-off instance into premature platform machinery, or letting a quick consumer hack ossify into de-facto platform code that nobody tested or promoted. Naming which hat you are wearing — and, for consumer artifacts, the promotion path — keeps both from happening.
