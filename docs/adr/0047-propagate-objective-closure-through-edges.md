# ADR 0047: Propagate Objective closure through connected records

## Status

Accepted

Supersedes ADR 0025 only where that decision limited close-time counterpart mutation to Blocked Sentence judgment. ADR 0025's zero-kind mirrored edge schema, prompting-owned semantics, and structural-only linter remain in force.

## Context

Objective Edges make inter-objective relationships discoverable, but the initial close workflow used them only to reconsider a connected record's `blocked:` sentence. That is too narrow for relationships such as Umbrella/Subobjective synthesis, sequencing, risk retirement, or follow-up activation.

A concrete failure exposed the gap: a Subobjective closed after completing a skill-tree cutover, while its connected Umbrella Objective still described that work as active. The records were structurally valid and neither endpoint was blocked, so the frontmatter-only close rule had nothing to update. A later manual pass had to change the parent's edge annotation, roadmap, and orientation.

The closure of one Objective is semantic evidence for every Objective connected to it. The system should require agents to assess that evidence without adding typed edges or asking deterministic tooling to interpret prose.

## Decision

Make Objective Close a graph-aware tracking transaction.

For every Objective Edge declared by the closing record, the close workflow reads both Edge Annotations and the connected Objective's full current tracking. It assigns one explicit disposition:

- **updated** — closure changes the active counterpart's durable meaning;
- **unchanged** — closure has no durable effect on the active counterpart; or
- **already closed** — the counterpart has no live tracking to advance.

For an updated counterpart, the workflow edits every relevant durable surface needed to express the post-closure state. This may include:

- clearing or rewording its Blocked Sentence;
- rewording mirrored Edge Annotations;
- advancing or completing parent synthesis and dependency rows in `roadmap.md`;
- updating assumptions, risks, open questions, sequencing, or closure-adjacent narrative in `objective.md`;
- re-deriving `orientation.md`; and
- writing a new counterpart-local Semantic Update when the effect is semantically meaningful.

Existing Semantic Updates remain immutable. Edges remain in place unless the relationship itself is disproven; a closed endpoint preserves useful historical context.

Close-time propagation is the bounded exception to ordinary one-Objective mutation scope. It applies to explicit `objective-close` and every inline close path, including `objective-update` and `objective-refresh`.

Propagation does not recursively close connected Objectives. If an updated counterpart becomes closure-ready, the workflow reports that fact and closes it only through a separate Objective Close. Already closed counterparts are not amended without explicit user intent. Unchanged counterparts receive no ceremonial edits, but the close report states why no durable effect existed.

The edge schema remains kind-less and mirrored. Deterministic Objective tooling remains structural-only: it may inventory edges and warn about marker/frontmatter combinations, but language-model judgment owns semantic impact and authored mutations.

## Considered options

### Keep close propagation limited to Blocked Sentences

Rejected. It catches hard gates but misses parent synthesis, sequencing, risk, and orientation changes. Structurally valid records can remain semantically stale after a connected Objective closes.

### Add typed dependency and parent edge kinds

Rejected. The real relationship corpus still lives in perspective-specific prose, and typed edges would recreate the partial-taxonomy problem rejected by ADR 0025. Both endpoint annotations already provide enough evidence for language-model judgment.

### Automatically update or close every connected Objective

Rejected. An edge establishes relevance, not a predetermined effect. Some counterparts should remain unchanged, and recursive closure would conceal independent completion criteria and closure evidence.

### Require a separate objective-update invocation per counterpart

Rejected. That leaves the graph inconsistent between operations and makes a correct close dependent on follow-up discipline. The closure event and its immediate connected-record effects should land atomically.

## Consequences

- Objective Close may intentionally modify several Objective directories even though ordinary Objective Update remains single-record.
- Close workflows must load more context: both annotations and the current durable tracking for each counterpart.
- Semantic Updates remain Objective-local; one closure may produce separate updates in multiple affected records.
- Reports become auditable by naming every counterpart's `updated`, `unchanged`, or `already closed` disposition.
- `ns objective check` remains a structural backstop and cannot prove that semantic propagation was correct or complete.
- Reopening must assess connected records again and write corrective updates rather than rewriting close-time history.
