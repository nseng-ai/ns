# Consolidation goal added; full decision inventory drafted

Two user decisions in one session:

1. **Consolidation goal (user-confirmed):** the end state must have fewer
   top-level packages (top-level = container + standalone) than the 44 in the
   workspace at inventory time. This adds a third inventory decision, **fold**
   (package code moves into a container as a subpackage; the published package
   is deleted), and amends the Non-Goals: a net-negative consolidation
   container (absorbs ≥2 packages) may be created with a user-approved name.
   The ≥4 containerize threshold applies to self-containerization only, not to
   folds. Approved folds are direct execution; unapproved folds remain
   steer-first.

2. **Draft inventory built** (`references/inventory.md`, all 44 packages),
   pulled forward at user request ahead of the vocabulary/guard slices.
   Proposed census: **44 → 21 top-level** (11 containers + 10 standalone),
   ~55–60 subpackages, via four new consolidation containers (gateway
   backends, capability-pi, local Pi tools, standalone tools — names TBD) and
   two absorb-folds (`sdl-land` → flow, `@sdl/plans` → branch-context), with
   six neutral-infra satellites folding into `@sdl/core`.

Constraints used to shape the folds (recorded for future runs):

- Folds are tier-homogeneous — subpackages inherit the container's tier and
  per-subpackage tiers stay parked.
- No package-level dependency cycles: notably `@sdl/brmem` cannot fold into
  `@sdl/core` because `brmem → capability-kit → core`; brmem stays standalone.
- ADR 0012 layering keeps `sdl-sdk` / `@sdl/kernel` / `@sdl/capability-kit`
  standalone (three distinct layers); a later merge is an Open Question.
- capability-pi packages cannot fold into their capabilities (would point
  capability tier at the host) nor into `@sdl/pi` (recreates the deliberately
  broken pi ↔ ccc cycle via ccc-pi); a peer consolidation container is the
  only cycle-free home.

The shape check now allows the package count to drop by exactly the approved
fold per slice, with the folded package reappearing as a subpackage circle of
its target.

Awaiting: user approval pass over the inventory (container names, borderline
`aretro`/`roaster` containerize calls, standalone set confirmation).
