# Grill asdl Agent Workflow Domain Model

## Thesis

The repository has several agent-facing workflow primitives documented in separate places: Objectives, Branch Memory, branch handoff artifacts, slots/worktrees, Pi session cwd behavior, skill-invoked CLI commands, reviewer/pr-address workflows, and GitHub gateway conformance fixtures. `CONTEXT.md` currently captures mostly Objective language, so the adjacent workflow concepts are not yet unified in the project domain model.

This Objective plans a campaign of six ordered `grill-with-docs` invocations. Each session should challenge one coherent branch of the agent-workflow domain against existing docs and code, sharpen terms, and update `CONTEXT.md` or ADRs inline as decisions crystallize. The Objective is complete when those six sessions have either run in order or been explicitly parked/replaced with durable rationale, and their outcomes are captured in checked-in docs rather than only in chat history.

## Scope

This Objective is satisfied by **N = 6** individual `grill-with-docs` invocations, ordered from existing core vocabulary outward to cross-workflow governance:

1. **Objective mechanics baseline** — confirm or sharpen the language around Objective, Durable Narrative Roadmap Record, Semantic Update, Tracking Gate, Objective Update, Objective Close, and Closure Marker.
2. **Branch Memory and handoff artifacts** — clarify Branch Memory, Entry, Entry Key, Namespace, branch-scoped artifacts, handoffs, and how those differ from Objectives and committed docs.
3. **Slots and Pi session movement** — clarify Slot, managed worktree, pool, assignment, availability, Pi session cwd, and fresh-session cross-worktree movement.
4. **Skill-invoked CLI boundary** — clarify the boundary between a skill, an interactive command, a hidden `exec` command, deterministic CLI mechanics, and LM/human semantic judgment.
5. **Review and GitHub feedback workflows** — clarify reviewer, review definition, harness adapter, finding, pr-address feedback, GitHub gateway, and live conformance fixture language.
6. **Synthesis and governance** — resolve placement rules for when knowledge belongs in `CONTEXT.md`, an ADR, an Objective, Branch Memory, a skill doc, package docs, or a PR comment.

Each session should use the `grill-with-docs` discipline: inspect repo evidence before asking answerable questions, ask one unresolved question at a time, call out conflicts with existing language, update `CONTEXT.md` when terms are resolved, and offer ADRs only when the decision is hard to reverse, surprising without context, and the result of a real trade-off.

## Non-Goals

- Do not use `improve-codebase-architecture` for this Objective. Architecture deepening is a separate workflow and not the source of this campaign.
- Do not implement new runtime behavior, new CLIs, or new skills as part of the grilling campaign unless a later separate Objective or roadmap item is created for that work.
- Do not pre-author final glossary decisions before the relevant grilling session has resolved them.
- Do not turn `CONTEXT.md` into an implementation inventory. It should capture domain terms meaningful to project contributors, not internal class/module details.
- Do not create ADRs merely because a session happened. Use the `grill-with-docs` ADR threshold.
- Do not use this Objective as a task database for every possible agent-workflow improvement discovered during the sessions.

## Completion Criteria

- All six planned `grill-with-docs` invocations are marked complete in `roadmap.md`, or any skipped/replaced invocation is moved to `## Parked` with a concrete reason and replacement plan.
- `CONTEXT.md` reflects the agreed terms and relationships surfaced by the sessions, or a Semantic Update explains why no context change was appropriate for a completed session.
- Any decisions that meet the ADR threshold are recorded under an appropriate `docs/adr/` path created lazily when first needed.
- Each completed session leaves durable evidence: a `CONTEXT.md` edit, an ADR, package/doc changes, and/or an Objective Semantic Update summarizing the finding and why no durable domain-doc edit was needed.
- The final synthesis session records the cross-workflow governance rules and identifies any follow-on Objectives that should be created instead of expanding this one.

## Assumptions and Risks

**Assumptions**

- Six sessions is the right planning granularity: small enough for focused `grill-with-docs` conversations, broad enough to cover the current agent-workflow surface.
- `grill-with-docs` is the right workflow because the desired output is clarified domain language and durable documentation, not architecture refactoring.
- Existing docs are sufficient starting evidence for the first pass: `CONTEXT.md`, `docs/objective-system.md`, package READMEs, Pi notes, Branch Memory docs, reviewer/pr-address docs, and GitHub conformance docs.
- The phrase “agent workflow domain model” is useful as an umbrella for planning even if the sessions later choose more precise canonical terms.

**Risks**

- The campaign may be too broad and drift into implementation planning. Mitigation: keep each session focused on terminology, boundaries, scenarios, and durable docs; split implementation work into separate Objectives.
- Inline `CONTEXT.md` edits may accidentally encode implementation details. Mitigation: apply the `grill-with-docs` rule that `CONTEXT.md` captures domain concepts, not internal module/class names.
- ADRs could proliferate for low-stakes choices. Mitigation: only create ADRs when the `grill-with-docs` three-part threshold is met.
- Objective, Branch Memory, handoff, and skill concepts may overlap enough to create contradictory documentation. Mitigation: the synthesis session is explicitly reserved for resolving cross-workflow placement rules.
- Later sessions may discover that one of the planned chunks is the wrong boundary. Mitigation: move that row to `## Parked` with rationale and add a replacement row rather than silently changing the campaign shape.

## Open Questions

- Should “agent workflow domain model” become a canonical `CONTEXT.md` term, or remain only this Objective's planning label?
- Should every completed session create an Objective Semantic Update, or only sessions whose outcome is not otherwise obvious from `CONTEXT.md`/ADR diffs?
- Does the review/GitHub feedback session need to be split if reviewer, pr-address, and GitHub conformance language prove too different for one conversation?
