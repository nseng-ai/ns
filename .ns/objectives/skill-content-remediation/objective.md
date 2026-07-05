# Skill Content Remediation

## Thesis

A 2026-06 writing-great-skills audit of the then-56 first-party skills under `skills/`
found systematic content debt. The dominant failure mode is **duplication** — a contract
(a command sequence, a directory tree, an output template, a safety rule) restated
verbatim or near-verbatim in two to four places, usually via a trailing `Anti-patterns` /
`command recipe` / `Workflow` / `Verify` section that reprints rules already stated
above. The secondary mode is **oversized always-loaded blocks**: large reference material
sitting inline in `SKILL.md` that only one branch reaches and should be disclosed behind
a pointer. (The tree has since grown to 70 first-party skill directories; post-audit
additions are outside the audit's scope.)

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
Risks). Systemic #1/#2/#3 are complete.

**Post-audit ground shift (rebaselined 2026-07-03):** ADR 0016
(`docs/adr/0016-skill-invocation-context-budget.md`, landed 2026-06-26 via commits
`df5d4e355`/`9cc5b1773`) re-architected skill invocation repo-wide: most explicit
workflow skills — including many remaining queue targets — are now `command-backed`
(zero ambient context), so the re-audit's reach rankings, which assumed ambient
descriptions and model-routed bodies for those targets, no longer matched ground
truth. The queue was re-ranked on re-derived reach the same day (update
`20260703T194738Z`; see Open Questions) — `brmem` and `objective`, the only remaining
ambient targets, now lead.

## Scope

