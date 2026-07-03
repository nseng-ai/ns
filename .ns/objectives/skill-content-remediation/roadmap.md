# Roadmap

## Work

- [x] Systemic #1 — set the correct areg invocation kind for the `Command: X`
      stub-description skills (NOT a binary `disable-model-invocation` flip). Invocation
      is governed by areg's four kinds (`normal` / `ambient-only` / `invoke-only` /
      `command-backed`), applied via `areg skill apply <kind> <skills>` and enforced by
      `areg check`. Done across two slices: the objective-family five set to `normal`
      (real trigger descriptions written, update `2026-06-19T180857`); the `setup-*`
      family set to `invoke-only` (no verified Pi replacement at the time); and eight
      skills with verified Pi replacements (`sdl-flow-submit`, `sdl-flow-cp` — then named
      `code-checkpoint`, renamed by commit `6d51a05b1` — `code-just-fix`,
      `code-workflows`, `changelog-update`, `create-bun-typescript-project`,
      `create-python-dev-cli`, `create-python-package`) set to `command-backed`.
      Evidence at the time: `areg check` "All skills OK" (update `2026-06-19T202008`).
      Taxonomy in `docs/conventions/skill-conventions.md` § Skill Invocation Kinds.
      **Superseded in its specifics (rebaselined 2026-07-03):** ADR 0016
      (`docs/adr/0016-skill-invocation-context-budget.md`, commits
      `df5d4e355`/`9cc5b1773`, 2026-06-26) re-architected invocation repo-wide — most
      explicit workflows including `setup-*`, most of the objective family, the grill
      pair, and `skill-audit-improved` are now `command-backed`; ambient
      routers/standards (`objective`, `brmem`, `pr-address`) remain `normal`;
      `COMMAND_STYLE_LOCAL_SKILLS` now spans ~60 skills and verified-replacement
      enforcement lives in areg itself. The systemic deliverable (no
      listed-but-unroutable stub; kinds registry-managed and enforced) still holds:
      `areg check` "All skills OK" re-verified 2026-07-03, and the objective-family
      descriptions written for this row survived the kind changes. Residual body-content
      work for `sdl-flow-submit` / `objective-close` / `objective-create` is tracked
      under the per-skill remediation row, not here.
- [x] Systemic #2 — single-source the grill-loop core shared by `pi-grill-ui` and
      `pi-grill-with-docs-ui`. Reconcile the already-drifted `status_request` wording;
      leave each skill holding only its UI-specific delta.
      Mechanism decided: **reconcile-only, no drift guard** — neither a runtime pointer
      (barred by the self-contained-fallback constraint) nor an install-time generation
      step (heavyweight for the actual surface). Correction: the "~95% byte-identical
      core" framing was generous — `pi-grill-with-docs-ui` is a *superset* of
      `pi-grill-ui`, and the truly byte-identical shared blocks are only **3 short
      paragraphs** (the `grill_ask` usage para, the `ui_unavailable` fallback para, and
      the validation-scope para), all already consistent. Actual drift fixed:
      `status_request` opener wording (`that`→`it`) realigned; the shared interview
      opener realigned (`this plan or design`); and the normal grill status-field
      enumeration inlined into `pi-grill-with-docs-ui`'s status-checkpoint section, which
      had referenced "the normal grill status fields" without listing them — a
      self-containment hole in the docs-aware fallback. Each skill now holds only its
      UI-specific delta (`pi-grill-with-docs-ui` keeps the `Documentation updates:` line
      and the docs-first/during-session/checkpoint sections). Evidence: `areg check`
      "All skills OK"; both files remain self-contained. Done on branch
      `grill-core-reconcile`. Spot-check 2026-07-03: shared paragraphs still consistent
      across both files (both skills now `command-backed` under ADR 0016).
- [x] Systemic #3 — single-home the branch-creation precedence policy in
      `branch-context/references/lifecycle.md`; reduce `branch-context-from-plan` to the
      load-bearing repo default (`--branch-creation graphite`) plus a pointer.
      Done: `branch-context-from-plan/SKILL.md` Workflow steps 3–4 collapsed to one step
      holding the inline repo default plus a pointer to the single home; `lifecycle.md`
      unchanged (already the canonical superset). Correction: the policy was duplicated
      **2×** (two full copies), not triplicated — only `from-plan` and `lifecycle.md`
      carried the full precedence list. Re-verified 2026-07-03: the precedence list
      resolves only in `lifecycle.md` (`## Branch creation policy`); `from-plan` still
      names `--branch-creation graphite` inline and points at that section.
