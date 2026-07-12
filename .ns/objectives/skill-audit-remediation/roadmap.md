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
- [x] Tranche 1 — mechanical cuts across the fleet: apply the 289 T1 findings
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
      ns-python; see the t1-scaffolding-cuts update); TypeScript/CLI executed 2026-07-12
      on `skill-audit-t1-typescript-cli` (5 files, 679→634 lines; see the
      t1-typescript-cli-cuts update); docs/retro/setup executed 2026-07-12 on
      `skill-audit-t1-docs-retro-setup` (10 files, 1304→1233 lines; see the
      t1-docs-retro-setup-cuts update); review/meta executed 2026-07-12 on
      `skill-audit-t1-review-meta` (5 skill files + skill-conventions.md, 991→855
      lines; the four T3-re-instantiated review stubs' findings dispositioned as
      superseded per their sanctioned-duplication markers — see the
      t1-review-meta-cuts update). All eight family branches done; Tranche 1 is
      complete fleet-wide.
- [x] Tranche 2 — trigger-surface normalization: real descriptions for the legacy
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
      Executed 2026-07-12 on `skill-audit-t2-trigger-surface` (35 files; see the
      t2-trigger-surface-executed update). One deferral needing a human/ADR decision:
      code-resolve-merge-conflicts invocation kind vs. the skill-conventions bucket-1
      ambient example.
- [x] Tranche 3 — structure and single-source-of-truth consolidation: execute the T3
      findings. Completed 2026-07-12: final cluster (TOCs, sharpened completion
      criteria, allowed-tools narrowing, closing sweep) on
      `skill-audit-t3-final-cluster` — see the t3-final-cluster-executed update; all
      T3 findings applied or dispositioned.
      Guidance: main clusters — objective family (**executed 2026-07-12** on
      `skill-audit-t3-objective-ssot`: umbrella owns Selection rules and the two
      sanctioned exceptions, picker spec disclosed to `docs/objective-system.md`,
      family self-contained/delta-only policy stated once, create Stop/ask owns stop
      conditions, Horizon/Drive axes single-homed in the patterns catalog, RDD facade
      gained its Verify-and-stop binding — see the t3-objective-family-ssot-executed
      update); review family (**executed 2026-07-12** on
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
      (**executed 2026-07-12** on `skill-audit-t3-neutral-homes`:
      autobranch-family-boundaries and cmux posture+badges moved to
      `docs/conventions/`, gt plumbing-not-display merged into
      graphite-dependency-boundary.md, just-gate-map.md and doc-economics.md created,
      15 skills reduced to pointers; one --recover cycle for a staged index — see the
      t3-neutral-homes-executed update); disclosure moves (**executed 2026-07-12** on
      `skill-audit-t3-disclosure-moves`: code-smush recovery/feedback, stack-map
      palette, objective-retro templates/maintainer notes, skill-management
      umbrella-families all moved to same-skill references; always-loaded surface
      1062→887 lines — see the t3-disclosure-moves-executed update); TOCs for
      reference files over ~300 lines (code-gh graphql references,
      architecture-topology-report HTML-REPORT.md);
      sharpen the flagged vague completion criteria (ccc-branch-triage, code-thermostack,
      code-gt-restack-resolve, skill-management rename).
      Neutral-home policy (decided 2026-07-12): shared family material defaults to
      `docs/conventions/` per the adversarial-reviews precedent — merge into an existing
      conventions doc when one fits (e.g. the gt plumbing-not-display rule near
      `graphite-dependency-boundary.md`), create a focused new doc otherwise; the runner
      chooses per item within this policy.
- [~] Tranche 4 — CLI push-down execution: dispositions for all 29 candidates were
  decided 2026-07-12 (frontload update); this row implements the accepted ones and
  creates the graduate records.
  Progress: routing retrofit executed 2026-07-12 on
  `skill-audit-t4-routing-retrofit` (thermostack + linearize-descendants now route
  topology reads through the stack-branches/stack-map-branches execs — see the
  t4-routing-retrofit-executed update); backup-refs implemented 2026-07-12 on
  `skill-audit-t4-backup-refs` (`ns slot gt exec backup-refs` with unit+scenario
  tests, both consumer skills retrofitted — see the t4-backup-refs-implemented
  update); wait-for-checks implemented 2026-07-12 on
  `skill-audit-t4-wait-for-checks` (`ns address exec wait-for-checks` with
  Clock/TimerScheduler seams; code-fix-gh-stack's polling loop is now one call — see
  the t4-wait-for-checks-implemented update); handoff slug/match implemented
  2026-07-12 on `skill-audit-t4-handoff-slug-match` (create-side normalization plus
  `ns handoff exec match` sharing the Pi pickup ladder — see the
  t4-handoff-slug-match-implemented update); episode-slice script implemented
  2026-07-12 on `skill-audit-t4-episode-slice` (bundled slice-episode.mjs with hard
  output caps; no new ns CLI — see the t4-episode-slice-implemented update). All
  five accepted implementations done; graduate records and the areg-mutations note
  remain.
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
