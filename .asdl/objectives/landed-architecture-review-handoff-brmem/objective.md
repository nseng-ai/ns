# Landed Architecture Review: Handoff over Branch Memory

## Thesis

Agent handoff should have a clear artifact interface over Branch Memory: durable enough to resume across sessions and branches, inspectable enough for humans and agents, and narrow enough that it does not become a second task database or hidden workflow controller.

The architecture-review value is to make the handoff/brmem seam explicit. Branch Memory already provides branch-scoped textual Entries that are not working-tree files, commits, PR comments, or issues. Handoff workflows need to define how they use that storage model: which branch is addressed, which Namespace or Base entries are owned by the workflow, what entry keys mean, how overwrites are handled, and what a future agent should trust when resuming.

## Scope

This Objective covers the handoff artifact interface layered over Branch Memory:

- Inventory the current handoff-save, handoff-load, and related agent instructions that store, list, load, or resume handoff context.
- Define the contract between handoff artifacts and Branch Memory concepts: branch, Namespace or Base Namespace, Entry Key, Entry Locator, overwrite behavior, copy behavior, and textual size/safety expectations.
- Clarify what belongs in a handoff artifact versus ordinary Objective records, planned-branch plans, checked-in docs, PR comments, or ad-hoc scratch notes.
- Improve the smallest relevant handoff skills, CLI paths, docs, or tests needed to make that contract reliable and discoverable.
- Capture evidence for normal and failure-oriented resume paths, such as missing entries, stale branch context, unsafe overwrite attempts, or ambiguous branch selection.

## Non-Goals

- Do not replace Branch Memory or redesign its storage model.
- Do not make Branch Memory a secret store, binary artifact store, generated-output cache, issue tracker, PR comment substitute, or general task database.
- Do not create hidden registries, UUID state, schedulers, queues, or workflow lifecycle machines for handoffs.
- Do not require every Objective, planned branch, or skill to use handoff artifacts.
- Do not broaden this Objective into all Branch Memory UX; keep the focus on handoff artifacts and resume behavior.
- Do not perform branch creation, commits, PR submission, publishing, deployment, or remote write operations unless a later explicit execution plan includes them.

## Completion Criteria

This Objective is complete when:

- the existing handoff-over-brmem behavior and relevant instructions have been inventoried;
- the intended handoff artifact contract is documented or encoded where future agents will actually encounter it;
- any necessary handoff skill/CLI/test changes have landed or have been explicitly parked with rationale;
- at least one normal resume path and one failure/staleness path have evidence;
- remaining Branch Memory improvements outside handoff artifacts are either out of scope or moved to a more focused Objective.

## Assumptions and Risks

Assumptions:

- Handoff artifacts should remain small UTF-8 text entries suitable for Branch Memory rather than checked-in files or remote comments.
- A handoff workflow benefits from a named, explicit storage convention more than from freeform ad-hoc Base Namespace entries.
- Existing handoff skills and `brmem` CLI operations are close enough that this Objective can tighten contracts without redesigning either subsystem.
- Future agents can make safer resume decisions when branch, namespace, entry key, locator, and overwrite semantics are stated plainly.

Risks:

- Handoff artifacts may become stale but still authoritative-looking; the mitigation is to define stale-branch and ambiguous-resume handling as first-class cases.
- Multiple workflows may collide in Branch Memory if namespace and key ownership stay implicit; the mitigation is to document or enforce deliberate namespace/key choices.
- Agents may overwrite useful handoff context accidentally; the mitigation is to require preflight or explicit overwrite behavior where preservation matters.
- The Objective could drift into all Branch Memory improvements; the mitigation is to keep non-handoff brmem UX parked or split out.
- The handoff contract may duplicate Objective or planned-branch context; the mitigation is to define handoff artifacts as directed resume context, not durable project truth.

## Open Questions

- Should handoff artifacts use the Base Namespace or a named workflow-owned Namespace by default?
- What entry-key convention best distinguishes active directed handoffs from archival or scratch notes?
- When multiple candidate handoffs exist for a branch, should the loader require explicit selection or choose the latest deterministic candidate?
- What exact evidence should count as sufficient for stale or ambiguous resume-path handling?
