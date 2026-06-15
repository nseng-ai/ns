# Thermo-Nuclear Review: `areg` CLI (skill-kind work, `441e1c4fb`..HEAD)

**Verdict: Request changes.** The behavior looks correct and the result-typing discipline is good, but this PR builds a *second, parallel skill-inspection stack* (gateway + domain rules + parsers + validation strings) right next to the `check` stack that already existed — instead of reusing it. The single biggest improvement available is a code-judo move that deletes a whole inspection pipeline rather than polishing it. There are also clear decomposition and dedup wins.

---

## Blocker 1 — Two parallel project-inspection gateways doing the same filesystem work

`check` already had `AregCheckProjectInspectionGateway`. This PR adds `AregSkillKindProjectInspectionGateway` whose *read* surface is almost a strict subset of the check one:

- `genericReplacement` is **byte-for-byte identical** in both implementations — `real-gateways.ts:273-275` vs `372-374` (same two `inspectTextFile` calls for `backing-skill-commands.ts`). Change that path once and you must edit it in two gateways (plus both fakes).
- Per-skill inspection is the same data: check's `AregCheckSkillInspection` has `skillsPath` / `localSkillMd` / `openaiPolicy`; skill-kind's `AregSkillKindSkillInspection` has `skillDir` / `skillMd` / `openaiPolicy` — the same three `lstat`/read calls (`real-gateways.ts:511-522` re-walks what `inspectProjectForCheck` already walks).
- `piSettings` text-state is fetched by both.

The only thing skill-kind genuinely adds over the check inspection is `piDir` path-state and the mutating `resolveLocalSkillSpec`/`applySkillKindPlan` methods.

> this PR stands up a whole second inspection gateway when the existing `check` inspection already returns the same per-skill `openaiPolicy`/SKILL.md, the same `piSettings`, and the *identical* `genericReplacement`. That's not composability — it's drift risk in four files at once.

**Remedy:** Factor one shared "skill-artifact inspection" primitive (per-skill dir/md/openai + `.pi` state + `genericReplacement`) that both `check` and `skill` consume, or have the skill-kind gateway depend on the check inspection result and add only the `.pi` dir state + mutation methods. Either deletes a pipeline instead of duplicating it.

## Blocker 2 — The invocation-convention rules are implemented twice

The domain rules for `disable-model-invocation` ↔ `agents/openai.yaml` ↔ Pi-exclusion ↔ verified-replacement exist in two independent forms:

- `check.ts:204-224` (`checkInvokeOnly`) emits these as **issues**.
- `skill-kind.ts:590-633` (`inferKind` + `buildNotes`) re-derives the exact same triggers as **kind + notes** ("disable-model-invocation is present but agents/openai.yaml is missing" at `skill-kind.ts:624` == `invoke_only_missing_openai_policy` at `check.ts:212`).

These are the same invariant, stated twice in different vocabularies. The `SkillInvocationKind` model (`normal`/`invoke-only`/`command-backed`/`ambient-only`) introduced here is the natural canonical model of these conventions — `check` should be expressed as "deviation from a target kind," not as a parallel hand-rolled rule set.

> the new `kind` model *is* the right abstraction for these conventions. But `check` wasn't refactored onto it, so we now maintain the same rules in two places that will silently diverge.

**Remedy:** Make the classifier (artifact-facts → kind + consistency notes) the single source of truth and have `checkInvokeOnly` consume it, mapping notes → issue codes.

## Blocker 3 — Pi-settings parsing and canonical-source validation duplicated verbatim

- **Pi settings:** `parsePiExclusions` (`check.ts:274-287`) and `parsePiSettings` (`skill-kind.ts:441-456`) share three identical error strings ("Invalid JSON in .pi/settings.json…", "must contain a JSON object", "field 'skills' must be an array of strings"). skill-kind's variant only additionally returns `text`/`data` for write-back. Extract one parser returning the full shape; check ignores the extra fields.
- **Symlink/canonical-source messages** appear in *three* runtime spots — `real-gateways.ts:287,290`, `skill-kind.ts:434,436`, `check.ts:150` (plus the fake). Worse, `resolveLocalSkillSpec` already validates skillDir/skillMd symlink state (`real-gateways.ts:287-291`), then `skill-kind.ts:433-439` (`validateInspectableSkill`) re-validates the same thing from the inspection — double validation with copy-pasted strings.

