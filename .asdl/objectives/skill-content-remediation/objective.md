# Skill Content Remediation

## Thesis

The 56 first-party skills under `skills/` carry systematic content debt. A
writing-great-skills audit ranked every skill by remediation impact and found the
dominant failure mode is **duplication** — a contract (a command sequence, a
directory tree, an output template, a safety rule) restated verbatim or near-verbatim
in two to four places, usually via a trailing `Anti-patterns` / `command recipe` /
`Workflow` / `Verify` section that reprints rules already stated above. The secondary
mode is **oversized always-loaded blocks**: large reference material sitting inline in
`SKILL.md` that only one branch reaches and should be disclosed behind a pointer.

This Objective drives the high-yield fixes only: three cross-cutting **systemic**
findings, plus per-skill surgery on every skill the audit scored **5 or higher**. The
long tail of score 1–3 polish stays opportunistic, not a standalone push.

## Scope

- **Three systemic findings:**
  1. `Command: X` stub descriptions — set the correct areg invocation *kind* per skill.
     (Reframed: invocation is governed by areg's four kinds — `normal` / `ambient-only` /
     `invoke-only` / `command-backed` — applied via `areg skill apply` and enforced by
     `areg check`, not a hand-edited `disable-model-invocation` flag. The `Command: X` +
     commented-description frontmatter is the *rendered output* of an explicit-only kind,
     so a skill that is kind `normal` but shows that stub is misconfigured — "listed but
     unroutable.") Two streams: write real descriptions for incomplete `normal` skills,
     and reconcile deliberately-explicit skills to `invoke-only` (or `command-backed`
     only where a verified Pi replacement exists). Affects `sdl-submit`,
     `objective-close`, `objective-create`, `code-workflows`, `changelog-update`,
     `code-checkpoint`, `code-just-fix`, and the `setup-*` / `create-*` family
     (`code-autobranch` already carries a real `normal` description). Taxonomy documented
     in `docs/skill-conventions.md` § Skill Invocation Kinds.
  2. The grill pair (`pi-grill-ui`, `pi-grill-with-docs-ui`) duplicates a ~95%
     byte-identical shared core that has already drifted — single-source it.
  3. Branch-creation precedence policy is duplicated across
     `branch-context-from-plan/SKILL.md` and `branch-context/references/lifecycle.md`,
     and already drifting — single-home it. (Resolved: implementation confirmed the
     policy had **2** full copies, not the "triplicated" 3 originally recorded — only
     these two files restated the full precedence list.)
- **Per-skill remediation of every first-party skill scoring ≥5** in the audit
  (duplication collapse and disclosure surgery). Top targets: `objective-stack-impl`,
  `dignified-python`, `branch-context-impl`, `refactor-swarm`, `ccc-available-work`,
  `enriched-plan-save`, `python-fake-driven-testing`, `objective-refresh`,
  `objective-update`, `code-gt-restack-resolve`, `python-fake-driven-test-layout`,
  `handoff-create`, `ccc-stack-map`, `code-thermostack`, `pr-address`.
- **Source of truth:** edit the real files under `skills/` only. The
  `skills/` → `.agents/skills/` → `.claude/skills/` symlink chain means every edit
  lands in one place; never edit a symlinked copy.

## Non-Goals

- Not the polish tier (audit scores 1–3, ~22 skills). Those carry one collapsible
  repetition or a synonym-trigger description each; fix opportunistically when already
  in the file, not as tracked work.
- Not editing vendored third-party skills under `.agents/skills/` real directories
  (`writing-great-skills`, `skill-creator`, `grilling`, `grill-me`, `grill-with-docs`,
  `improve`, `improve-codebase-architecture`, `codebase-design`, `domain-modeling`,
  `fdt-refactor-mock-to-fake`, `graphite`, `opentui`,
  `thermo-nuclear-code-quality-review`, `ts-morph-*`) — these are upstream code.
- Not the `skill-management-subsystem` Objective's install/list/path/catalog tooling.
  This Objective is about skill *content*, that one is about the management *subsystem*.
- No new skills and no change to what any skill *does* — content and structure
  remediation only.

## Completion Criteria

The Objective can close when:

- All three systemic findings are resolved: the description-invocation policy is
  decided and applied across the stub-description skills; the grill core is
  single-sourced with the drifted wording reconciled; the branch-creation policy lives
  in exactly one home.
- Every first-party skill scoring ≥5 in the audit is either remediated or explicitly
  deferred with a recorded reason.
- No verbatim-duplicated contract and no already-drifting paired copy remains among the
  ≥5 skills.
- Evidence: each edited skill still loads (frontmatter valid, references resolvable),
  and disclosed reference files are reachable via their in-skill pointers.

## Assumptions and Risks

Assumptions:

- The audit's impact scoring is roughly correct and `≥5` is the right cut line for
  bespoke per-skill surgery. (Could be disproven if a parked score-3 skill turns out to
  cost more than estimated once touched.)
- The `Command: X` stub is a deliberate token-saving convention, not a bug, so systemic
  #1 is a per-skill policy *decision*, not a blanket description revert. (Refined: the
  stub is the *rendered output* of an areg explicit-only invocation kind, managed by
  `areg skill apply` — so the per-skill decision is which of the four kinds applies, and
  the application is mechanical/registry-driven, not a freehand frontmatter edit. A
  `normal` skill showing the stub is simply misconfigured.)
- Disclosing an oversized inline block to a reference reduces always-loaded cost without
  hurting reliability, *provided* the pointer wording names the concrete situation that
  should reach it.

Risks:

- The grill pair's self-contained-fallback constraint blocks a runtime pointer, so
  single-sourcing needs a build/install-time mechanism that may not exist yet. De-risk
  the mechanism before committing to an approach; the fallback is the reason the copies
  exist.
- Editing descriptions (systemic #1) is the highest-risk surface: it changes whether and
  how skills auto-trigger and whether other skills can reach them. A wrong call degrades
  routing silently.
- Edits must respect the symlink layout; editing a `.claude/skills/` or
  `.agents/skills/` symlinked path instead of the real `skills/` source would be a
  no-op or worse.

## Open Questions

- Systemic #1 (mechanism resolved; per-skill assignment remains): the mechanism is the
  areg four-kind taxonomy applied via `areg skill apply`, not a binary flag. Open per
  skill: which kind — `normal` (write a real description), `invoke-only`, or
  `command-backed` (only where a verified Pi replacement extension exists)? Needs a
  per-skill classification + sign-off before batch application.
- For the grill pair, what shared-core mechanism is acceptable given the
  self-contained-fallback requirement — a generation/templating step at install time, or
  a documented deliberate copy guarded by a drift lint?
- Should `python-fake-driven-testing`'s 11-file / 6.4K-line reference tree be consolidated
  (e.g. merge `quick-reference.md` and `workflows.md`) or only have its overlapping
  pointers sharpened?
