# Descope Cleanup Landed on Master

## Summary

The skill and documentation cleanup that drops `objective exec tracking-gate-facts` from the shipped CLI surface is now done on master (via branch `finish-objetict-pushdown`). The reduced steelthread — `objective exec list` and `objective exec read-objective` — is consistent across the shipped commands, the skill delegation, the canonical doc, and the scenario tests.

The earlier update `updates/2026-05-14T094723Z-descope-cleanup-landed.md` claimed the same cleanup had landed, but it described commit `72edceef` on `origin/validate-initiative-steelthread`, which was never merged. After the 2026-05-14 rename of the initiative system to the objective system (PR #471), master kept the PR #467 surface that still presents `objective exec tracking-gate-facts` as shipped. This update records the work being completed directly on master.

Skill and doc revisions:

- `skills/objective/SKILL.md` Tracking Gate paragraph no longer mentions `objective exec tracking-gate-facts <slug-or-path> --base-ref <ref> --format md`; it now states that changed-path evidence collection and materiality judgment both remain skill/agent responsibilities in v1.
- `skills/objective/SKILL.md` Non-goals CLI tooling inventory lists `objective exec list` and `objective exec read-objective` only; "changed paths" was dropped from the facts list. The "do not parse Markdown headings, roadmap checkboxes, or prose meaning in CLI code" guard is intact.
- `docs/objective-system.md` Operations summary now reads `(list, read-objective)`.
- `docs/objective-system.md` `objective-next` Shipped CLI section keeps only the closed-record-filtering item and moves the two Tracking Gate items back under Future CLI pushdown candidates.
- `docs/objective-system.md` Tracking Gate section restores the wording that deterministic git comparison and changed-path scope facts are left as future CLI work, with branch evidence collection and semantic materiality both remaining LM/human-authored in v1.
- `docs/objective-system.md` Future CLI Pushdown Principle list flips the `Report changed-path facts` and `Collect read-only Tracking Gate evidence` entries back to `_(future.)_`.

No CLI source, test, or package changes were needed: the test residue from `598105c8` had already been removed on master via PR #468, and `packages/asdl-objectives/` never shipped a `tracking-gate-facts` module on master.

Verification on `finish-objetict-pushdown`:

- `uv run pytest packages/asdl-objectives/tests tests/scenario/test_plugins.py`: 30 passed.
- `just`: ruff, ruff format, dprint, ty, and `uv run pytest -n auto --ignore-glob='*/integration/*'` (1197 passed) all green.
- `grep -rn "tracking-gate-facts\|GitPathChange" skills/ docs/ packages/asdl-objectives/`: no matches.

## Objective Impact

`roadmap.md`:

- "Update Objective skills and docs to delegate deterministic mechanics for the two shipped commands" flips from `[~]` to `[x]`; the stale follow-up about removing `objective exec tracking-gate-facts` references is resolved.
- "Validate the reduced steelthread (two commands only)" flips from `[ ]` to `[x]` with the test-suite verification above as evidence.
- Every item under `## Work` is now `[x]`. The `## Parked` list is unchanged; deferred Tracking Gate work remains parked with the dropped `add-tracking-gate-facts-and-git-path-change-suppor` branch as its starting point.

`objective.md`:

- No durable narrative change. The Thesis, Scope, Out-of-scope, Completion Criteria, Assumptions/Risks, and Open Questions already described the descoped two-command steelthread after the 2026-05-14 descope update.

This Objective is now ready for `objective-close`. The CLI-creep risk is materially reduced for v1 because the shipped surface contains only filesystem-fact commands and the umbrella skill's explicit no-Markdown-parsing guard is intact.

## Follow-Ups

- Run `objective-close` for `initiative-cli-pushdown` once this branch lands on `master`.
- When closing, decide whether deterministic Tracking Gate evidence collection should be promoted into a follow-on Objective or left dormant in `## Parked`.
- Treat the earlier 2026-05-14 updates (`updates/2026-05-14T004058Z-skill-and-doc-audit-landed.md`, `updates/2026-05-14T012636Z-steelthread-validated.md`, and `updates/2026-05-14T094723Z-descope-cleanup-landed.md`) as superseded by `updates/2026-05-14T093556Z-tracking-gate-facts-descoped.md` and this update; do not cite their PR-5-done / steelthread-validated / cleanup-landed claims as current state of master.
