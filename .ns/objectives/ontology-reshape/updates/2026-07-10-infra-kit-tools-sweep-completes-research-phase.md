# Infra/capability-kit/tools sweep resolved; research phase complete

## Summary

Resolved the "Vocabulary sweep: infra, capability-kit, tools (research)" row — the
last of the four research rows. Per-package inventory with source citations at
`docs/wayfinding/ontology-reshape/vocab-sweep-infra-capability-kit-tools.md`; new
suspects jotted in `ideas.md`. Baseline held: exactly the seven roadmap packages are
tracked; nine untracked `node_modules` husks under `ts/packages/infra/` document the
absorbed standalone-infra split (their names map onto today's foundation and
capability-kit subpackages).

Headline findings: the **exec seam contradicts the root glossary three ways** — the
glossary assigns exec to Capability Kit and cites `ExecGateway`, while the contract
and the real spawning adapter live in foundation (real I/O inside the declared "no
real-world I/O" floor) under the live name `CommandExecApi`; the style guard's
brmem→capability-kit debt edge even records gateway placement as "not finalized",
so the indecision is machine-readable. Coverage is inverted: foundation and clinkr —
the workspace's most-imported packages — have no context and no README, while leaf
tools packagechk and vibechk are well documented (both strong deliberately-thin
candidates). Recurring collision suspects: `model-slug` exported by two packages for
two concepts, "registry" at four meanings, "runner" at four meanings, and a pattern
of unglossaried brand names (clinkr, areg, nscc — the root glossary defers to "areg
vocabulary" that is recorded nowhere).

## Objective Impact

- **All four sweep prerequisites are done: the four grilling rows (CCC/orchestration,
  layering vocabulary, source-control lifecycle, review/feedback residue) are now
  unblocked.** They are HITL — they resolve only through live exchange with the user;
  an agent must not self-answer them.
- The layering grilling row gains a second ground-truth anchor beside the tier
  taxonomy: the exec-seam contradiction cluster plus the debt-edge prose showing the
  glossary states as decided what enforcement records as open.
- The meta-vocabulary risk hunch strengthens again: the sharpest findings are about
  describing-language (Neutral Infra vs Kit Gateway claims, envelope/checkpoint seam
  splits), not product nouns.
- Decision-free drift fixes keep accumulating unlanded (now also: retired `@ns/`
  scope in graphite CONTEXT.md from the drift audit, SDL/ji residue, README pointer
  drift). Batch-landing them as one small PR before grilling starts remains the
  standing follow-up.

Method log (goals / working / not working):

- **Goal recap**: audit → reshape → document against a deliberately decided
  ontology; glossaries written once at the end; every reshaping a per-row HITL
  decision; simplification over delineation.
- **Working**: the manifest-first order keeps paying — `ns.*` metadata and export
  maps surfaced the debt-edge and subpackage findings before any source reading;
  checking enforcement config (style-guard taxonomy) against glossary prose is the
  cheapest contradiction detector this sweep found — recommend making
  "compare the machine-enforced config to the glossary claim" an explicit method
  step; reading only module tops (10–15 lines) covered seven packages in one
  session without drowning.
- **Not working / tensions**: the exclusion baseline is now three files read in
  full per sweep (root context + package contexts) — tolerable at this scale but
  the documentation phase will need a tighter checklist; suspects increasingly
  repeat across sweeps (brand-name pattern, two-name concepts), which suggests the
  grilling rows should consume the *pattern* list in `ideas.md` rather than
  re-deriving per-package instances; the sweep-asset format's per-package
  inventories are reference material — grilling sessions should read Summary +
  Cross-package themes + `ideas.md` only, confirming the prior update's steer.

## Follow-Ups

- The Frontier now holds only the four HITL grilling rows (plus the blocked triage
  row); next session should schedule a grilling exchange with the user.
- Batch-land the accumulated decision-free drift fixes as a small PR before the
  grilling phase.
- Keep appending method-log sections; the Fog entry in `objective.md` owns the
  skill-extraction decision.
