# T2 trigger-surface normalization executed

## Summary

Tranche 2 executed as one branch via an Objective Runner step on
`skill-audit-t2-trigger-surface` (commit 15296e9c, stacked on the final T1 slice).
35 SKILL.md files edited: the five legacy `Command:` description stubs replaced with
real trigger descriptions (changelog-update's commented-out description restored);
nine workflow-summary descriptions converted to trigger-shaped ones; synonym trigger
lists collapsed (objective-create, objective-autorun, create-bun-typescript-project,
branch-context, branch-context-from-plan); `metadata.internal: true` restored on
ns-cmux-branch-triage and the unexplained `model: opus` removed from
code-gt-restack-resolve; the internal `ts/packages` path citation dropped from
objective-autorun while keeping the quoted safety rule; plus 14 further live T2
findings across brmem/handoff/code-ops/TS/meta skills.

Dispositions: six findings were already resolved by T0/T1 slices (re-verified live);
the ns-typescript/typescript-style trigger overlap was resolved by the T3 ownership
split; dignified-python items are out of scope (moved to ns-python); the two
tripwire-stub wording findings were rejected as superseded — those files are
sanctioned-duplication stubs re-instantiated from the adversarial-reviews template,
so per-stub edits would break template parity; the create-* two-place scope pairing
was recorded by the audit itself as not a defect.

Validation: `just` green end to end, `areg check` OK with no overlay drift from the
frontmatter edits, `areg skill show` exit 0 for all 35 edited skills.

## Objective Impact

The Tranche 2 roadmap row is complete: every T2-tagged audit finding is applied or
dispositioned. Ambient-routing surface changed by design: descriptions on several
`normal`-kind skills (branch-context, typescript-style, code-fix-gh-stack, brmem) now
read as triggers, which alters model auto-routing fleet-wide — flagged for PR review
attention.

**Open decision surfaced (deferred, needs human/ADR):** code-resolve-merge-conflicts
is invoke-only today while `docs/conventions/skill-conventions.md` cites
merge-conflict resolution as a canonical bucket-1 ambient example. Reconciling
requires an ADR-0016-style ambient-eligibility decision not covered by the frontload
update; the runner deferred it per the ambiguity rule.

## Follow-Ups

- Reconcile code-resolve-merge-conflicts invocation kind vs. the conventions doc's
  bucket-1 example (human decision; via `areg skill apply` or a conventions-doc edit).
- If the tripwire-stub wording improvements are still wanted, edit the
  `docs/conventions/adversarial-reviews.md` template and re-instantiate all stubs.
- Remaining tranches: T3 remaining clusters, then T4 dispositions.