- **Three systemic findings (all resolved):**
  1. `Command: X` stub descriptions — set the correct areg invocation *kind* per skill.
     (Reframed: invocation is governed by areg's five kinds — `normal` / `ambient-only` /
     `invoke-only` / `command-backed` / `unlisted` — applied via `areg skill apply` and enforced by
     `areg check`, not a hand-edited `disable-model-invocation` flag. The `Command: X` +
     commented-description frontmatter was the *rendered output* of an explicit-only
     kind, so a skill that is kind `normal` but shows that stub is misconfigured —
     "listed but unroutable.") Affected `sdl-flow-submit` (renamed from `sdl-submit`),
     `objective-close`, `objective-create`, `code-workflows`, `changelog-update`,
     `sdl-flow-cp` (renamed from `code-checkpoint`, commit `6d51a05b1`), `code-just-fix`,
     and the `setup-*` / `create-*` family (`sdl-flow-autobranch`, renamed from
     `code-autobranch`, already carried a real `normal` description at the time).
     **Resolution as applied (2026-06-19/20):** objective-family → `normal` (real trigger
     descriptions written); `setup-*` → `invoke-only`; eight verified-replacement skills
     → `command-backed`. **Since superseded in its specifics** by the ADR 0016 repo-wide
     re-architecture: most explicit workflows (including most of the objective family,
     the grill pair, and `skill-audit-improved`) are now `command-backed`, and the
     `setup-*` / `create-*` family was moved further to `unlisted` (the fifth kind,
     landed 2026-07-04 via PRs #2867/#2869 — commits `44612a600`/`695ea59bd`), which
     also removes both mirror symlinks so the skill is hidden from every harness
     typeahead; the eight leaves now sit behind a single ambient `project-setup` router
     skill (kind `normal`, `skills/project-setup/SKILL.md`). Ambient routers/standards
     (`objective`, `brmem`, `pr-address`, `project-setup`) remain `normal`;
     `COMMAND_STYLE_LOCAL_SKILLS` (`ts/packages/hosts/pi/src/commands/surfaces.ts`) now
     spans ~60 skills, and verified-replacement enforcement lives in areg itself (`areg
     skill apply command-backed` succeeds only when the replacement Pi extension
     verifies) — the earlier "`real-gateways.ts` allowlist" framing no longer matches the
     code. The systemic deliverable itself — no listed-but-unroutable stub; kinds
     registry-managed and enforced — **holds**: `areg check` reports "All skills OK"
     (verified 2026-07-05). The real descriptions written for the objective family
     survived the kind changes, and the `setup-*` / `create-*` leaves had real
     descriptions restored on the `unlisted` conversion; residual `Command: <name>`
     stubs (e.g. `ns-flow-submit`) sit only on explicit-only `command-backed` skills
     where the description is not ambient, and `docs/conventions/skill-conventions.md`
     § Skill Invocation Kinds now documents the stub as a legacy artifact (current `areg
     skill apply` does not rewrite descriptions).
  2. The grill pair (`pi-grill-ui`, `pi-grill-with-docs-ui`) duplicated a shared core
     that had already drifted — single-source it. (Resolved via reconcile-in-place; the
     "~95% byte-identical" framing was corrected — the truly shared core is 3 short
     paragraphs and `pi-grill-with-docs-ui` is a superset, not a twin. Still holding as
     of 2026-07-03.)
  3. Branch-creation precedence policy was duplicated across
     `branch-context-from-plan/SKILL.md` and `branch-context/references/lifecycle.md`,
     and already drifting — single-home it. (Resolved: implementation confirmed the
     policy had **2** full copies, not the "triplicated" 3 originally recorded. Still
     holding as of 2026-07-03: the precedence list resolves only in `lifecycle.md`.)
- **Per-skill remediation of the high-value targets**, with the technique chosen by the
  (lift × risk) quadrant and the order set by value (reach), not raw lift (re-audit
  `2026-06-20T140000`; reach values now need re-derivation post-ADR-0016): from-scratch
  rewrite against `writing-great-skills` for high-lift/low-risk targets (behavior
  preserved; duplication collapse and disclosure fall out of the rewrite); **surgical**
  for safety-critical / rigid-output-contract skills; prune-to-stub or move-to-reference
  for the rest. Top targets: `objective-stack-impl`, `dignified-python`,
  `refactor-swarm`, `ccc-available-work`, `enriched-plan-save`,
  `python-fake-driven-testing`, `objective-refresh`, `objective-update`,
  `code-gt-restack-resolve`, `python-fake-driven-test-layout`, `handoff-create`,
  `ccc-stack-map`, `code-thermostack`, plus the clarity/sprawl elevation candidates
  `brmem`, `objective`, and `code-resolve-merge-conflicts`. Two targets have dropped
  off: `branch-context-impl` (lift 1 / risk 4; its only disclosable block is a 6-trigger
  STOP safety contract — leave as-is) and `pr-address` (superseded: the 2026-06-28
  Address Capability migration reworked it into a live primitive-surface skill; the
  "retired-workflow tombstone" it was slated to become no longer describes it).
- **Source of truth:** edit the real files under `skills/` only. The
  `skills/` → `.agents/skills/` → `.claude/skills/` symlink chain means every edit
  lands in one place; never edit a symlinked copy.

## Non-Goals

- Not the polish tier (audit scores 1–3, ~22 skills). Those carry one collapsible
  repetition or a synonym-trigger description each; fix opportunistically when already
  in the file, not as tracked work.
- Not editing vendored third-party skills under `.agents/skills/` real directories
  (e.g. `writing-great-skills`, `skill-creator`, `grilling`, `grill-me`,
  `grill-with-docs`, `improve-codebase-architecture`, `codebase-design`,
  `domain-modeling`, `fdt-refactor-mock-to-fake`, `graphite`, `opentui`,
  `thermo-nuclear-code-quality-review`, `ts-morph-analyze`) — these are upstream code.
  (Membership shifts over time: `improve` and `ts-morph-refactor` have since been
  removed from the vendored set.)
- Not the `skill-management-subsystem` Objective's install/list/path/catalog tooling.
  This Objective is about skill *content*, that one is about the management *subsystem*.
- No new production/remediation target skills and no change to what any existing skill
  *does* — content and structure remediation only. Any `skill-audit-improved` support
  artifact must be explicitly reconciled as a support-skill exception (registered cleanly
  or removed/parked as inert comparison material) before it counts as Objective progress.

## Completion Criteria

The Objective can close when:

- All three systemic findings are resolved: the description-invocation policy is
  decided and applied across the stub-description skills; the grill core is
  single-sourced with the drifted wording reconciled; the branch-creation policy lives
  in exactly one home.
- Every first-party skill scoring ≥5 in the 2026-06 audit is either remediated or
  explicitly deferred/dropped with a recorded reason. (The audit universe is that
  snapshot; post-audit skills are out of scope.)
- No verbatim-duplicated contract and no already-drifting paired copy remains among the
  ≥5 skills.
- Evidence: each edited skill still loads (frontmatter valid, references resolvable),
  and disclosed reference files are reachable via their in-skill pointers.

## Assumptions and Risks

Assumptions:

- The audit's impact scoring is roughly correct and `≥5` is the right cut line for
  bespoke per-skill surgery. (Could be disproven if a parked score-3 skill turns out to
  cost more than estimated once touched.)
- The `Command: X` stub was a deliberate token-saving convention, not a bug, so systemic
  #1 was a per-skill policy *decision*, not a blanket description revert. (Refined
  twice: first, the stub is the rendered output of an areg explicit-only invocation
  kind, managed by `areg skill apply`; then the taxonomy doc reframed the stub itself as
  a legacy artifact — current `areg skill apply` does not rewrite descriptions, and
  explicit-only skills may keep real descriptions since they are not ambient.)
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
  (**Exercised, holding:** the first rewrite — `objective-stack-impl` — cut SKILL.md
  217→136 lines with the contract preserved; the gate then passed on `handoff-create`,
  `objective-refresh`, and `objective-update` as well.)
- Remediation value is **value = lift × reach × stakes − risk**, not lift alone
  (re-audit `2026-06-20T140000`). Reach = invocation frequency and always-loaded-ness;
  descriptions are always loaded only for ambient (`normal`) skills, bodies and
  reference trees load only on invoke, and reference-tree tokens dwarf SKILL.md tokens.
  **Weakened 2026-07-03, then restored the same day (update `20260703T194738Z`):**
  the recorded reach values predated ADR 0016; the reach re-derivation over the
  remaining targets confirmed only `brmem` and `objective` are still ambient
  (`normal`) — every other queue target is `command-backed` with zero ambient cost.
  The ranking heuristic stands and the queue order now reflects re-derived inputs.

