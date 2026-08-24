---
name: plan-grill-and-save
disable-model-invocation: true
description: "Explicit planning workflow: resolve material requirements through portable questions, write a self-contained implementation plan, and save it with `write_saved_plan_file`."
---

# plan-grill-and-save

Turn a planning target into a reviewed Saved Plan. The questions use ordinary agent and user messages. There is no structured Grill UI or question tool.

## Establish the planning target

Infer the target in this order:

1. explicit steering in the command request;
2. the current conversation;
3. repository evidence.

If the target is still ambiguous after inspecting the repository, ask one focused question that identifies the intended change. Do not begin a broad interview around an unidentified target.

## Inspect before asking

Read the relevant repository instructions, implementation, tests, documentation, active plans, and current worktree state before asking requirements questions. Resolve facts from repository evidence or read-only tools. Never ask the user for a fact you can inspect.

Treat authoritative plans and handoffs already in context as evidence caches. Revalidate volatile facts and named anchors, but do not repeat captured research without a concrete reason.

## Resolve material requirements

Load and follow the installed `grilling` skill as the interview authority. This is a required dependency. If the harness cannot load `grilling`, stop and report that `plan-grill-and-save` requires it. Do not copy, approximate, or replace its interview procedure.

Apply these workflow-specific constraints while grilling:

- Ask only questions that require user judgment and can materially change the implementation plan.
- Do not ask about facts available in the repository.
- Do not ask routine questions about test coverage, validation commands, or check scope unless validation is itself a product requirement or release constraint.
- Stop when the material requirements are resolved. Do not force a fixed question count.

Before moving on, state the resolved decisions and ask for confirmation only when the interview produced decisions the user has not already confirmed.

## Write and review the plan

Write the plan for a completely fresh downstream coding-agent session. The Saved Plan is its only planning context.

Include:

- the goal and user-visible outcome;
- relevant current behavior and repository evidence;
- decisions, constraints, and rationale;
- important files, symbols, commands, tests, and documentation;
- an ordered implementation approach;
- proportional validation guidance and expected outcomes;
- risks, assumptions, edge cases, and any genuinely open question;
- concrete findings and provenance from off-repository research, when used.

Do not rely on this conversation, hidden context, tool transcripts, or phrases such as "as discussed." Do not over-specify routine test scope when project policy and changed-file judgment already own it.

Review the finished Markdown before saving. Check that it is self-contained, internally consistent, actionable, and free of unresolved placeholders. Confirm that rejected alternatives and non-obvious ownership decisions are recorded when they matter to implementation.

## Save through the existing writer

Call `write_saved_plan_file` exactly once with the complete reviewed Markdown in `content` and an optional one-sentence `summary`. Do not derive or pass a filename slug. Do not write the plan through shell commands or another file tool. The existing writer owns repository identity, source-branch encoding, semantic slug derivation, collision refusal, and storage.

If `write_saved_plan_file` is unavailable, stop and report that this workflow requires the retained Saved Plan writer. Do not invent a fallback store.

After a successful call, report the tool's saved-plan evidence, including the file path and returned repository, source-branch, slug, and model details. Then stop. Do not create or switch branches, attach Branch Memory, start implementation, or invoke a branch-context workflow.
