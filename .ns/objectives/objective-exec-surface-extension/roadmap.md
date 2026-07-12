# Roadmap

## Work

- [ ] Implement `ns objective exec refresh-targets` (`{slugs, trunk, baseline,
      dirtySlugs}`) with tests; retrofit `objective-refresh`'s Select-targets section.
- [ ] Decide widen-vs-sibling for tracking-gate-style evidence, then serve
      `objective-update` and `objective-refresh` from the CLI; remove their hand-rolled
      trunk/base/diff pipelines.
- [ ] Add the objective-retro reconstruction exec operation with tests; amend the retro
      skill's Boundaries and retrofit its evidence phase.
      Evidence: `just` green, `areg check` OK, retrofitted skills verified via
      `areg skill show <name>`; objective-next's tracking-gate consumption unchanged.

## Parked

- (none)
