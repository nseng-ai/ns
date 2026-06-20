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
      is tracked under the duplication-collapse row, not here. Taxonomy in
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
- [~] Disclosure surgery on oversized always-loaded blocks. Push inline material that
      only one branch reaches behind pointers: `objective-stack-impl` digest/telemetry
      and final-response templates; `branch-context-impl` STOP-contract protocol;
      `enriched-plan-save` step-1 conditional sub-blocks; `dignified-python` triplicated
      router → one trigger-keyed routing section; `python-fake-driven-testing` overlapping
      reference pointers sharpened.
      Evidence: each disclosed reference reachable via its pointer; SKILL.md still loads.
      Progress: `objective-stack-impl` done — the digest-telemetry and final-response
      template sections moved verbatim into `references/final-response.md`, replaced by a
      `## Final response` pointer whose wording names the concrete trigger (hit a stop
      condition, about to write the final response); SKILL.md 282→217 lines; behavior
      unchanged; `areg check` OK; dprint clean. Remaining: `branch-context-impl`,
      `enriched-plan-save`, `dignified-python`, `python-fake-driven-testing`.
- [ ] Duplication collapse across the high-duplication ≥5 skills. Pick one home per
      restated contract and delete the recap: `refactor-swarm` (recap section + redundant
      examples), `ccc-available-work` and `ccc-stack-map` (twice-listed command recipes),
      `objective-refresh` and `objective-update` (invariants stated 3–4×), `handoff-create`
      (verbatim artifact template), `python-fake-driven-test-layout` (tree drawn 3×),
      `code-thermostack` (subagent-contract triplication), `code-gt-restack-resolve`
      (TS-toolchain rule written twice), `pr-address` (retired-workflow tombstone), plus
      the body work in `sdl-submit` / `objective-close` / `objective-create` beyond their
      descriptions.
      Evidence: no verbatim-duplicated contract remains among these skills.

## Parked

- [ ] Polish tier (audit scores 1–3, ~22 skills): single collapsible repetitions and
      synonym-trigger descriptions. Cite-and-collapse opportunistically when already
      editing the skill; not a standalone push.
- [ ] Remove the `code-gt-restack-resolve` TEMPORARY TS-toolchain keep/reformat block
      once the TS toolchain rollout lands. Self-labeled for deletion; gated by that
      rollout, not by this Objective.
