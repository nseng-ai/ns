# Code-smush skill rewritten to replacement-stack semantics; embedded decisions settled

The *Code-smush replacement-stack repackaging rewrite* task row is complete:
`skills/code-smush/SKILL.md` now expresses the replacement-stack repackaging
process resolved on 2026-07-11 (see
`updates/2026-07-11T132402Z-replacement-stack-repackaging-resolved.md`), and the
row's two embedded decisions were settled in a live session the same day.

## Decisions

1. **Generation token: `st<num>` as a run-segment suffix.** A replacement stack's
   branch names append `-st<num>` to the `<run>` segment —
   `retry-budgets-st2--01s-gateway-scaffolding`. The greedy `<run>` match absorbs
   the token, so the `<run>--<NN><c>-<slug>` grammar and its parse regex are
   unchanged, and generations sort adjacent to the original run. Initial packaging
   is implicitly generation 1 and carries no token; the first replacement is
   `st2`, and the number is chosen LBYL as the lowest not already used by a local
   branch. This supersedes the earlier ad-hoc "append `-smush`" collision
   guidance.
2. **Review-feedback carry-forward lives in a companion post-submit step**
   (decide-skill family), not inside smush. Smush stays strictly local-only — no
   read-only GitHub inspection step — and its repackaging report hands off: the
   complete old-stack close-candidate list plus a pointer to the companion step.
   `gt absorb` / `gt modify --into` remains the local path for commit-content
   feedback that does not move slice boundaries. Authoring the companion step
   belongs to the decide-skill row.

## Rewrite (completion evidence)

`skills/code-smush/SKILL.md` rewritten section by section:

- Repackaging is **replacement-stack construction** throughout; the parallel /
  in-place mode-choice vocabulary is retired. The construction path is now a
  deterministic rule, not a user choice: a fresh, single-branch, PR-free run gets
  in-place initial packaging (the only surviving use of `gt rename`); previously
  packaged, submitted, PR-associated/unknown, or multi-branch accreted input gets
  replacement construction alongside an untouched input stack.
- Fold-based repackaging, orphaned-PR detection, and the rename-gap reporting rule
  are pruned to zero (`gt fold --stack --keep` remains a surveyed mechanic in the
  objective's survey, but no longer appears in the skill).
- The close-candidate set is deterministic — the entire old stack, branches plus
  PR numbers where known — reported loudly in Phase 7; closing stays with the
  user; the report points at the companion carry-forward step.
- Known limits now name the unobserved full replacement cycle (owned by the
  rescoped *Repackaging under change* prototype row) and the CI cost of re-running
  the full new stack per replacement generation.

Root `CONTEXT.md` drift fixed alongside: the **Packaging** entry's repackaging
sentence now states replacement-stack construction, and the **Decision PR** /
**Span PR** entries render post-submit review policy as `[decision]`/`[span]`
title prefixes plus grammar-bearing branch names (labels are Parked per the
2026-07-11 decision-lifecycle resolutions).

## Objective Impact

- Roadmap: the rewrite task row is checked off with both decisions recorded.
- The repackaging-chaos risk's residual narrows: coexistence naming and the
  carry-forward home are settled; what remains — carry-forward fidelity in
  practice and disciplined old-stack closure — is owned by the rescoped prototype
  row, which is now unblocked as the last human-gated prototype step.
