# Objective child completion rebaseline

## Summary

The parent architecture Objective was stale relative to the completed current `objective-capability-extension` child roadmap rows. The child now records Objective capability migration, Pi/CCC cycle-break, acyclicity guard, context documentation, and SDL command-system integration evidence.

Current checkout evidence gathered while rerunning `objective-next` for this parent Objective:

- Recent default-branch commit evidence includes commit `f0b43a2aa` ("Retire the top-level Objective binary in favor of `sdl objective`").
- `rg "@sdl/ccc" ts/packages/hosts/pi/src ts/packages/hosts/pi/package.json` produced no matches.
- `rg "@sdl/pi/objectives" ts/packages` produced no matches.
- `rg "@sdl/pi" ts/packages/objective/src ts/packages/objective/package.json` produced no matches.
- The child roadmap records `@sdl/objective/api`, consumer repoints for `ccc`/`sdlcc`, the Pi→CCC cycle break, `just ts-guard` topological acyclicity enforcement, final context documentation, and `sdl objective ...` integration with the old top-level `objective` binary retired.
- `@sdl/domain-primitives-transitional` still has live consumers, so the parent architecture endgame remains open.

## Objective Impact

The parent record is rebaselined without closing anything:

- Phase 2 step 4 now records Objective child completion evidence while noting the child remains technically open until its own closure record is written.
- Phase 2 step 5 moves to `[~]`: the delegated Objective-domain cycle-break and acyclicity guard are complete, but parent step 5 still owns broader `ccc` clean-consumer conversion across other capabilities after their step-4 migrations land.
- The former Pi↔CCC bidirectional-cycle risk is rewritten as de-risked for the Objective capability path; remaining graph debt is the explicitly deferred autobranch/branch-context/pi/sdl manifest cycle plus future clean-consumer work.
- The resolved open question about Pi/CCC delegation direction is removed from the parent's open-question list; the chosen direction is `@sdl/ccc` may use neutral Pi helpers while `@sdl/pi` no longer depends on `@sdl/ccc`.
- The orientation is refreshed to emphasize current mid-migration reality: transitional-package consumers, remaining capability migrations, and deferred manifest-cycle debt.

## Follow-Ups

- Close or otherwise update `objective-capability-extension` if its Closure Gate is clear; then record that closure in the parent if needed.
- Continue parent Phase 2 step 4 by choosing the next capability child migration among the remaining capabilities, ordered by `ccc` consumption and transitional-package retirement pressure.
- Do not attempt parent step 6 until remaining capability migrations and broader `ccc` clean-consumer work are complete and `@sdl/domain-primitives-transitional` has no live consumers.
