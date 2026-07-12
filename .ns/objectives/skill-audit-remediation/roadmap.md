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
- [ ] Tranche 1 — mechanical cuts across the fleet: apply the 289 T1 findings
      (duplication, no-op, sediment, negation deletions) per skill, honoring
      sanctioned-duplication markers.
      Guidance: land as a few family-grouped branches in one stack (objective family;
      branch-context/handoff/brmem; code/Graphite ops; flow+ccc; scaffolding;
      TypeScript/CLI; docs/retro/setup; review/meta) so review stays tractable; record
      per-family `wc -l` before/after. The python family moved to `nseng-ai/ns-python`
      (2026-07-12); its T1 findings are out of scope here.
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
      composition/identity, facades keep deltas); review family (six-way identical
      scaffolding → generated or shared-reference, decide the open question first); TypeScript
      ownership split (typescript-style owns rule semantics, ns-typescript owns ns
      enforcement, ts/AGENTS.md ownership decision); shared family material to neutral homes
      (autobranch-family-boundaries, cmux-read-only-posture, gt plumbing-not-display rule,
      just-gate map, doc-economics rules shared by docs-retro/branch-retro); disclosure moves
      (code-smush recovery/feedback sections, ccc-stack-map palette, objective-retro
      templates/maintainer notes, skill-management umbrella-families section); TOCs for
      reference files over ~300 lines (code-gh graphql references,
      architecture-topology-report HTML-REPORT.md);
      sharpen the flagged vague completion criteria (ccc-branch-triage, code-thermostack,
      code-gt-restack-resolve, skill-management rename).
- [ ] Tranche 4 — CLI push-down dispositions: for each of the 29 T4 candidates, record
      accept/graduate/reject with rationale; implement only the small, clearly-bounded
      accepted ones here.
      Guidance: strongest candidates from the audit — shared `ccc exec` inventory/manifest
      helper (three ccc skills hand-roll the same cmux+git+Graphite pipeline);
      `ns slot gt exec` additions (restack-preflight, descendants-report, backup-refs shared
      by code-smush and code-gt-linearize-descendants); extending the tracking-gate exec
      surface to objective-update/objective-refresh; areg mutation commands
      (add-local/remove-local/rename) collapsing skill-management's shell workflows;
      wait-for-checks primitive beside `ns address exec branch-pr-checks`. Larger items
      graduate to their own Objectives rather than expanding this one.

## Parked

- [ ] Closing audit spot-check: after Tranches 0–3 land, re-run `skill-audit` on a sample
      of the most-edited skills to confirm the remediation introduced no new duplication or
      sediment (graduates into Work when the stack is up).
- [ ] Family-shared scaffolding for the create-* trio (shared instantiate script or
      common-scaffold reference): worth doing only if the scaffolding skills see real use;
      re-judge at Tranche 4 time.