Risks:

- The grill pair's self-contained-fallback constraint blocked a runtime pointer, so
  single-sourcing needed a build/install-time mechanism that might not exist. (Resolved:
  no mechanism was needed — the true shared core is only 3 short paragraphs, reconciled
  in place with both files self-contained. Accepted residual risk: re-drift can recur
  silently since there is no guard; deemed acceptable given the tiny surface. Spot-check
  2026-07-03: shared blocks still consistent.)
- Editing descriptions (systemic #1) was the highest-risk surface: it changes whether
  and how skills auto-trigger. (Partially materialized and mechanically caught: an
  initial mis-classification of eight backed skills as `invoke-only` was flagged
  immediately by `areg check` and corrected. This surface has since been absorbed by the
  ADR 0016 repo-wide policy; `areg check` enforcement continues to de-risk silent
  routing regressions.)
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
  cannot be shown to preserve the contract does not ship. (The gate has passed on four
  rewrites; it has not yet had to *catch* a drop, so its catch-power is still unproven —
  passing is not the same as having rejected a bad rewrite.)
- For safety-critical and rigid-output-contract skills, a from-scratch rewrite is
  unacceptably likely to silently soften a stop-condition or safety rule even with the
  gate, so these take the **surgical** path, never from-scratch (re-audit
  `2026-06-20T140000`): `code-gt-restack-resolve`, `code-resolve-merge-conflicts`, and
  `objective-close`. `branch-context-impl` is the limiting case — disclosing its sole
  block (a 6-trigger STOP safety contract) is net-negative, so it is dropped entirely.
- The `skill-audit-improved` support-skill branch surfaced a boundary/invocation risk:
  adding a new first-party skill while documenting it as the audit entry point
  contradicts the original "no new skills" boundary unless it is deliberately treated as
  a support exception. **Resolved as a support-skill exception:** the skill is registered
  in `skills-lock.json`, installed through the symlink chain, and its body no longer
  calls itself an inert comparison artifact (update `2026-06-20T174032`). Its kind was
  applied as `invoke-only` then; the ADR 0016 re-architecture has since moved it to
  `command-backed`. Evidence re-verified 2026-07-03: lock entry present,
  `agents/openai.yaml` present, `areg check` "All skills OK".
- Unrelated repo work keeps touching the target skills — the `sdl`→`ns` cutover, the
  SDL Flow skill renames, the Record Frontmatter documentation, the ADR 0016 kind
  sweeps, the Address migration, the refactor-guidance extraction — so recorded line
  counts and per-target debt snapshots go stale quickly. Re-verify a target's current
  content and debt at pickup time; recorded counts (e.g. `objective-refresh` 182,
  `objective-update` 160, `brmem` 296, `objective` 126) are historical, not current.

## Open Questions

- Systemic #1 — **resolved** (2026-06-19/20), with its specific kind assignments later
  superseded by the ADR 0016 repo-wide re-architecture; see Scope. The durable
  deliverable (kinds registry-managed via `areg skill apply`, enforced by `areg check`,
  no listed-but-unroutable stubs) holds. See update `2026-06-19T202008`.
- For the grill pair — **resolved.** Mechanism chosen: **reconcile-only, no drift
  guard.** Neither candidate (install-time generation, or a copy guarded by a drift
  lint) was warranted: the true shared core is only 3 short paragraphs, so the copies
  were reconciled in place and both files kept self-contained. See roadmap Systemic #2
  and update `2026-06-19T210500`.
- `python-fake-driven-testing` reference tree — **resolved: merge** (done, holding).
  The re-audit (update `2026-06-20T140000`) called this the highest-value single action
  in the Objective on the strength of its reach ("loads on most Python tasks"); that
  reach rationale is now weaker post-ADR-0016 (the skill is `command-backed`, so the
  tree loads only on explicit invoke), but the merge itself stands either way.
  `dignified-python`'s 4.5K tree does *not* need consolidation (its version files are
  independent) — only its SKILL.md router (stated 3×) needs collapsing.
- Remaining-queue re-rank — **resolved (2026-07-03, update `20260703T194738Z`).**
  Reach was re-derived per target from current invocation kinds and file sizes, and
  per-target debt was re-verified. The old order did not hold: only `brmem` and
  `objective` remain ambient, so they lead the queue; confirmed-duplication rewrites
  (`dignified-python`, `code-thermostack`, `refactor-swarm`, `objective-create`)
  follow; surgical targets next; ccc/niche last. Four targets dropped/deferred with
  recorded reasons: `python-fake-driven-testing` SKILL.md and `ns-flow-submit`
  (mooted), `python-fake-driven-test-layout` (pilot rationale spent → polish tier),
  `enriched-plan-save` (block owned by the plan-verification workstream).
