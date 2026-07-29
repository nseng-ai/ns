# Umbrella Restructure and Slug Migration

## Summary

The user restructured this Objective into an umbrella-of-umbrellas organized around three end-state outcomes: (a) professional repo presentation with progressive disclosure, (b) seamless install and use of ns outside this checkout, and (c) code organized to make unmistakable what we stand behind versus what is incubating. At the user's explicit request the record underwent a slug migration from `incubator-curation-and-transfer` to `professional-repo-curation` (`git mv`, history and updates intact), retitled "Professional Repo: Curation, First Ships, and Transfer".

Decisions settled in this session:

- **New Subobjective, first primary slice:** `rename-capability-to-extension` — the domain term "capability" becomes "extension", with a disambiguation contract against pi extensions. Its vocabulary verdict is hard-ordered before the demotion commit so paths and names move once. It also owns reconciling the `references/root-readme-positioning.md` taxonomy ("core capabilities" vs "extensions" axes).
- **New Subobjective, sanctioned parallel track:** `foundation-readme-driven-pass` — umbrella child owning the per-package Readme-Driven-Development pass (clinkr first); proceeds in parallel through the infra packages, with `sdk`/`capability-kit` hard-ordered behind the rename verdict.
- **One primary Subobjective at a time** is the umbrella's operating rule; the foundation pass is the standing exception.
- **First team-facing ship confirmed:** the single-player objective system (reaffirmed over pr-feedback); pr-feedback install/quickstart is the second ship and the leading README quickstart candidate.
- **Transfer stays in scope** as the umbrella's final act.
- **The graduation tail is demoted from completion criteria to demand-driven parked rows** (hosts wave, remaining daily drivers, flow, herdr, pi-extension batch): spawn a Subobjective only when a sponsor or consumer appears. Original sequencing notes preserved under `## Parked`.
- The two-zone reorg (demotion commit + invariant) was deliberately *not* spawned as a Subobjective yet; it stays a parent row pending the rename verdict.

## Objective Impact

`objective.md` was rewritten around the three-outcome thesis with mirrored edges to the two new Subobjectives; `roadmap.md` now carries child-tracking rows plus reordered parent rows (rename → two-zone reorg → first ship → presentation → hardening → transfer) with the graduation tail parked; `orientation.md` was re-derived to lead with the rename and the parallel foundation pass, and to warn agents off coining new "capability"-based names while the rename is unsettled.

## Follow-Ups

- Begin `rename-capability-to-extension` with its vocabulary-verdict interview.
- Spawn the `clinkr` Readme-Driven-Development Subobjective from `foundation-readme-driven-pass`.
- Decide (open question) whether the demotion commit executes directly from this umbrella or spawns a Subobjective when its turn comes.
- Commit the restructure and the previously uncommitted positioning edits on `establish-incubator-curation-transfer` via Graphite.
