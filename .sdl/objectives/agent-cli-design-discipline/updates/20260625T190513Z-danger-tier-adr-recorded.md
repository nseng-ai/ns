# Semantic Update: Confirmation/Danger-Tier ADR Recorded

## Summary

ADR 0014 (`docs/adr/0014-clinkr-confirmation-danger-tiers.md`) is recorded on
branch `add-clinkr-confirmation-danger-tiers`, completing the last contested
decision in the ADR queue. It defines four authoring danger tiers (0 read-only,
1 scoped/reversible, 2 destructive/external, 3 high blast radius), TTY-gated
interactive prompting, non-interactive fail-fast behavior, dry-run as a
successful `ok(...)` inspection, and the `--yes`/`-y` (Tier 2 confirm) vs
`--force`/`-f` (Tier 3 precondition override) verb split. Tiers stay
`sdl-cli-design` authoring discipline rather than a new Clinkr framework type,
and `ClinkrInteraction.confirm` remains the only confirmation primitive for this
slice. This ADR was authored under the focused
`clinkr-confirmation-danger-tiers` subobjective.

## Objective Impact

- Roadmap row "Record ADRs in `docs/adr/` for each contested decision" moved from
  `[~]` to `[x]`: all contested decisions from the survey/gap audit now have ADRs
  (0010–0014); no contested-ADR candidates remain.
- Open Questions in `objective.md` gained an entry recording the ADR 0014
  outcome alongside ADRs 0010–0013.
- The remaining parent semantic work is now: (1) author and register the
  `sdl-cli-design` skill (resolve public-vs-internal first), encoding the ADR
  outcomes including the four-tier model and `--yes`/`-y` vs `--force`/`-f`
  split; and (2) land the remaining ADR-accepted Clinkr changes, with
  danger-tier framework conformance routed through the
  `clinkr-confirmation-danger-tiers` subobjective.

## Follow-Ups

- Let the `clinkr-confirmation-danger-tiers` subobjective finish its Clinkr audit,
  minimal conformance, and handback so the parent's "Land high-agreement Clinkr
  changes" row can absorb any danger-tier deltas with evidence.
- When authoring `sdl-cli-design`, encode the four-tier model and the
  `--yes`/`-y` vs `--force`/`-f` distinction, flagging danger-tier conformance as
  pending until the subobjective lands it.
