# Handoff: Matt Pocock skills v1.2 refresh — remaining tail

Continuation focus: Work the "v1.2 refresh remainder" items recorded in `docs/agents/matt-pocock-skills.md`: grill melding (gated on trialing the new round-by-round grilling), wayfinder refresh + LM sync, the post-refresh semantic sweep, wizard/to-questionnaire import decisions, and the skill-audit vocabulary re-audit.

## Context

Branch `upgrade-skills` (parent: `master`) carries a deliberately partial refresh of the vendored `mattpocock/skills` set from pin `d574778` (v1.1.0) to `8b36d4f` (v1.2.2). The refresh followed `docs/conventions/upstream-skill-melding.md` plus the instance doc `docs/agents/matt-pocock-skills.md`. All work so far is committed and submitted as PR #4129 (https://github.com/nseng-ai/ns/pull/4129); `just` passes.

## Current State

Done and in PR #4129:

- Refreshed 13 of 14 vendored Matt skills to v1.2.2 via targeted `npx skills add mattpocock/skills --skill <name> --agent codex claude-code -y` (never the broad update).
- `writing-great-skills` → `writing-for-agents` breaking rename completed: vendored dir/lock/symlinks swapped, `skill-audit` runtime pointer updated (GLOSSARY.md merged into SKILL.md upstream; new SKILL-MECHANICS.md), `docs/conventions/skill-conventions.md` refs updated, `ts/packages/incubating/extensions/skill-exposure/src/replacement-registry.ts` row now `writing-for-agents` / `writing:for-agents`; policy kept `skill-backed-command`.
- Imported new `wait-what` skill, invoke-only.
- All recorded forks re-applied: `pocock-review`/`pocock-resolving-merge-conflicts` name lines, `domain-modeling` + `improve-codebase-architecture` code-first-glossary forks, and the `grilling` uniform-polarity sentence re-expressed inside upstream's new round-by-round "Work the tree in **rounds**" paragraph.
- Exposure overlays re-derived via `ns skill-exposure apply`; `.pi/settings.json` net change is exactly the rename (`-skills/writing-great-skills` → `-skills/writing-for-agents`). `improve-codebase-architecture` was verified/restored as `skill-backed-command` (it has a registry row `improve:codebase-architecture`).
- Instance doc updated: pin bumped to `8b36d4f` with an explicit partial-refresh exception, registry-walk status (domain-modeling rows and the code-smell-baseline row verified no-op), imported/renamed entries, and a "v1.2 refresh remainder" list under Deferred follow-ups.

Not done (the remainder, itemized in Next Steps): grill melding, wayfinder (still v1.1.0 content — deliberately untouched), semantic sweep, wizard/to-questionnaire decisions, skill-audit re-audit, and a docs fix for the destructive `npx skills check`.

## Decisions / Findings

- **`npx skills check` (skills@1.5.21) is destructive**: it broad-updates every GitHub-sourced skill (including deferred `wayfinder` and non-Matt skills like `fdt-refactor-mock-to-fake`/`thermo-nuclear-code-quality-review`, deleting their exposure sidecars) and creates a `.pi/skills/` layout. It was run once, fully reverted, and replaced with targeted adds. `docs/conventions/upstream-skill-melding.md` step 7 and the `skill-management` skill still recommend/allowlist `npx skills check` — fix those docs before the next refresh.
- Upstream now ships `agents/openai.yaml` beside every skill (Codex `interface.*` metadata). ns `skill-exposure` refuses foreign sidecars; for explicit-policy skills the upstream file is removed and re-derived (dropping `interface.*`), recorded in the instance doc's Layout section. Normal-policy skills keep upstream sidecars as-shipped.
- Grilling upstream rework: one-question-at-a-time → round-by-round **frontier** with a fixed `❓ **Q1**` / `➡️` format. This conflicts with Pi's `grill_ask` one-question-per-tool-call contract — the central design decision for the melding step.
- The lockfile was reformatted from single-line JSON to pretty-printed by the new CLI (content-equal apart from intended hash/key changes); `.pi/settings.json` was reformatted tabs→spaces by `ns skill-exposure` consolidation and then oxfmt.
- Upstream dropped the standalone **predictability** definition and the **negative space** failure mode; ns retains both (noted inline in `skill-audit` and the instance doc).
- User intends to trial the new `/grilling` (and `/wait-what`) before any melding lands.

## Next Steps

