# Roadmap

Tranches are ordered for a Graphite stack: correctness first, safe deletions next,
ambient-surface changes third, structural consolidation last. Each row re-verifies its
findings against the live files before editing (line references in
`references/audit-findings.md` are anchored to commit e2ffd398e).

## Work

- [x] Tranche 0 — correctness fixes: repair the verified skill-text-vs-reality bugs.
      Guidance: objective-retro writes to the retired `objective-review` brmem namespace its
      own contract forbids; branch-context-impl names a nonexistent
      `data.implementation_prompt_file` field and enriched-plan-save reports snake_case
      fields the CLI emits as camelCase; code-just-fix's failure taxonomy/success template
      lists Python gates absent from `_check-core`; setup-pypi-publish generates
      `build: clean` into fresh justfiles with no `clean` recipe; dignified-python's core
      reference hangs on a bare `@`-include no harness expands, plus stale "Auto-invoke"
      scaffolding; the umbrella objective skill's Tracking Gate contradicts objective-next's
      CLI-backed gate; python-fake-driven-testing's `python-specific.md` contradicts the
      pytest skill's doctrine; cli-push-down's `success:`-envelope and mock-first testing
      contradict ns-cli-design/ADR 0011 and fake-driven testing; skill-management promises a
      nonexistent "publish" workflow; architecture-topology-report points at the wrong
      sibling skill name. Resolve the project-setup router install-state contradiction and
      the code-gt-linearize-descendants submit-consent gap per the objective's Open
      Questions.
      Evidence: each fix verified against the emitting CLI/justfile/install state; `just`
      green.
- [~] Tranche 1 — mechanical cuts across the fleet: apply the 289 T1 findings
  (duplication, no-op, sediment, negation deletions) per skill, honoring
  sanctioned-duplication markers.
  Guidance: land as a few family-grouped branches in one stack (objective family;
  branch-context/handoff/brmem; code/Graphite ops; flow+ccc; scaffolding;
  TypeScript/CLI; docs/retro/setup; review/meta) so review stays tractable; record
  per-family `wc -l` before/after. The python family moved to `nseng-ai/ns-python`
  (2026-07-12); its T1 findings are out of scope here.
  Progress: objective family executed 2026-07-12 on `skill-audit-t1-objective-family`
  (18 files, 1502→1487 lines, ~-1,574 words; see the t1-objective-family-cuts
  update); branch-context/handoff/brmem executed 2026-07-12 on
  `skill-audit-t1-branch-context-handoff` (10 files, 893→842 lines; one finding
  rejected as test-pinned — see the t1-branch-context-handoff-brmem-cuts update);
  code/Graphite ops executed 2026-07-12 on `skill-audit-t1-code-graphite-ops`
  (11 files, 1816→1734 lines; see the t1-code-graphite-ops-cuts update); flow+ccc
  executed 2026-07-12 on `skill-audit-t1-flow-ccc` (8 files, 781→731 lines; live
  naming is `ns-cmux-*`/`ns cmux exec`, not the audit's `ccc-*` — see the
  t1-flow-ccc-cuts update); scaffolding executed 2026-07-12 on
  `skill-audit-t1-scaffolding` (2 live files — four batch-8 skills moved to
  ns-python; see the t1-scaffolding-cuts update); three family branches remain
  (TypeScript/CLI; docs/retro/setup; review/meta).
- [ ] Tranche 2 — trigger-surface normalization: real descriptions for the legacy
      `Command:` stubs (ns-flow-cp, ns-flow-submit, code-just-fix, code-workflows,
      changelog-update); convert workflow-summary descriptions to trigger-shaped ones
      (code-fix-gh-stack, objective-retro, code-thermostack, docs-retro, branch-retro,
      context-bundle-analysis, architecture-topology-report, skill-management, skill-audit);
      collapse synonym trigger lists (create-* family, objective-create,
      objective-autorun); fix `metadata.internal` drift (ccc-branch-triage) and the
      unexplained `model: opus` on code-gt-restack-resolve; drop internal-path citations from
      public skills (objective-runner-step, objective-autorun).
      Guidance: every change through `areg`-sanctioned paths; verify each with
      `areg skill show <name>`.
