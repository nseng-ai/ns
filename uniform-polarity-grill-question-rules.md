# Uniform-polarity rule for all grill question surfaces

## Goal / outcome

Eliminate the mixed-polarity compound question construction ("Recommended answer: no … Do you agree?") from every grilling / grill-esque interview surface in this repo. After this change, every surface that instructs an agent to ask grill-style questions carries an explicit **uniform-polarity rule**: a plain "yes" must always endorse the recommended answer; a recommendation *against* something must be restated as a positive assertion of the recommended behavior (or replaced with behavior-named options), never as a "no"-recommendation followed by "Do you agree?".

Motivating failure (observed in a real `/ns:plan:grill-and-save` session): a question asked "should traversal choose first-parent?" with recommended answer "no", then appended "Do you agree?" — the two sub-questions have opposite polarity, so a bare yes/no reply is ambiguous. The fix bans the construction at its root (polarity mismatch), not the literal words "Do you agree?", so lexical evasions like "Sound right?" are equally covered.

User-approved scope: **recorded fork of the vendored `grilling` skill plus all six ns-owned surfaces** (seven surfaces total, confirmed during grilling).

## Context and discovered facts

### Architecture: vendored vs melded grill surfaces

- `.agents/skills/grilling/SKILL.md` is **vendored third-party** content from `mattpocock/skills` (pin and provenance live in `docs/agents/matt-pocock-skills.md`). Vendored dirs must stay byte-identical to upstream **except** repo-owned Harness Overlays and **recorded forks** — "the smallest possible edit (ideally one line), recorded in the instance doc with its rationale, and re-applied after every refresh" (`docs/conventions/upstream-skill-melding.md`, "Minimal forks"). Precedent: `wayfinder/SKILL.md` carries a recorded one-line fork.
- `.claude/skills/grilling` is a symlink to `../../.agents/skills/grilling` — editing the `.agents` copy covers both.
- `skills-lock.json` records a `computedHash` for the vendored `grilling` entry. Recorded forks are an accepted divergence class; the update procedure byte-diffs vendored dirs against upstream and expects "only recorded forks and overlays may differ". **Do not touch `skills-lock.json`** in this change.
- The ns-owned grill behavior lives in **melded surfaces** registered in `docs/agents/matt-pocock-skills.md` ("Melded surfaces registry"). All surfaces edited here are already registered (or are ns-native prompts); **no new registry rows are needed**. The registry's sync action for `GRILL_UI_CONTRACT` requires pinning new behaviors in `ts/packages/internal/hosts/pi/tools/pi-tools/test/grill/grill-ui.test.ts`.
- **Sibling-sync contract**: `skills/internal/pi-host/pi-grill-ui/SKILL.md` and `skills/internal/pi-host/pi-grill-with-docs-ui/SKILL.md` declare (in their lineage blocks) that shared paragraphs — including the interview charter and `grill_ask` protocol paragraphs — must be updated in both files together, with `GRILL_UI_CONTRACT` kept aligned.
- Existing guardrails ("Avoid double negatives and ambiguous option labels", "Prefer affirmative, mutually exclusive options") govern **option labels only**; nothing governs question-stem polarity or the trailing agreement tag. That is the gap being closed.

### The seventh surface

`ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/src/enriched-plan-save.ts` builds the `/ns:plan:grill-and-save` kickoff prompt and carries its own question-contract bullet list (around line 100–106), including: `- Each question must include 2–5 affirmative, mutually exclusive options and a recommendation with concise rationale.` This is the surface that produced the observed failure. Its test files (`test/enriched-plan-commands.test.ts`, `test/surfaces.test.ts` etc.) did **not** match a grep for `affirmative|mutually exclusive`, so prompt-text pins for this bullet list may not exist yet — check before adding a pin, and follow the local test style.

### Repo state / gates

- Current branch at planning time was `master`. **Hard gate: never commit on master.** Create a feature branch first with Graphite (`gt create`), per repo doctrine (`skills/internal/code/code-graphite/SKILL.md` if the skill inventory lacks `code-graphite`).
- `just` is the repo validation entrypoint; if it reports a `dprint check` failure, run `just dprint-fix` and re-run.
- Read `ts/AGENTS.md` before editing `.ts` files.
- No `CONTEXT.md` / glossary updates are required: this change introduces procedural prompt rules, not new domain vocabulary.
- No Harness Overlay / frontmatter changes: `ns skill-exposure` is **not** needed (body-only edits).

## Canonical rule text

Reference wording (adapt per surface as specified below; keep the concept identical):

> Frame every question so a plain "yes" endorses your recommended answer. Never pose a question whose recommended answer is "no" and then ask "Do you agree?" — the opposite polarity makes any bare yes/no reply ambiguous. When you recommend against something, restate the recommendation as a positive assertion of the behavior you do recommend, or replace yes/no with options named after the behaviors.

## Files, symbols, tests, docs