1. **Gated on the grilling trial** — grill melding: semantic-merge the frontier/rounds model into `skills/internal/pi-host/pi-grill-ui/SKILL.md`, `skills/internal/pi-host/pi-grill-with-docs-ui/SKILL.md`, and `GRILL_UI_CONTRACT` in `ts/packages/internal/hosts/pi/tools/pi-tools/src/grill/prompts.ts`, pinning new behaviors in `ts/packages/internal/hosts/pi/tools/pi-tools/test/grill/grill-ui.test.ts`. Design decision: adopt rounds as batched sequential `grill_ask` calls or record a deliberate divergence. Also review the `readme-driven-development` Grill step (registry sync action "review on upstream grilling change").
2. **Wayfinder**: refresh vendored `wayfinder` (targeted add), re-derive the recorded tracker-line fork against upstream's rewritten sentence (upstream now says "The issue tracker should have been provided to you — run /setup-matt-pocock-skills if not"; ns points at `docs/agents/issue-tracker.md` "Wayfinding operations"), then run the LM sync per `docs/agents/wayfinder-objective-adaptation.md` classifying: the **decision ticket** term, `/research`-subagent burn-down of research tickets (exception to one-ticket-per-session), and the tracker-doc rewrite.
3. **Semantic sweep**: one read-only explorer scout per changed skill (`grilling`, `prototype`, `tdd`, `code-review`, `improve-codebase-architecture`, `writing-for-agents`) over first-party skills and host prompts for unattributed embeddings; verified hits get lineage blocks + registry rows, near-misses dismissed in writing in the instance doc.
4. **Import/reject decisions**: `wizard` (interactive bash wizard for human-only steps, model-invoked upstream) and `to-questionnaire` (grill the send, not the subject); record either way in the instance doc's import/rejection tables.
5. **skill-audit re-audit**: decide whether ns keeps, re-homes, or drops the retained **predictability** framing and **negative space** failure mode now absent upstream.
6. **Docs fix**: correct `docs/conventions/upstream-skill-melding.md` (step 7) and `skills/internal/skill-system/skill-management/SKILL.md` (allowed-tools + validation guidance) so nothing recommends the now-destructive `npx skills check`.

Each of 2–6 can land as a small follow-up branch stacked on `upgrade-skills` (Graphite; `gt create`). Update the instance doc's "v1.2 refresh remainder" checklist as items complete.

## Investigation Sources

- Source session ID: 019fd484-14c5-7894-a12a-96415bd3f794
- Source session log: /Users/schrockn/.pi/agent/sessions/--Users-schrockn-code-nseng-ai-ns--/2026-08-06T00-40-53-701Z_019fd484-14c5-7894-a12a-96415bd3f794.jsonl
- Related files:
  - `docs/agents/matt-pocock-skills.md` — instance doc: pin, partial-refresh exception, registry-walk status, and the authoritative "v1.2 refresh remainder" list.
  - `docs/conventions/upstream-skill-melding.md` — generic refresh/melding procedure; step 7 needs the `npx skills check` fix.
  - `docs/agents/wayfinder-objective-adaptation.md` — the LM-sync procedure for the wayfinder step.
  - `ts/packages/internal/hosts/pi/tools/pi-tools/src/grill/prompts.ts` — `GRILL_UI_CONTRACT`, the code side of the grill meld.
  - `ts/packages/internal/hosts/pi/tools/pi-tools/test/grill/grill-ui.test.ts` — where new grill behaviors get pinned.
  - `.agents/skills/grilling/SKILL.md` — refreshed round-by-round upstream text with the re-applied uniform-polarity fork (the meld source).
  - `.agents/skills/wayfinder/SKILL.md` — still v1.1.0 content; diff against `skills/engineering/wayfinder/` in a local clone of `mattpocock/skills` at `8b36d4f` (e.g. /Users/schrockn/code/mattpocock/skills).
  - `ts/packages/incubating/extensions/skill-exposure/src/replacement-registry.ts` — skill-backed command registry touched by the rename.

## Useful Commands / Files

- PR: https://github.com/nseng-ai/ns/pull/4129 (branch `upgrade-skills`, commit `6598327d0`).
- Targeted refresh: `npx skills add mattpocock/skills --skill <name> --agent codex claude-code -y` — never `npx skills check` / broad update.
- Exposure: `ns skill-exposure show|apply|check <explicit path>`; upstream sidecars must be deleted before `apply` on explicit-policy skills.
- Byte-diff validation: `diff -rq .agents/skills/<name> <upstream-clone>/skills/<bucket>/<name>` — only recorded forks + overlay files may differ.
- Validation: `just` (use `just ts-format-fix` for oxfmt failures).
