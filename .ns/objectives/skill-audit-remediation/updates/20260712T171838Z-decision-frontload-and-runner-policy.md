# Decision frontload: all human-gated calls resolved, Runner Policy added

## Summary

The user asked to frontload every remaining human-steering decision in this Objective
so the rest of the work can run unattended (objective-autorun). All open decisions were
resolved with the user in-session (2026-07-12); the Objective record now carries a
durable `## Definition of Progress` and `## Runner Policy`, and no Open Questions
remain.

**Runner Policy decisions.** The runner creates stacked branches and commits via
Graphite autonomously; `gt submit`/PR creation and any other remote write require one
explicit human confirmation (stack is left local at the end of each run). Ambiguous
findings (stale, load-bearing, unclear against the live file) are dispositioned as
rejected/deferred with a one-line rationale in the slice's Semantic Update — the runner
never blocks a tranche on a question. Validation gate: `just` green plus `areg check`
before anything is kept.

**Open Question closed — `changelog-update` portability.** Keeps its "pure git, no
external tools" identity; the commit-fetching T4 push-down is rejected. T1 may still
trim the prose mechanically.

**T4 dispositions (all 29 findings, grouped into 14 decisions).**

Accepted — small, clearly bounded, implemented in this Objective's T4 row:

1. `ns slot gt exec backup-refs` — the backup-ref recipe is duplicated verbatim in
   code-smush Phase 3 and code-gt-linearize-descendants step 7; generic, so it escapes
   smush's packaging-specific park and respects the `slot gt` Graphite exception.
2. `wait-for-checks` primitive beside `ns address exec branch-pr-checks` — removes the
   only agent-driven polling loop in the code-ops family (code-fix-gh-stack step 9,
   pr-address boundary partner).
3. `ns handoff create` slug normalization/validation and `ns handoff pickup`
   term-matching — deterministic normalization/matching specs currently written as
   prose.
4. context-bundle-analysis: bundle an episode-slice script in the skill (offset/limit
   reads keyed off `turnRange`) — the hand-rolled version risks exactly the skill's own
   read-too-much hard rule; not an ns CLI because the input is a bundle file.
5. Routing retrofit: point code-thermostack's STACK_BASE_REF walk and
   code-gt-linearize-descendants' hand-recursed `gt children` at the existing
   `ns slot gt exec stack-branches` surface — no new CLI; resolves two HIGH findings.

Graduated — the runner creates minimal objective records as part of executing T4:

6. `ccc exec` inventory/manifest helper — the cmux+git+Graphite occupancy pipeline is
   written out near-verbatim three times (ccc-available-work, ccc-branch-triage,
   ccc-stack-map); real gateway + test work, too large for this Objective.
7. Objective exec surface extension — one objective covering `refresh-targets`,
   extending tracking-gate-style evidence to objective-update/objective-refresh, and
   the objective-retro reconstruction pipeline (which needs a new
   `ns objective exec` operation the skill's own Boundaries currently ban).
8. `ns slot gt exec` restack-preflight + descendants-report.
9. areg mutation commands (add-local/remove-local/rename) — recorded as a note on the
   existing skill-management-subsystem Objective rather than a new record.

Rejected — with rationale:

10. changelog-update commit-fetching push-down (portability decision above).
11. create-*/setup-* bundled instantiation scripts — the scaffolding skills see too
    little real use to justify the investment; the Parked family-shared-scaffolding
    row is resolved as rejected on the same basis.
12. code-resolve-merge-conflicts inventory command — the area is judgment-heavy and
    the deterministic win is modest; revisit if conflict tooling recurs as a theme.
13. Envelope field-name drift check — the root cause was fixed in Tranche 0;
    dedicated check machinery is speculative.
14. objective-retro `--repo/--branch` flag defaults (LOW) — noted for the next
    `ns retro` CLI iteration; not tracked in this Objective.

**T3 neutral-home policy.** Shared family material (autobranch-family-boundaries,
cmux-read-only-posture, gt plumbing-not-display, just-gate map, doc-economics rules)
defaults to `docs/conventions/` per the adversarial-reviews precedent: merge into an
existing conventions doc when one fits, create a focused new doc otherwise; the runner
chooses per item within this policy.

## Objective Impact

Every roadmap row is now executable agent-alone under the Runner Policy: T1 and T2
were already mechanical, the remaining T3 clusters carry decided guidance plus the
neutral-home policy, and T4 is decided down to per-item dispositions. The record's
Open Questions section is empty. Remaining human touch-points are PR-stack submission
(one confirmation) and PR review itself.

## Follow-Ups

- Roadmap edited alongside this update: T4 row rewritten from "decide" to "execute
  dispositions", T3 row carries the neutral-home policy, the Parked create-* row is
  resolved as rejected.
- `objective.md` edited: Open Questions emptied, `## Definition of Progress` and
  `## Runner Policy` added.
- When the graduated records are created during T4, link them (edges) back to this
  Objective and put the areg-mutations note on skill-management-subsystem.
