# Structured Grill UI Deepening

## Thesis

The structured grill question UI stack adds a useful `grill_ask` interaction primitive to the Project-local Pi extension surface while keeping the durable implementation in the Engineered Pi extension package. The current stack is valuable, but the architecture review found several places where policy, presentation, Pi runtime translation, terminal text handling, and test-only helper surfaces could become more local and more leveraged.

This Objective tracks deepening that stack without changing the core `grill-me` behavior: the model should still ask one question at a time, recommend an answer, offer explicit choices, allow freeform input, and let the user end the grilling session. The work is complete when each candidate from the stack review has a recorded disposition and accepted refactors have appropriate tests.

## Scope

In scope:

- The structured grill question UI stack in `.agents/skills/grill-me/SKILL.md`, `.pi/extensions/grill-ui.ts`, and `ts/packages/pi-extensions/src/grill-ui*`.
- The `grill_ask` tool contract, including schema, prompt guidance, validation errors, result text, and fallback behavior.
- The inline custom UI and legacy `select` / `editor` presentation paths for asking a normalized grill question.
- The Pi/TUI runtime Adapter used by the inline UI: dynamic imports, editor construction, key matching, Markdown rendering, theme translation, and width utilities.
- Shared Terminal presentation concerns when grill rendering duplicates generic terminal escape, width, wrapping, or truncation behavior.
- The test surface for the grill UI modules when tests expose internal Implementation vocabulary as though it were the public Interface.

Starting candidates from the architecture review:

1. Centralize the structured grill contract as one deeper Module.
2. Make the question presentation Seam explicit, with inline and legacy presentation as sibling Adapters.
3. Deepen the Pi runtime Adapter so Pi/TUI drift is localized.
4. Move generic terminal text handling out of grill layout and into the shared Terminal presentation layer where the deletion test holds.
5. Reduce test-only helper exports so production Modules keep a smaller effective Interface.

Each candidate must be resolved somehow: implemented, rejected with reason, parked with rationale, or split into a follow-on Objective.

## Non-Goals

- Do not redesign Pi core, Pi custom UI, or the Pi TUI component model.
- Do not change `grill-me` from a grilling workflow into a generic questionnaire workflow.
- Do not broaden this Objective into all Project-local Pi extension architecture; the closed `pi-extension-deepening` Objective remains historical context, not active scope.
- Do not promote `.pi/extensions/grill-ui.ts` beyond a thin Discovery adapter unless Pi discovery requirements change.
- Do not create broad generic runtime, renderer, or test-fake Modules merely to reduce duplicated lines; use the deletion test and require real leverage.
- Do not add hidden Objective state, registries, frontmatter, or branch attachment semantics.

## Completion Criteria

This Objective can close when all of the following are true:

- All five starting candidates have a recorded disposition: implemented, rejected with reason, parked with rationale, or split into a follow-on Objective.
- Accepted TypeScript refactors have tests at the right Interface: focused unit tests for pure Modules and behavior-level tests for user-visible tool/presentation behavior.
- Relevant validation passes, at minimum `bun run --cwd ts check` and `bun run --cwd ts test` after TypeScript changes.
- If the user/model contract changes, the skill guidance, tool metadata, validation behavior, and result behavior stay consistent.
- Objective updates record meaningful decisions, de-risking evidence, rejected candidates, or implementation outcomes as they happen.
- A human explicitly agrees that the structured grill UI deepening outcome has been reached.

## Assumptions and Risks

Assumptions:

- `structured-grill-ui-deepening` is the right durable identity because this work is narrower than prior closed Pi extension deepening Objectives.
- The current stack's core behavior is worth preserving; the goal is better depth, locality, leverage, and testability rather than different product behavior.
- Inline custom UI and legacy dialog presentation are two real Adapters, so the presentation Seam is worth considering explicitly.
- The Engineered Pi extension package is the right home for tested grill UI implementation, while `.pi/extensions/grill-ui.ts` remains a thin Discovery adapter.
- Terminal presentation reuse should happen only where generic terminal behavior is truly shared, not where grill-specific layout would become less clear.

Risks:

- Centralizing contract text could create an awkward abstraction if the skill, system-prompt guidance, validation errors, and model-visible results need intentionally different wording.
- Refactoring presentation code could regress keyboard behavior, freeform editing, cancellation semantics, or fallback behavior across Pi interactive and non-interactive modes.
- Pi runtime imports and TUI types may drift across installed Pi versions; a deeper Adapter should reduce that risk, but changing the Adapter itself is sensitive.
- Moving terminal text helpers may accidentally lose ANSI-width correctness or Markdown wrapping behavior unless tests cover representative narrow and wide renders.
- Reducing helper exports could make tests less brittle, but over-correcting could hide important user-visible behavior behind too few assertions.

## Open Questions

- Which candidate should be implemented first: the structured grill contract Module, the presentation Seam, or the Pi runtime Adapter?
- Should the structured grill contract live as executable TypeScript data, generated prose fragments, or a small documentation-backed helper?
- Is Terminal presentation already the right shared owner for grill wrapping/truncation helpers, or should only a narrower helper move there?
- Which current test assertions are protecting real user-visible behavior, and which are only pinning internal row/view Implementation details?