| # | Surface | File | Change |
|---|---------|------|--------|
| 1 | Vendored `grilling` (recorded fork) | `.agents/skills/grilling/SKILL.md` | Add one sentence (minimal fork) |
| 2 | Fork record | `docs/agents/matt-pocock-skills.md` | New bullet under "Recorded forks"; optional deferred follow-up note |
| 3 | Pi grill backend | `skills/internal/pi-host/pi-grill-ui/SKILL.md` | Add shared sentence to interview charter paragraph |
| 4 | Pi grill-with-docs backend | `skills/internal/pi-host/pi-grill-with-docs-ui/SKILL.md` | Same sentence, same paragraph (sibling sync — identical wording) |
| 5 | Structured-UI contract | `ts/packages/internal/hosts/pi/tools/pi-tools/src/grill/prompts.ts` (`GRILL_UI_CONTRACT`) | New bullet |
| 6 | Contract test pin | `ts/packages/internal/hosts/pi/tools/pi-tools/test/grill/grill-ui.test.ts` | New `toContain` assertions in the "grill-ui prompt" and "grill-with-docs-ui prompt" describes |
| 7 | RDD grill step | `skills/internal/agent-engineering/readme-driven-development/SKILL.md` | Clause in Loop step 2 |
| 8 | Objective interview | `skills/incubating/objectives/objective-create/SKILL.md` | Clause in the "Ask one unresolved question at a time" bullet |
| 9 | Plan grill prompt | `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/src/enriched-plan-save.ts` | New bullet in the structured grilling contract list; add prompt-text test pin if that package pins prompt text |

## Implementation steps

### 0. Branch

From trunk, create a feature branch with `gt create` (never commit on `master`).

### 1. Recorded fork — `.agents/skills/grilling/SKILL.md`

Current body paragraph ends: `…resolving dependencies between decisions one-by-one. For each question, provide your recommended answer.`

Append one sentence immediately after "For each question, provide your recommended answer.":

> Frame each question so a plain "yes" endorses your recommended answer; when recommending against something, restate it as a positive assertion of the behavior you do recommend, never as a question whose recommended answer is "no" followed by "Do you agree?".

Keep it to this single sentence (minimal-fork rule). Do not touch frontmatter, `agents/` overlays, or `skills-lock.json`.

### 2. Record the fork — `docs/agents/matt-pocock-skills.md`

Under **Recorded forks**, add a bullet in the established style, e.g.:

> - `grilling/SKILL.md`: one sentence — the uniform-polarity rule (a plain "yes" must endorse the recommended answer; no "no"-recommendation followed by "Do you agree?"). Prevents mixed-polarity compound questions in the portable prose loop. Re-apply after every refresh.

Optionally add to **Deferred follow-ups**: propose the uniform-polarity sentence upstream to `mattpocock/skills`; the fork dissolves if accepted. (Filing the upstream PR is explicitly out of scope for this change.)

### 3 & 4. Sibling backends — `pi-grill-ui` and `pi-grill-with-docs-ui`

Both files contain the shared interview charter paragraph beginning `Interview the user relentlessly about every aspect of this plan or design…` with the sentence `Ask exactly one user-facing question at a time, and include your recommended answer.` In **both** files, extend that spot with an identical shared sentence:

> Frame every question with uniform polarity: a plain "yes" must endorse your recommended answer — never a question whose recommended answer is "no" followed by "Do you agree?"; when recommending against something, restate the recommendation as a positive assertion of the behavior you do recommend.

The two files' shared paragraphs must remain word-for-word identical for this sentence (sync-sibling contract stated in each file's lineage block).

### 5. `GRILL_UI_CONTRACT` — `ts/.../pi-tools/src/grill/prompts.ts`

In the bulleted contract, insert a new bullet adjacent to `- Avoid double negatives and ambiguous option labels.` / `- Prefer affirmative, mutually exclusive options.`:

> - Frame questions and recommended answers with uniform polarity: a plain "yes" must always mean "adopt the recommendation." Never pair a question whose recommended answer is "no" with a trailing "Do you agree?". When recommending against something, state the recommendation as a positive assertion of the recommended behavior.

Note the constant is a template literal; plain double quotes inside are fine (existing bullets already contain quoted strings).

### 6. Pin the contract — `ts/.../pi-tools/test/grill/grill-ui.test.ts`

In `describe("grill-ui prompt")` → test "includes the expanded grill UI skill block when provided" (around line 817), add an assertion mirroring the existing style, e.g.:

```ts
expect(prompt).toContain(
	"Frame questions and recommended answers with uniform polarity",
);
```

Add the same assertion to `describe("grill-with-docs-ui prompt")` (the contract is shared via `buildStructuredGrillPrompt`).

### 7. `readme-driven-development/SKILL.md` — Loop step 2

Current: `2. **Grill.** Interview the user about every unsettled design decision the README exposes — one question at a time, with a recommended answer — until the README is coherent…`

Change the em-dash clause to:

`— one question at a time, with a recommended answer framed so a plain "yes" endorses it (never a "no" recommendation followed by "Do you agree?") —`

### 8. `objective-create/SKILL.md` — Interview bullet

Current bullet: `- Ask one unresolved question at a time, including your recommended answer so the user can confirm or correct it, as a compact numbered menu with domain-specific labels — never an open-ended continuation prompt. …`

