# Branch Memory Storage Abstraction

## Thesis

ASDL has multiple TypeScript workflows that interact with Branch Memory through `brmem` command execution. The current PR remediation should only share neutral command-running and `put` parsing helpers, but a later design pass should decide whether a fuller namespace-neutral Branch Memory storage abstraction would reduce duplication across branch-context, handoff, CCC, Pi extensions, and future workflows without erasing their user-facing domain semantics.

## Scope

- Inventory TypeScript and Python callers that shell out to `brmem` or parse Branch Memory command output.
- Identify which behavior is genuinely neutral storage mechanics versus namespace-specific workflow policy.
- Design a small storage contract for common operations such as check, put, list, get, and delete, if the inventory justifies it.
- Preserve owner-specific concepts such as attached plans, handoff artifacts, CCC dispatch payloads, and worktree-status presentation.
- Propose and implement incremental migrations only where the abstraction is smaller than the duplicated code it replaces.

## Non-Goals

- Do not change the `brmem` CLI storage format or Branch Memory ref layout.
- Do not collapse branch-context, handoff, CCC dispatch, or worktree-status user models into a generic Branch Memory user model.
- Do not introduce CCC dependencies into lower packages.
- Do not require all existing brmem callers to migrate in one broad churn commit.

## Completion Criteria

- There is an evidence-backed inventory of current Branch Memory callers and duplicated mechanics.
- The repo has either a deliberately small shared storage abstraction with at least two migrated callers, or a documented decision that the abstraction is not worth introducing yet.
- Namespace-specific workflows still own their public semantics and validation.
- Relevant tests cover the neutral contract and at least one namespace-specific caller.

## Assumptions and Risks

Assumptions:

- The repeated mechanics across brmem callers are likely broader than command discovery and `put` parsing, but this needs inventory before design.
- A useful abstraction should live below CCC and avoid importing Pi-extension runtime into packages that do not otherwise need it.

Risks:

- Over-abstracting Branch Memory could obscure domain ownership and make workflows harder to understand.
- A generic storage contract could accidentally normalize behavior that should remain namespace-specific, such as collision handling, reply wording, or attachment semantics.
- Cross-language Python and TypeScript callers may not benefit from the same abstraction boundary.

## Open Questions

- Which existing callers should be considered canonical candidates for a shared storage contract?
- Should the abstraction live in TypeScript `@asdl/core`, Python `asdl-core`, both, or remain command-helper-only?
- What conformance tests would prove the abstraction preserves namespace-specific behavior rather than replacing it?
