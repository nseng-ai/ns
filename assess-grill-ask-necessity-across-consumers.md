# Handoff: Investigate necessity of the grill_ask tool

Continuation focus: Investigate whether the `grill_ask` structured-question tool is necessary at all — where it is used, what value structured options/recommendations add versus plain freeform prose questions, and whether its consumers (grilling-family skills, harness guidelines) should drop or keep it.

## Context

On branch `pr-make-accountable` (PR #3833), a session ran the new `skills/pr-make-accountable/SKILL.md` skill (an accountability interview over a PR). The agent used `grill_ask` for interview questions; the user objected twice:

1. First objection: structured options leaked the answer key (multiple-choice defeats an exam meant to test recall).
2. Second objection: `grill_ask` should not be used **at all** for this skill — the engineer should give free-text answers in plain conversation.

The skill was edited accordingly, and the user then said: "i want to investigate the necessity of the grill_ask tool" — widening the question from this one skill to the tool itself.

## Current State

- `skills/pr-make-accountable/SKILL.md` Phase 2 now contains an explicit ban (uncommitted edit on this branch): ask in plain prose, expecting free-text answers; do not use structured question tools such as `grill_ask` or offer multiple-choice options, because canned choices leak the answer key and turn the exam into recognition instead of recall.
- That edit is **not yet committed**; the branch also carries PR #3833's two commits (pr-make-accountable skill + PR-description collapse/prefill fixes).
- A pr-make-accountable interview over PR #3833 was in progress and is paused at Phase 2, Question 1 ("why does the skill involve touching `pr-description-body.ts`?"). Resuming that interview is secondary to the investigation.
- No investigation of grill_ask's necessity has started yet.

## Decisions / Findings

- Decided: pr-make-accountable interviews must be plain-prose/freeform; structured multiple-choice is anti-thetical to an exam (recognition vs. recall).
- Open question: does that critique generalize? `grill_ask` is surfaced by the Pi harness (guideline: "Use grill_ask for each user-facing question in grill-me sessions") and by the `grilling` skill (vendored, `skills-lock.json` points at `skills/productivity/grilling/SKILL.md` under the vendored source). Grilling sessions differ from exams: there the *user* is being stress-tested about their own plan, and options/recommendations may be legitimate aids rather than leaks — or may still bias answers.
- Useful fact: `skills-lock.json` `computedHash` entries are only format-validated by `areg check` (`ts/packages/tools/areg/src/operations/check.ts`, `checkLockfileHashes`), so SKILL.md edits do not require lockfile hash refreshes.

## Next Steps

1. Inventory `grill_ask` consumers: harness system-prompt guidelines, `grilling` skill and its family (`grill-*`, `enriched-plan`/`plan:grill-and-save` flows), any Pi extension defining the tool.
2. For each consumer, assess whether structured options + recommendation help (fast convergence, decision capture) or harm (answer leakage, biasing, friction vs. freeform).
3. Form a recommendation: keep as-is, restrict to specific contexts (e.g., decision questions with genuinely enumerable options, never exam/recall questions), or retire in favor of prose questioning.
4. If the tool stays, consider documenting when *not* to use it (exam/recall interviews) wherever the tool guidance lives.
5. Optionally: commit the pending `skills/pr-make-accountable/SKILL.md` edit, and/or resume the paused Phase 2 interview for PR #3833.

## Investigation Sources

- Source session ID: 019f90d9-e806-73f6-8908-eef1b6313405
- Source session log: /Users/schrockn/.pi/agent/sessions/--Users-schrockn-.local-state-ns-slots-repos-ns-worktrees-slot-02--/2026-07-23T21-20-27-654Z_019f90d9-e806-73f6-8908-eef1b6313405.jsonl
- Related files:
  - `skills/pr-make-accountable/SKILL.md` — carries the uncommitted Phase 2 ban on grill_ask; the concrete precedent for the investigation.
  - `skills/grilling/` (resolves through `skills-lock.json` to the vendored `skills/productivity/grilling/SKILL.md`) — the primary grill_ask consumer to evaluate.
  - `skills-lock.json` — maps skill names to sources for the consumer inventory.
  - `ts/packages/tools/areg/src/operations/check.ts` — evidence that lockfile hashes are format-only checks (relevant if skills get edited during this work).

## Useful Commands / Files

- `rg -ln "grill_ask" skills .agents/skills docs` — find grill_ask references across skills and docs.
- `areg skill find grilling --format json` — resolve the canonical grilling SKILL.md path.
- `git diff -- skills/pr-make-accountable/SKILL.md` — see the exact pending Phase 2 edit.
- PR under interview: https://github.com/nseng-ai/ns/pull/3833
