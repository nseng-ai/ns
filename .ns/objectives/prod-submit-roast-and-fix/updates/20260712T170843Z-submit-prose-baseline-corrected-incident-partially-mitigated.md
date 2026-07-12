# Submit prose baseline corrected; routing incident partially mitigated

## Summary

Trunk refresh verified the record against HEAD ground truth. The ideation frame
holds end to end: no `ns flow ship` command exists (no `ship` verb in the flow
extension or `ts/packages/capabilities/flow/src/ns/commands/`); `ReviewFinding`
still carries only `severity` (`ts/packages/capabilities/reviews/src/core/models.ts`)
with no `disposition` or `auto_apply` anywhere in the reviews package; no
`review-fix` command exists; the `tripwire` role and `quick` model profile exist;
`.github/workflows/reviews.yml` and the `findings-comment.ts` convergence stamping
(last-reviewed head plus prior-findings union, ADR 0027 Proposed) are as described;
the package is `@nseng-ai/reviews` (ADR 0029); both lineage records carry `closed.md`.

Two corrections/additions landed:

1. **Baseline correction:** the completion criterion claimed cheap `submit`
   "retains" a no-review/no-prose contract. False as a status claim: today's single
   `ns flow submit` generates PR titles and managed descriptions by default (its own
   help text: existing PRs with empty bodies receive generated titles and
   descriptions; `--regenerate-descriptions` rewrites the rest). The verb split must
   *move* prose work to `ship`, not preserve a status quo. The criterion and the
   ship-pipeline-integration row now say so.
2. **Incident partially mitigated:** trunk commit 5636cb792 ("Generate descriptions
   for empty existing PRs", 2026-07-11) closes the symptom of the intent-routing
   incident — bare PRs created by raw `gt submit` are now backfilled with titles and
   managed descriptions on the next `ns flow submit`. The routing-policy gap remains
   open: `skills/code-gh/SKILL.md` still offers `ns flow submit` and
   `gt submit --no-interactive` as equivalent publish paths, so the
   skill-reconciliation follow-up from the 2026-07-11 update is not done. Incident
   PR states as of this refresh: #3395 and #3396 merged, #3397 closed (they were
   drafts when the incident update was written; they remain contextual, not delivery,
   evidence).

Provenance: objective-refresh basis target=c1cb8d5d3 from=trunk-HEAD

## Objective Impact

- No completion criteria met; one Question Row resolved ([x] Submission-class
  surface) and nine remain open. The Objective stays open.
- `objective.md`: the first completion criterion now states the split must establish
  (not retain) submit's no-prose contract; the materialized intent-routing risk
  bullet records the 5636cb792 partial mitigation, current PR states, and the
  still-unreconciled agent-facing skill routing.
- `roadmap.md`: the Ship pipeline integration row gains a note that PR prose
  generation currently lives inside `ns flow submit` and that the row owns
  relocating it. No row status changed; no question was resolved.

## Follow-Ups

- The skill-reconciliation follow-up from the 2026-07-11 update stands: agent-facing
  Graphite, code-gh, PR-address, and Flow submission guidance still permits raw
  `gt submit` as an equivalent completion path.
- When the pipeline-integration row is worked, decide how `submit` sheds its current
  default description generation without regressing the empty-body backfill that
  mitigates the incident class.
