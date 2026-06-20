# Roadmap

## Work

- [x] Systemic #1 — set the correct areg invocation kind for the `Command: X`
      stub-description skills (NOT a binary `disable-model-invocation` flip). Invocation
      is governed by areg's four kinds (`normal` / `ambient-only` / `invoke-only` /
      `command-backed`), applied via `areg skill apply <kind> <skills>` and enforced by
      `areg check`. Done across two slices: the objective-family five set to `normal`
      (real trigger descriptions written, update `2026-06-19T180857`); the `setup-*`
      family set to `invoke-only` (no verified Pi replacement); and eight skills with
      verified Pi replacements (`sdl-submit`, `code-checkpoint`, `code-just-fix`,
      `code-workflows`, `changelog-update`, `create-bun-typescript-project`,
      `create-python-dev-cli`, `create-python-package`) set to `command-backed` (model
      invocation disabled + `.pi/settings.json -skills` exclusion, slash-command surfaces
      preserved). Correction: `command-backed` is NOT unexemplified — the real
      classification axis is "has a verified Pi replacement?" (membership in
      `COMMAND_STYLE_LOCAL_SKILLS` + the `real-gateways.ts` allowlist, which auto-generates
      a backing command), and a skill with one cannot be `invoke-only`; the `setup-*`
      removal only de-verified that family. Evidence: `areg check` "All skills OK";
      descriptions left as minimal `Command: <name>` stubs (update `2026-06-19T202008`).
      Residual body-content work for `sdl-submit` / `objective-close` / `objective-create`
      is tracked under the from-scratch-rewrite row, not here. Taxonomy in
      `docs/skill-conventions.md` § Skill Invocation Kinds.
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
      "All skills OK"; both files remain self-contained; shared field enumeration now
      byte-identical across both. Done on branch `grill-core-reconcile`.
- [x] Systemic #3 — single-home the branch-creation precedence policy in
      `branch-context/references/lifecycle.md`; reduce `branch-context-from-plan` to the
      load-bearing repo default (`--branch-creation graphite`) plus a pointer.
      Done: `branch-context-from-plan/SKILL.md` Workflow steps 3–4 collapsed to one step
      holding the inline repo default plus a pointer to the single home; `lifecycle.md`
      unchanged (already the canonical superset). Correction: the policy was duplicated
      **2×** (two full copies), not triplicated — only `from-plan` and `lifecycle.md`
      carried the full precedence list. Evidence: precedence list now resolves only in
      `lifecycle.md`; `from-plan` still names `--branch-creation graphite` inline and its
      pointer target (`## Branch creation policy`) is reachable; SKILL.md frontmatter
      valid and steps contiguous.
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
  **Value-adjusted sequence** (after the `python-fake-driven-test-layout` method pilot):
  `handoff-create` (cheap high-value win) → the `python-fake-driven-testing`
  reference-tree merge (highest value; its own row below) → the objective family
  (`objective-refresh`, `objective-update`, `objective-create`; high reach, accept risk 3
  once the gate has 2–3 passes) → ccc / niche skills last, only if cheap.
  **`branch-context-impl` dropped off** (was the tentative "next"): 36 lines, lift 1 /
  risk 4 — its only disclosable block is a 6-trigger STOP safety contract, so disclosing
  it is net-negative and a rewrite most likely softens the contract. Leave as-is.
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
  - `enriched-plan-save` — rewrite; step-1 conditional sub-blocks to disclose.
  - `dignified-python` — rewrite; triplicated router → one trigger-keyed routing
    section. Only the SKILL.md router collapses; the 4.5K version-file tree is left as-is
    (version files are independent — re-audit `2026-06-20T140000`).
  - `python-fake-driven-testing` — rewrite the SKILL.md (overlapping reference pointers).
    The Open Question on the reference tree is **resolved: merge** — tracked separately as
    its own row below, the highest-value action in the Objective.
  - `refactor-swarm` — rewrite; recap section + redundant examples.
  - `ccc-available-work`, `ccc-stack-map` — rewrite; twice-listed command recipes. Lift
    5 / 4 but cmux-niche (low reach) → sequenced last among rewrites.
  - `objective-refresh`, `objective-update` — rewrite; invariants stated 3–4×. High reach;
    take after the gate has 2–3 passes.
  - `handoff-create` — rewrite; verbatim 25-line artifact template (lift 4 / risk 1).
    Cheap high-value win → first rewrite after the pilot.
  - `python-fake-driven-test-layout` — rewrite; tree drawn 3×. Lift 4 but low reach
    (rarely-consulted scaffolding); kept ONLY as the safe, mechanical **method pilot**.
  - `code-thermostack` — rewrite; subagent-contract triplication.
  - `code-gt-restack-resolve` — **surgical, NOT from-scratch** (rigid output contract +
    conflict-resolution stakes): remove the externally-gated TEMPORARY TS-toolchain block
    (see Parked), then a surgical pass on the twice-written TS-toolchain rule.
  - `pr-address` — **prune-to-stub** (retired-workflow tombstone), not a rewrite.
  - `sdl-submit` — **move-to-reference**: relocate the env-var catalog to a reference file.
  - `objective-close` — **surgical** (already clean, lift 1).
  - `objective-create` — rewrite; body work beyond its (already-set) description.
  - New elevation candidates (clarity/sprawl, not duplication — re-audit
    `2026-06-20T140000`): `brmem` (296 ln, high blast radius — rewrite), `objective`
    (126 ln — rewrite), `code-resolve-merge-conflicts` (safety-critical → **surgical**).
    `ccc-branch-triage` and `handoff-pickup` stay parked.
    Evidence: per-target contract diff shows no behavioral change; no verbatim-
    duplicated contract remains among these skills.
- [ ] **`python-fake-driven-testing` reference-tree merge** — the highest-value single
      action in the Objective (re-audit `2026-06-20T140000`): merge
      `references/quick-reference.md` + `workflows.md` (~200 lines off a 6.4K-line tree
      that loads on most Python tasks). A separate workstream from any SKILL.md rewrite.
      Resolves the standing Open Question (YES, merge).

## Parked

- [ ] Polish tier (audit scores 1–3, ~22 skills): single collapsible repetitions and
      synonym-trigger descriptions. Cite-and-collapse opportunistically when already
      editing the skill; not a standalone push.
- [ ] Remove the `code-gt-restack-resolve` TEMPORARY TS-toolchain keep/reformat block
      once the TS toolchain rollout lands. Self-labeled for deletion; gated by that
      rollout, not by this Objective.