- [~] Per-skill remediation, technique chosen by the (lift × risk) quadrant and ordered
  by value (reach), not raw lift. **Method decided 2026-06-20; re-audited 2026-06-20**
  (update `2026-06-20T140000`). From-scratch rewrite against `writing-great-skills`
  (behavior preserved; duplication collapse and oversized-block disclosure fall out as
  byproducts) is the technique for the high-lift/low-risk quadrant; safety-critical /
  rigid-output-contract skills take the **surgical** path; others take prune-to-stub or
  move-to-reference. Per-target gate for any rewrite: extract the behavioral contract
  (triggers, ordered steps, stop/ask conditions, output shapes, safety rules, CLI calls),
  rewrite, then diff the new `SKILL.md` against that contract line-by-line; `areg check`
  "All skills OK"; every disclosed pointer resolves. Edit the real `skills/` source only
  (never a symlinked copy).
  **Queue re-ranked 2026-07-03 (post-ADR-0016 reach re-derivation; update
  `20260703T194738Z`).** Kinds, line counts, and per-target debt re-verified against
  ground truth. Only `brmem` and `objective` remain ambient (`normal`); all other
  targets are `command-backed`. New order: (1) `brmem`, (2) `objective`,
  (3) `dignified-python`, (4) `code-thermostack`, (5) `refactor-swarm`,
  (6) `objective-create`, (7) `code-gt-restack-resolve` (surgical),
  (8) `code-resolve-merge-conflicts` (surgical), (9) `objective-close` (surgical),
  (10) `ccc-available-work` / `ccc-stack-map` (only if cheap). Naming caution: the
  active `rename-ji-to-ns` objective is churning skill directory names — re-resolve
  each target's current directory at pickup, and prefer landing content edits after
  the rename stabilizes.
  **Dropped targets:** `branch-context-impl` (36 lines, lift 1 / risk 4 — its only
  disclosable block is a 6-trigger STOP safety contract, so disclosing it is
  net-negative and a rewrite most likely softens the contract; leave as-is);
  `pr-address` (see its row below); `python-fake-driven-testing` SKILL.md rewrite and
  `sdl-flow-submit`/`ji-flow-submit` move-to-reference (both mooted — see their rows);
  `python-fake-driven-test-layout` (pilot rationale spent — see its row); and
  `enriched-plan-save` (deferred to the plan-verification workstream — see its row).
  Targets and their known debt / technique:
  - `objective-stack-impl` — **DONE (rewrite method, the retro-rewrite decided yes).**
    First disclosed under the prior surgical method (282→217); then re-remediated as a
    from-scratch rewrite against `writing-great-skills`, behavior preserved via
    extract-contract-then-diff (every contract item verified present; description kept
    verbatim so routing is unchanged). Clarity wins: leading words
    `parent`/`slice`/`verify-independently`, the 4× "no hidden state" restatement
    collapsed to one boundary, status interpretation co-located under Execute. SKILL.md
    217→136; `references/final-response.md` unchanged, pointer resolves. Evidence:
    `areg check` "All skills OK"; `just dprint-check` clean. See update
    `2026-06-20T133000`.
  - `enriched-plan-save` — **DEFERRED (re-rank `20260703T194738Z`).** The audit-era
    debt was reshaped by the refactor-guidance extraction (commit `52d85e9d5`; now
    100 lines), and the remaining step-1 candidate block is fenced by
    `PLAN-VERIFICATION-WORKSTREAM` markers owned by that workstream — editing it here
    would cross workstream boundaries. Revisit only if that workstream closes with the
    block still duplicative.
  - `dignified-python` — **DONE (router rewrite, 2026-07-03).** 170 → 130 lines; four
    router statements (catalog, when-to-read, conditional-loading, how-to-use recap)
    merged into one trigger-keyed Reference Routing section; frontmatter `references`
    byte-identical; all 13 reference files keep exactly one at-least-as-strong routing
    entry; version-file tree untouched. Residual (recorded, deliberate): invocation
    triggers still tri-stated across description/When-to-Use/vs-Others. See update
    `20260703T203228Z`.
  - `python-fake-driven-testing` — SKILL.md rewrite **DROPPED as mooted (re-rank
    `20260703T194738Z`)**: the overlapping-pointer debt no longer exists — routing is
    consolidated into a single `## Reference Routing` section (111 lines).
    The reference-tree merge is **DONE** separately: `quick-reference.md` was folded into
    `workflows.md`, and `SKILL.md` now routes feature/bug/quick-lookup work to the single
    file. See update `2026-06-20T181500`. Now `command-backed` (reach reduced).
  - `refactor-swarm` — **DONE (rewrite, 2026-07-03).** 173 → 138 lines; "Key design
    decisions" folded into binding sites; judgment-light boundary example kept, redundant
    mechanical example dropped with its load-bearing facts relocated; applicability
    conditions front-loaded for planning-time readers. 35-item contract diff passed. See
    update `20260703T203512Z`.
  - `ccc-available-work`, `ccc-stack-map` — rewrite; twice-listed command recipes. Lift
    5 / 4 but cmux-niche (low reach) → sequenced last among rewrites.
  - `objective-refresh` — **DONE (rewrite).** SKILL.md 205→182 lines at the time;
    frontmatter preserved after audit; repeated no-closure, immutable-update,
    slug-directory, baseline-prefix, final-report, and verify rules collapsed into
    co-located sections. Evidence: contract-diff checks retained required routing,
    command, safety, action-label, and provenance anchors; validation passed
    (`git diff --check`, `areg check`, `just dprint-check`). See update
    `2026-06-20T113402`. Note (2026-07-03): the skill has since been rewritten again
    outside this Objective (commit `5668ac563`, "Clarify objective-refresh as a
    non-committing rebaseline workflow"; now 98 lines) — the recorded counts are
    historical rewrite evidence, not current state.
  - `objective-update` — **DONE (rewrite).** SKILL.md 192→160 lines at the time;
    frontmatter preserved; no reference file added; no sibling Objective skills edited.
    Repeated selection, slug-identity, immutable-update, evidence, Closure Gate,
    stop/ask, and verify invariants collapsed into co-located sections. Evidence:
    extract-contract-then-diff preserved required behavior (independent contract review
    found one consolidation-routing softening, fixed before closeout); validation passed
    (`git diff --check`, `areg check`, `just dprint-check`). See update
    `2026-06-20T192000-objective-update-rewritten`. Note (2026-07-03): since grown to
    183 lines by the Record Frontmatter / objective-edge documentation work (commit
    `2fa3e2e1c`) — historical counts.
  - `handoff-create` — **DONE (rewrite).** SKILL.md 173→131 lines at the time; the
    duplicated artifact template / storage here-doc collapsed to one canonical artifact
    shape and one canonical `brmem put` command; frontmatter and invocation kind stayed
    unchanged after audit; contract diff preserved the direction-first ask, branch/slug
    rules, collision handling, storage command, success copy, and pickup/admin
    boundaries. Evidence: `git diff --check`, `areg check`, and `just dprint-check`
    passed; see update `2026-06-20T181649`. (Now 123 lines after later unrelated edits;
    kind now `command-backed` under ADR 0016.)
  - `python-fake-driven-test-layout` — **PARKED to the polish tier (re-rank
    `20260703T194738Z`)**: it was kept only as the safe mechanical method pilot, and
    the rewrite gate has since passed on four targets, so the pilot rationale is
    spent; the tree is now drawn once as a full block and residual repetition is
    prose-level, with low reach (rarely-consulted scaffolding, `command-backed`).
  - `code-thermostack` — **DONE (rewrite, 2026-07-03).** Subagent contract
    single-homed in a `## Subagent contract` section with a verbatim-carry rule; §2/§5
    route to it. The gate caught real drift between the three prior sites (Graphite-only
    vs any-means commit ban, write vs touch durable stores, inspect-duty single-sited)
    and took the union. 73-item contract diff passed. See update `20260703T203334Z`.
  - `code-gt-restack-resolve` — **DONE (surgical, 2026-07-03; method cap honored).**
    325 → 314 lines: the twice-written TS-toolchain rule single-homed in the Agent
    prompt template (the operative copy subagents receive) with the section deferring
    to it; the §5 restated engine check table replaced by a pointer to the engine's
    step 4. No output contract or safety rule reworded. The TEMPORARY block itself
    stays (externally gated — see Parked). See update `20260703T203715Z`.
  - `pr-address` — **DROPPED (superseded, 2026-07-03).** The planned prune-to-stub
    assumed a retired-workflow tombstone, but the 2026-06-28 Address Capability
    migration (commits `6712d2ad9`, `a54b2d89d`) reworked the skill into a live
    66-line primitive-surface document (`ji address exec` download/read/mutation
    primitives, kind `normal`, with a compact retired-workflow warning section). No
    remediation work remains here.
  - `ji-flow-submit` (renamed from `sdl-flow-submit`, earlier `sdl-submit`) —
    move-to-reference **DROPPED as mooted (re-rank `20260703T194738Z`)**: the env-var
    catalog has shrunk to ~8 inline lines across the Workflow prose of a 76-line
    SKILL.md; a reference split would add indirection without saving load.
  - `objective-close` — **surgical** (already clean, lift 1).
  - `objective-create` — **DONE (rewrite, 2026-07-03).** 124 → 85 lines; archive-root
    check, planning-only default, and validation bullets each collapsed to one home;
    Conditional-references section dissolved into firing sites; edge-mutation mechanics
    single-homed under Record Frontmatter with step pointer; Required shape kept
    self-contained per the family rule. 63-item contract diff passed; stop-option text
    and `not_found` envelope verbatim. See update `20260703T203606Z`.
  - Elevation candidates (clarity/sprawl, not duplication — re-audit
    `2026-06-20T140000`): `brmem` — **DONE (rewrite, 2026-07-03).** 334 → 270 lines;
    frontmatter/description byte-identical (`normal` routing unchanged);
    extract-contract-then-diff passed on a 75-item contract; Command-chooser/per-command
    triple-homing collapsed (chooser = pure routing table, shared rules in one
    Cross-command section, gc semantics 4 sites → 1). `areg check` OK. See update
    `20260703T202952Z`. `objective` — **DONE (rewrite, 2026-07-03).** 164 → 156 lines;
    frontmatter/description identical (`normal` routing unchanged); 113-item contract
    diff passed; family routing / picker rules / Tracking Gate kept near-verbatim;
    step-skill-referenced headings preserved. See update `20260703T203132Z`.
    `code-resolve-merge-conflicts` — **DONE (surgical, 2026-07-03; method cap
    honored).** Line-by-line pass found the engine largely clean (debt was assumed,
    not verified); one real duplication collapsed — the escalation payload trio was
    enumerated in both channel subsections, now defined once with the driver channel
    adding its three extra fields; no safety rule, safe category, or gate reworded.
    See update `20260703T203832Z`. `ccc-branch-triage` and
    `handoff-pickup` stay parked.
    Evidence bar for the row: per-target contract diff shows no behavioral change; no
    verbatim-duplicated contract remains among these skills.
- [x] **`python-fake-driven-testing` reference-tree merge** — completed by folding
      `references/quick-reference.md` into `references/workflows.md` and updating
      `SKILL.md` routing so feature, bug, and quick-placement/command lookup all load the
      single merged reference. Net reference-tree reduction: 477-line file deleted, 111
      lines added to `workflows.md`, `SKILL.md` unchanged except the pointer.
      Re-verified 2026-07-03: no `quick-reference` pointers remain under
      `skills/python-fake-driven-testing`; `workflows.md` present. See update
      `2026-06-20T181500`.
- [x] Resolve the `skill-audit-improved` support-skill status before counting it as
      Objective progress. Decided and applied as a deliberate explicit-only support-skill
      exception: `skills-lock.json` has a repo-relative local entry;
      `.agents/skills/skill-audit-improved` and `.claude/skills/skill-audit-improved`
      are installed through the canonical symlink chain; `areg skill apply invoke-only
      skill-audit-improved` generated `skills/skill-audit-improved/agents/openai.yaml`;
      and the skill body no longer says it is an inert comparison artifact. See update
      `2026-06-20T174032`. Note (2026-07-03): the ADR 0016 re-architecture has since
      moved its kind from `invoke-only` to `command-backed`; the exception resolution
      stands. Re-verified: lock entry present, `agents/openai.yaml` present, `areg
      check` "All skills OK".

## Parked

- [ ] Polish tier (audit scores 1–3, ~22 skills): single collapsible repetitions and
      synonym-trigger descriptions. Cite-and-collapse opportunistically when already
      editing the skill; not a standalone push.
- [ ] Remove the `code-gt-restack-resolve` TEMPORARY TS-toolchain keep/reformat block
      once the TS toolchain rollout lands. Self-labeled for deletion; gated by that
      rollout, not by this Objective. (Block verified still present 2026-07-03.)
