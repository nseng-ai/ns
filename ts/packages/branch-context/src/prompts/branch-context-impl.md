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

----- BEGIN {{plan_label}} -----
{{attached_plan}}
----- END {{plan_label}} -----
