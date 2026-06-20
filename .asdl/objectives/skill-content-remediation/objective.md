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
findings, plus per-skill remediation of every skill the audit scored **5 or higher**.
The long tail of score 1–3 polish stays opportunistic, not a standalone push.

**Per-skill method (decided 2026-06-20):** the **from-scratch rewrite** against
`writing-great-skills` (preserving 100% of behavior) is the technique for the
high-lift/low-risk quadrant — a clean rewrite collapses duplication and discloses
oversized blocks as a *byproduct* while buying the clarity/LM-friendliness surgical
edits left on the table. It is **not** applied uniformly: a 2026-06-20 re-audit (update
`2026-06-20T140000`) replaced the single-score cut with a **(lift × risk) quadrant**
and ranks targets by **value = lift × reach × stakes − risk**. Safety-critical and
rigid-output-contract skills take the **surgical** path, never from-scratch; other
targets take prune-to-stub or move-to-reference. Behavior preservation is not an
intention but an operational gate — **extract-contract-then-diff** (see Assumptions and
Risks). Systemic #1/#2/#3 are already complete and unaffected.

## Scope

- **Three systemic findings:**
  1. `Command: X` stub descriptions — set the correct areg invocation *kind* per skill.
     (Reframed: invocation is governed by areg's four kinds — `normal` / `ambient-only` /
     `invoke-only` / `command-backed` — applied via `areg skill apply` and enforced by
     `areg check`, not a hand-edited `disable-model-invocation` flag. The `Command: X` +
     commented-description frontmatter is the *rendered output* of an explicit-only kind,
     so a skill that is kind `normal` but shows that stub is misconfigured — "listed but
     unroutable.") Two streams: write real descriptions for incomplete `normal` skills,
     and reconcile deliberately-explicit skills to `invoke-only` (no verified Pi
     replacement) or `command-backed` (a verified Pi replacement exists — membership in
     `COMMAND_STYLE_LOCAL_SKILLS` + the `real-gateways.ts` allowlist, which auto-generates
     a backing command; a skill with one *cannot* be `invoke-only`). Affects `sdl-submit`,
     `objective-close`, `objective-create`, `code-workflows`, `changelog-update`,
     `code-checkpoint`, `code-just-fix`, and the `setup-*` / `create-*` family
     (`code-autobranch` already carries a real `normal` description). **Resolved/applied:**
     objective-family → `normal`; `setup-*` → `invoke-only`; eight verified-replacement
     skills → `command-backed`. `command-backed` is exemplified, not just supported (this
     supersedes the earlier "unexemplified" framing). Taxonomy documented in
     `docs/skill-conventions.md` § Skill Invocation Kinds.
  2. The grill pair (`pi-grill-ui`, `pi-grill-with-docs-ui`) duplicates a ~95%
     byte-identical shared core that has already drifted — single-source it.
  3. Branch-creation precedence policy is duplicated across
     `branch-context-from-plan/SKILL.md` and `branch-context/references/lifecycle.md`,
     and already drifting — single-home it. (Resolved: implementation confirmed the
     policy had **2** full copies, not the "triplicated" 3 originally recorded — only
     these two files restated the full precedence list.)
- **Per-skill remediation of the high-value targets**, with the technique chosen by the
  (lift × risk) quadrant and the order set by value (reach), not raw lift (re-audit
  `2026-06-20T140000`): from-scratch rewrite against `writing-great-skills` for
  high-lift/low-risk targets (behavior preserved; duplication collapse and disclosure
  fall out of the rewrite); **surgical** for safety-critical / rigid-output-contract
  skills; prune-to-stub or move-to-reference for the rest. Top targets:
  `objective-stack-impl`, `dignified-python`, `refactor-swarm`, `ccc-available-work`,
  `enriched-plan-save`, `python-fake-driven-testing`, `objective-refresh`,
  `objective-update`, `code-gt-restack-resolve`, `python-fake-driven-test-layout`,
  `handoff-create`, `ccc-stack-map`, `code-thermostack`, `pr-address`, plus the new
  clarity/sprawl elevation candidates `brmem`, `objective`, and
  `code-resolve-merge-conflicts`. `branch-context-impl` **dropped off** (lift 1 / risk 4;
  its only disclosable block is a 6-trigger STOP safety contract — leave as-is).
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
  should reach it. (Exercised on `objective-stack-impl`: the two end-of-run sections
  moved to `references/final-response.md` behind a `## Final response` pointer that names
  the trigger — "hit a stop condition, about to write the final response" — cutting
  SKILL.md 282→217 with behavior unchanged. Still active for the remaining disclosure
  targets — now realized inside the from-scratch rewrite rather than as a standalone
  move.)
- A behavior-preserving from-scratch rewrite (against `writing-great-skills`) yields
  better clarity and LM-friendliness than surgical verbatim-move + recap-deletion, at
  acceptable risk, *because* the rewrite is gated by extract-contract-then-diff.
  (**Exercised once, holding:** the first rewrite — `objective-stack-impl` — cut SKILL.md
  217→136 lines with the contract preserved, collapsing a 4× "no hidden state"
  restatement and introducing leading words `parent`/`slice`/`verify-independently`. One
  data point, not yet a trend across the remaining targets.)
- Remediation value is **value = lift × reach × stakes − risk**, not lift alone
  (re-audit `2026-06-20T140000`). Reach = invocation frequency and always-loaded-ness;
  descriptions are always loaded, bodies and reference trees load only on invoke, and
  reference-tree tokens dwarf SKILL.md tokens — so a high-lift SKILL.md change on a
  rarely-invoked skill is low value. This is why the highest-value action is the
  `python-fake-driven-testing` reference-tree merge rather than any single rewrite, and
  why `python-fake-driven-test-layout` (lift 4, low reach) is kept only as the method
  pilot. Not yet validated against outcomes — it is a ranking heuristic, not a measured
  result.

Risks:

- The grill pair's self-contained-fallback constraint blocks a runtime pointer, so
  single-sourcing needs a build/install-time mechanism that may not exist yet. De-risk
  the mechanism before committing to an approach; the fallback is the reason the copies
  exist. (Resolved: no build/install-time mechanism was needed. The shared core turned
  out to be only 3 short paragraphs, so the chosen mechanism is reconcile-in-place with
  no drift guard — both files stay self-contained. Accepted residual risk: re-drift can
  recur silently since there is no guard; deemed acceptable given the tiny surface.)
- Editing descriptions (systemic #1) is the highest-risk surface: it changes whether and
  how skills auto-trigger and whether other skills can reach them. A wrong call degrades
  routing silently. (Partially materialized and mechanically caught: an initial
  mis-classification of eight backed skills as `invoke-only` was flagged immediately by
  `areg check` and corrected to `command-backed`. `areg check` enforcement substantially
  de-risks silent routing regressions.)
- Edits must respect the symlink layout; editing a `.claude/skills/` or
  `.agents/skills/` symlinked path instead of the real `skills/` source would be a
  no-op or worse.
- A from-scratch rewrite is the **highest behavior-drift** remediation method available:
  unlike a verbatim move, it can silently drop a stop-condition, soften a safety rule,
  reorder steps, or shift a trigger — and skills are prose contracts with no test suite
  to catch it. Mitigation (load-bearing, not optional): **extract-contract-then-diff** —
  before rewriting, enumerate the skill's behavioral contract (trigger conditions,
  ordered steps, stop/ask conditions, output shapes, safety rules, CLI invocations);
  after rewriting, diff the new `SKILL.md` against that contract line-by-line, then run
  `areg check` and verify every disclosed-reference pointer resolves. A rewrite that
  cannot be shown to preserve the contract does not ship. (**Gate exercised once on
  `objective-stack-impl`:** the contract-diff confirmed every item present, `areg check`
  "All skills OK", pointer resolves — no drift detected. The gate has not yet had to
  *catch* a drop, so its catch-power is still unproven; passing once is not the same as
  having rejected a bad rewrite.)
- For safety-critical and rigid-output-contract skills, a from-scratch rewrite is
  unacceptably likely to silently soften a stop-condition or safety rule even with the
  gate, so these take the **surgical** path, never from-scratch (re-audit
  `2026-06-20T140000`): `code-gt-restack-resolve`, `code-resolve-merge-conflicts`, and
  `objective-close`. `branch-context-impl` is the limiting case — disclosing its sole
  block (a 6-trigger STOP safety contract) is net-negative, so it is dropped entirely.

## Open Questions

- Systemic #1 — **resolved.** The per-skill kind assignment was classified, signed off,
  and applied: objective-family → `normal`; `setup-*` → `invoke-only`; eight
  verified-replacement skills → `command-backed`. The classification axis is "has a
  verified Pi replacement?", and `areg check` enforces the wiring. See update
  `2026-06-19T202008`.
- For the grill pair — **resolved.** Mechanism chosen: **reconcile-only, no drift
  guard.** Neither candidate (install-time generation, or a copy guarded by a drift
  lint) was warranted: the true shared core is only 3 short paragraphs, so the copies
  were reconciled in place and both files kept self-contained. The "~95% byte-identical"
  framing was corrected — `pi-grill-with-docs-ui` is a superset, not a twin. See
  roadmap Systemic #2 and update `2026-06-19T210500`.
- `python-fake-driven-testing` reference tree — **resolved: merge.** The re-audit
  (update `2026-06-20T140000`) found this the highest-value single action in the whole
  Objective: merge `references/quick-reference.md` + `workflows.md` (~200 lines off a
  6.4K-line tree that loads on most Python tasks). It is a separate workstream from any
  SKILL.md rewrite. `dignified-python`'s 4.5K tree does *not* need consolidation (its
  version files are independent) — only its SKILL.md router (stated 3×) needs collapsing.
