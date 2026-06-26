# Confirmation/Danger-Tier ADR Recorded

## Summary

Authored `docs/adr/0014-clinkr-confirmation-danger-tiers.md`, the confirmation and
danger-tier ADR for this subobjective. It defines four authoring danger tiers
(0 read-only, 1 scoped/reversible, 2 destructive/external, 3 high blast radius),
TTY-gated interactive prompting, non-interactive fail-fast behavior, and dry-run
as a successful `ok(...)` inspection. The ADR keeps tiers as `sdl-cli-design`
authoring discipline rather than a new Clinkr framework type, and keeps
`ClinkrInteraction.confirm` as the only confirmation primitive for this slice.

The Tier 3 stance changed during authoring. The original Objective draft assumed a
generic `--yes` could authorize severe operations; the accepted decision instead
standardizes Tier 3 on `--force` / `-f`. A Tier 3 command refuses the
high-blast-radius operation by default, and `--force` is what relaxes that guard,
so it is the correct verb. This matches the established local convention: `-f` is
already the short alias for `--force` on `brmem put`, `handoff delete`,
`handoff gc`, and `slot gc` (verified, no collisions). Tier 2 scoped destructive
operations use `--yes` / `-y`; the two flags are explicitly not synonyms
(confirm-the-prompt vs override-a-precondition).

## Objective Impact

- Roadmap row "Write the confirmation/danger-tier ADR" is complete (`[x]`),
  evidenced by `docs/adr/0014-clinkr-confirmation-danger-tiers.md`.
- Scope and Assumptions/Risks in `objective.md` were revised from the
  `--yes`-acceptable Tier 3 stance to the `--force`/`-f` standard; the earlier
  assumption is marked revised rather than deleted.
- Open Questions resolved: the ADR title/number is `0014`, and the
  `--yes`-vs-`--force` phrasing is decided. Remaining open questions are now
  scoped to framework conformance (whether `ClinkrInteraction.confirm`/options/
  envelopes/schema need changes, and which commands serve as conformance
  evidence).
- Next roadmap row is the Clinkr audit against the accepted ADR.

## Follow-Ups

- Audit Clinkr against ADR 0014 and identify the minimal framework/runtime/schema/
  test deltas needed for conformance (most plausibly confirming TTY-gated
  prompting and non-interactive fail-fast).
- Ensure `sdl-cli-design` later encodes the same four-tier model and the
  `--yes`/`-y` vs `--force`/`-f` verb split.
- Carry the residual risk that bare `--force`/`-f` may be too weak for the most
  extreme commands, which may need a typed `--confirm <value>` on top.
