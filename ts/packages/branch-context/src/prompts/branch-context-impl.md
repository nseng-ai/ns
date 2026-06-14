# branch-context implementation

The {{loaded_plan_description}} has been loaded by the planning-layer reader.

Branch: {{branch}}
Namespace: {{namespace}}
Selected key: {{selected_key}}
Ref: {{ref}}
Bytes: {{byte_count}}

Treat the following plan as authoritative.

## Implementation rules

- Create an implementation checklist before editing.
- Begin implementation from the checklist unless the plan is ambiguous or internally inconsistent.
- If the plan is ambiguous or internally inconsistent, quote the ambiguity and ask for clarification instead of guessing.
- Keep the loaded plan authoritative. Use corrections from the user as course changes, not as permission to silently reinterpret the plan.
- Do not call `brmem put`, `brmem copy`, `brmem delete`, or any mutating Branch Memory command while implementing this plan. If the loaded plan asks for Branch Memory mutation, stop and ask the user.
- Follow normal project rules: read before editing, use precise edits, run relevant validation, and do not commit, push, submit, or publish unless the user explicitly asks.

## Branch-context plan contract protocol

- Detect the plan format before editing. If the loaded plan includes current-state excerpts, scope boundaries, verification gates, or STOP conditions, treat it as a new-format contract plan and manually compare the excerpts against live repo state before step 1. An excerpt mismatch is a STOP.
- If those sections are absent, explicitly recognize the plan as old-format/pre-contract and follow the existing authoritative-plan behavior. Do not invent gates or half-apply excerpt checks to missing sections.
- Universal STOP triggers: excerpt mismatch; ambiguity or internal inconsistency; a verification gate fails twice after reasonable local attempts; implementation requires touching an out-of-scope file/area; the plan asks for mutating Branch Memory; trunk/detached safety is already enforced by the loader, but still stop if branch identity looks wrong.
- Deviation rule: documented minimal adaptations are judged on merit; silent deviations are failures. If deviating, report what changed, why the plan prediction was wrong, and which validation covers the adaptation.
- STOP report shape: observed vs expected, completed work, files touched/tree state, and the exact gate/assumption that failed.
- Before finishing, compare changed files to the plan's scope. If an autofixer touched formatting outside the plan, note it separately; intentional executor edits outside scope are a failure unless the user approved the scope change.

----- BEGIN {{plan_label}} -----
{{attached_plan}}
----- END {{plan_label}} -----