**Remedy:** One `parsePiSkillExclusions` helper and one shared validator/message source. Decide whether symlink validation lives in the gateway or the operation layer — not both.

---

## Secondary

**`skill-kind.ts` is a 709-line file holding six concerns.** Schemas + exported types + CLI wiring + handlers + human rendering + pure inference + pure planning + low-level frontmatter string-munging are all in one module. It's under 1k so not a hard size blocker, but it's a brand-new file establishing the pattern for this subsystem, and it's the right moment to split: `skill-kind/inference.ts` (facts→kind/status/notes, pure), `skill-kind/plan.ts` (the `plan*Operation` builders, pure), `skill-kind/render.ts`, and a thin `group.ts` with handlers. The pure cores are very testable in isolation.

**`runSkillKindApply` does N+1 inspections and a redundant first one** (`skill-kind.ts:248-258`). `firstResolved` is computed only to extract `projectDir`, then immediately thrown away and re-inspected inside the loop's first iteration. The per-skill re-inspection exists because applying skill A mutates the shared `.pi/settings.json` that skill B's plan reads — but that also means the first inspection is pure waste, and the whole flow is sequential + non-atomic (skill 3 of 5 failing leaves 1–2 written). At minimum drop the redundant `firstResolved` and reuse the loop's inspection. Better: compute against an evolving in-memory `.pi` state so the shared file is read/written once, which also makes the multi-skill update atomic for the `.pi` mutation.

## Minor (high-confidence, low-cost)

- **`parsePiSettings(piDir: { type: string }, …)`** (`skill-kind.ts:441`) — loosely-typed inline shape instead of `AregSkillKindPathState`. Tighten the boundary; the function only branches on `"symlink"`.
- **`type FrontmatterInspection = SkillFrontmatterData`** (`skill-kind.ts:65`) — identity alias, pure indirection. Use `SkillFrontmatterData` directly.
- **Two frontmatter implementations.** Reading uses `parseSkillFrontmatterBlock` (`frontmatter.ts`, split on `/\r?\n/`); writing uses `transformSkillFrontmatter` + `splitLinesKeepEndings` + its own `isTopLevelKey` (`skill-kind.ts:503-544`). Two separate notions of "frontmatter boundary" and "top-level key." Writing legitimately needs to preserve line endings, but the delimiter-finding (`---` open/close, locate `name:`) could share one primitive.
- **`emptyShowResult` fabricates a semantically-loaded record** (`skill-kind.ts:685-705`: `kind: "inconsistent"`, `label: "replacement-missing"`) purely to satisfy the `negative(message, payload)` contract. A JSON consumer reading the error payload sees a plausible-looking but fictional classification. Consider a clearly-empty/null skill payload shape for error results so failures aren't mistaken for real "inconsistent" findings.
- **Pass-through re-exports** in `check.ts:51,123` (`parseLockfileData`, `derivePiReplacementCommand`) and the local `verifyPiReplacement` wrapper (`check.ts:289-291`) — if these only exist for tests, import from the canonical module in the tests instead of laundering them through `check.ts`.

---

## What's genuinely good (keep)

- `pi-replacement.ts` is the right extraction — the replacement logic *is* shared between `check` and `skill` through one module. That's the model to apply to Blockers 1–3.
- Discriminated-union results everywhere, no `any`/casts, `LBYL` path-state handling, and the write/delete/remove-dir target validation (`real-gateways.ts:698-831`) is careful and reuses `resolveAllowedProjectTarget`/`validateTextWriteTarget` across init and skill-kind — exactly the consolidation the rest of the PR should follow.

**Bottom line:** the feature works and the seams are clean, but it ships a duplicate inspection gateway, a duplicate rule engine, and duplicate parsers/validators alongside `check`. Collapse those onto shared primitives (the `kind` classifier + one artifact inspection + one Pi-settings parser) and split the 709-line file along its pure/IO/render seams. That removes moving pieces rather than rearranging them.
