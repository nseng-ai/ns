# Ground-truth refresh: frontier verified, remote convergence grounded

## Summary

Trunk refresh verified the record against HEAD ground truth. Most of the ideation
frame holds: `ns flow submit` exists as the cheap-submit baseline; `ReviewFinding`
carries `severity` (`info`/`warning`/`error`) but no `disposition` or `auto_apply`
(both correctly proposed as new); the `tripwire` review role and the `quick`
model-profile (which maps to the tripwire display role) exist; and both lineage
records `roaster-addressing-engine` and `roaster-graphite-stack-workflow` are closed.
Per ADR 0029, "Roaster" is still the current engine name and `roaster` the CLI
subcommand even though the package renamed to `@nseng-ai/reviews`, so the record's
"roaster" vocabulary is not drift.

Two material corrections landed:

1. `roaster.yml` does not exist. The remote review workflow is
   `.github/workflows/reviews.yml`. The "Remote roaster's residual role" row was
   corrected to name the real file.
2. Anti-incremental review state is not greenfield. The remote path already implements
   generation-time convergence: `ts/packages/capabilities/reviews/src/core/findings-comment.ts`
   stamps a last-reviewed head plus a capped prior-findings union into the GitHub
   Findings comment, and review runs consume prior-findings context (design: ADR 0027,
   Proposed). Two of the three candidate state locations the encoding row listed
   (PR-body/Findings-comment machine block, prior-findings-context pattern) are this
   existing mechanism.

## Objective Impact

- No completion criteria met; this is an early ideation record (all 10 Question Rows
  still open) and remains open.
- `objective.md` gains a Grounding bullet under Assumptions and Risks reframing the
  anti-incremental problem as extending existing remote convergence machinery, not
  designing from scratch; the anti-incremental soft-attestation risk now points at
  local/remote interoperation.
- `roadmap.md`: the anti-incremental state-encoding row and the remote-roaster-role
  row were rewritten to reference `findings-comment.ts`, ADR 0027, and
  `.github/workflows/reviews.yml`. No row status changed; no question was resolved.

Provenance: objective-refresh basis target=a814ebe365b9164fdcd31c3cf09c681be670c4f0 from=trunk-HEAD

## Follow-Ups

- The anti-incremental and remote-role rows should read `findings-comment.ts` and ADR
  0027 in full before proposing a local stack-tip encoding, to avoid duplicating the
  existing GitHub-Findings-comment convergence store.