Insert a clause after "so the user can confirm or correct it":

`…including your recommended answer so the user can confirm or correct it — framed so choosing it is an affirmative selection, never a "no" recommendation followed by "Do you agree?" — as a compact numbered menu with domain-specific labels…`

(This surface is already mostly immune via numbered menus; the clause covers the confirm/correct phrasing.)

### 9. `/ns:plan:grill-and-save` prompt — `enriched-plan-save.ts`

In the structured grilling contract bullet list (around line 102), directly after:

`- Each question must include 2–5 affirmative, mutually exclusive options and a recommendation with concise rationale.`

add:

`- Frame each question and recommendation with uniform polarity: agreeing with the recommendation must be an affirmative answer — never a question whose recommended answer is "no" followed by "Do you agree?".`

Then inspect `ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/test/` (start with `enriched-plan-commands.test.ts`) for existing prompt-text assertions. If the package pins kickoff-prompt text, add a `toContain("uniform polarity")` pin in the matching test; if it does not pin prompt text at all, do not invent a new test style — leave it unpinned and note it in the final report.

### 10. Consistency sweep

Run a final stale-construction check across the touched surfaces:

```bash
rg -n --max-columns 300 --max-columns-preview 'Do you agree' \
  skills/ .agents/skills/grilling/ docs/agents/matt-pocock-skills.md \
  ts/packages/internal/hosts/pi/tools/pi-tools/src/grill/ \
  ts/packages/incubating/hosts/pi/extensions/pi-ns-branch-context/src/ | head -n 50
```

Remaining hits must only be *mentions of the banned construction* (rule text, fork record), never instructions to use it. Also verify the two backend skills' new sentence is byte-identical:

```bash
rg -n 'uniform polarity' skills/internal/pi-host/pi-grill-ui/SKILL.md skills/internal/pi-host/pi-grill-with-docs-ui/SKILL.md
```

## Execution strategy

Per `skills/incubating/branch-context/enriched-plan-save/references/refactor-execution-strategy.md`: although this touches ~9 files, these are **not** same-shape mechanical edits — each surface receives a hand-tailored sentence with cross-surface consistency constraints (sibling-sync identical wording, contract↔test alignment, fork↔record pairing). **Chosen strategy: a single agent making precise per-file edits in one session**, not `refactor-swarm` and not codemod tooling. The consistency requirements are exactly what one agent holding full context handles better than parallel workers. The stale-terminology grep in step 10 is the required final check.

## Validation guidance

- Targeted first: from `ts/`, run the pi-tools grill tests (`pnpm vitest run packages/internal/hosts/pi/tools/pi-tools/test/grill/`, adjust to the invocation style in `ts/AGENTS.md`) and the pi-ns-branch-context tests if a pin was added there.
- `grill-ui-parity.test.ts` checks command-surface metadata parity, not prompt text — it should be unaffected; investigate if it fails.
- Then full `just`. If `dprint check` fails on edited Markdown, run `just dprint-fix` and re-run.
- Do **not** run `ns skill-exposure` (no overlay/frontmatter changes) and do not regenerate `skills-lock.json`.

## Risks, assumptions, open questions

- **Lock-hash drift (accepted)**: the fork makes `.agents/skills/grilling/SKILL.md` diverge from the `computedHash` recorded in `skills-lock.json`. Convention treats recorded forks as an expected divergence class handled at refresh time (byte-diff step tolerates "recorded forks and overlays"); leave the lock untouched. If any validation surface unexpectedly flags the hash, stop and report rather than regenerating the lock ad hoc.
- **Upstream refresh regression**: the fork will be overwritten by the next `npx skills add` refresh; the "Recorded forks" bullet (step 2) is the standing instruction to re-apply it. This is the same lifecycle as the existing `wayfinder` fork.
- **Assumption**: filing an upstream PR to `mattpocock/skills` is out of scope; recorded only as an optional deferred follow-up in the instance doc.
- **Assumption**: the `grill-me` / `grill-with-docs` vendored wrappers stay untouched (intentionally tiny; behavior lives in `grilling` and the Pi backends).
- **Open question (minor)**: whether pi-ns-branch-context tests pin kickoff-prompt text (step 9). Resolve by inspection during implementation; both outcomes are acceptable.

## Review / remediation

- Verify the seven-surface checklist: vendored fork + fork record + two sibling backends (identical sentence) + `GRILL_UI_CONTRACT` + test pin(s) + RDD step 2 + objective-create bullet + enriched-plan-save bullet.
- Verify the vendored diff is exactly one sentence (`git diff .agents/skills/grilling/SKILL.md` shows a single-line/-sentence addition; nothing else under `.agents/skills/`).
- Verify `docs/agents/matt-pocock-skills.md` gained the fork bullet (and optional deferred follow-up) and **no** new melded-surfaces registry rows.
- Verify no changes to `skills-lock.json`, `.claude/`, or any `agents/openai.yaml` overlay.
- If review finds the rule wording drifting between the sibling backends or between contract and test pin, fix toward the wording specified in this plan.