- [ ] Tranche 3 — structure and single-source-of-truth consolidation: execute the T3
      findings.
      Guidance: main clusters — objective family (umbrella owns Selection/Record
      Frontmatter/validation-row/PR-wording rules, leaves point; patterns catalog owns
      composition/identity, facades keep deltas); review family (**executed 2026-07-12** on
      `skill-audit-t3-adversarial-reviews`: `docs/conventions/adversarial-reviews.md`
      landed generalizing the ns-typescript-style-tripwire provenance/regeneration
      pattern, provenance backfilled on the five reviews lacking it
      (dry-but-not-too-dry verified standalone), the five stubs re-instantiated from
      the doc's lean template as sanctioned duplication, code-smell-review recorded
      runner-only, `.ns/reviews/README.md` points at the doc — see the
      t3-adversarial-reviews update); TypeScript ownership split (**executed 2026-07-12** on
      `skill-audit-t3-ts-ownership-split`: `ts/AGENTS.md` owns repo-specific
      test-lane/time-seam/style-guard detail; `ns-typescript` rewritten toward
      portability, pointing at the host repo's AGENTS.md — see the
      t3-typescript-ownership-split update); shared family material to neutral homes
      (autobranch-family-boundaries, cmux-read-only-posture, gt plumbing-not-display rule,
      just-gate map, doc-economics rules shared by docs-retro/branch-retro); disclosure moves
      (code-smush recovery/feedback sections, ccc-stack-map palette, objective-retro
      templates/maintainer notes, skill-management umbrella-families section); TOCs for
      reference files over ~300 lines (code-gh graphql references,
      architecture-topology-report HTML-REPORT.md);
      sharpen the flagged vague completion criteria (ccc-branch-triage, code-thermostack,
      code-gt-restack-resolve, skill-management rename).
      Neutral-home policy (decided 2026-07-12): shared family material defaults to
      `docs/conventions/` per the adversarial-reviews precedent — merge into an existing
      conventions doc when one fits (e.g. the gt plumbing-not-display rule near
      `graphite-dependency-boundary.md`), create a focused new doc otherwise; the runner
      chooses per item within this policy.
- [ ] Tranche 4 — CLI push-down execution: dispositions for all 29 candidates were
      decided 2026-07-12 (frontload update); this row implements the accepted ones and
      creates the graduate records.
      Guidance: **Accepted (implement here):** `ns slot gt exec backup-refs` (shared by
      code-smush and code-gt-linearize-descendants); `wait-for-checks` primitive beside
      `ns address exec branch-pr-checks`; `ns handoff create` slug normalization plus
      `ns handoff pickup` term-matching; a bundled episode-slice script for
      context-bundle-analysis; the routing retrofit pointing code-thermostack and
      code-gt-linearize-descendants at the existing `stack-branches` exec (no new CLI).
      **Graduate (runner creates minimal objective records):** `ccc exec`
      inventory/manifest helper; objective exec surface extension (refresh-targets,
      update/refresh evidence, retro reconstruction pipeline); `ns slot gt exec`
      restack-preflight + descendants-report; areg mutation commands are recorded as a
      note/edge on the existing skill-management-subsystem objective rather than a new
      record. **Rejected (rationale in the frontload update):** changelog-update
      commit-fetching (skill keeps pure-git portability); create-*/setup-* bundled
      scripts (usage too low); merge-conflicts inventory command; envelope
      field-drift check; objective-retro `--repo/--branch` flag defaults (noted for the
      next ns retro CLI iteration, untracked here).

## Parked

- [ ] Closing audit spot-check: after Tranches 0–3 land, re-run `skill-audit` on a sample
      of the most-edited skills to confirm the remediation introduced no new duplication or
      sediment (graduates into Work when the stack is up).

Resolved 2026-07-12: the family-shared scaffolding row for the create-* trio is
rejected — the scaffolding skills see too little use to justify shared instantiate
scripts (decision in the frontload update; the T4 create-*/setup-* rejection covers the
same ground).
