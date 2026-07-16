# Engineer Control Over Adversarial Reviews Defined

## Summary

A grilling session resolved the second Question Row: how engineers control the
content and applicability of adversarial reviews, and which provenance must
survive into findings and resolution artifacts. The decisions deliberately build
on the existing Reviews substrate (`.ns/reviews/<key>/review.md` definitions with
`applies_to` globs and `model_profile` frontmatter; `ns.toml` `[models.profiles]`
/ `[models.operations]` mapping; `ns reviews review run <key>`).

1. **Authorship is repo-only.** The checked-in `.ns/reviews/` set is the sole
   source of review definitions for the roster. Engineer control is exercised
   through ordinary source control (branch/PR flow). Personal engineer-local
   definitions and ad-hoc run-time review prompts are excluded from the first
   loop and may graduate later as extensions.
2. **Applicability is glob intersection.** A review is applicable to the
   confirmed range iff its `applies_to` include/exclude globs intersect the
   range's changed paths. Richer semantics — always-applicable path-independent
   reviews, model-evaluated semantic applicability — are deferred.
3. **Model choice stays declarative.** The existing two-level indirection is the
   contract: the definition declares a `model_profile`; `ns.toml` maps profiles
   to concrete models. No per-run model choice; changing models means editing
   versioned configuration. The roster shows each review's resolved model.
4. **No per-run overrides beyond the journey's prompts.** Range choice and
   roster toggling are the only run-time controls. Per-run focus notes and
   path narrowing are excluded — they would blur the engineer-controlled
   definition boundary that repo-only authorship establishes.
5. **Full provenance.** Every finding carries: review key, definition version
   (commit or content hash), resolved model, and reviewed range. The run-level
   record additionally captures roster decisions — which applicable reviews were
   toggled off and which reviews failed — so the record shows what was *not*
   reviewed, not just what was found.

The through-line: a minimal, declarative, versioned control surface. Everything
an engineer controls is either checked-in state (definitions, model mapping) or
one of the journey's explicit prompts (range, roster), which keeps provenance
strong and reproducible.

## Objective Impact

- The `(grilling)` Question Row on engineer control over adversarial reviews is
  resolved and marked `[x]` in `roadmap.md`.
- This unblocks the multi-reviewer feedback semantics row (its only blocker was
  this row).
- Sharpens the reusable-artifact requirements row: the per-finding provenance
  tuple (key, definition version, resolved model, range) and the run-level
  roster record are now concrete required fields.
- Exercises the assumption that existing Reviews capabilities compose: the
  decisions ratify the current definition/frontmatter/profile contract rather
  than inventing a parallel one, and the pending research inventory row can now
  verify that contract against the journey's needs rather than propose one.
- Partially de-risks the provenance-erasure risk at the source: findings enter
  aggregation fully attributed; the remaining exposure moves to the
  aggregation/triage stages (the multi-reviewer semantics row).

## Follow-Ups

- Deferred extensions recorded, not planned: personal/ad-hoc review sources,
  always-applicable reviews, semantic applicability, per-run model override,
  and per-run focus notes/path narrowing. Revisit only if the exercised loop
  shows need.
- The definition-version field (commit vs content hash) needs a concrete choice
  when the reusable-artifact requirements row is worked; capture-time cost and
  dirty-tree behavior should decide it there.
