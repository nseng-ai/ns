# Execution-Friendly Objective Creation

Load this reference only when creating an Objective that should be execution-friendly for `objective-next`, autonomous/runner behavior, or direct execution after preview.

Read `skills/objective/references/execution-policy.md` first when available.

## Interview timing

- Do not ask execution-policy questions before slug and purpose are sufficiently clear.
- Default ordinary Objectives to planning-only unless the user requested execution-friendly/runner/autonomous behavior or the interview exposes execution policy as a real branch point.
- Stop and ask when the user has not provided enough durable execution policy context; do not invent permission boundaries.

## Minimum policy to gather

Gather at least:

1. when direct execution is allowed;
2. when to steer or ask first;
3. what keepable progress looks like;
4. validation boundaries and how work may be left;
5. what external systems, PR submission, publishing, deployment, or write APIs are out of scope unless explicitly previewed and confirmed.

## Placement and template

Place the optional `## Definition of Progress` and `## Runner Policy` sections after `## Completion Criteria`, using the template in `skills/objective/references/execution-policy.md`.

Use durable prose. Do not add YAML/frontmatter, UUIDs, hidden state, queues, ledgers, task databases, automation registries, or lifecycle states.

## Row-level policy examples

Use row-level `Policy:` / `Evidence:` only when slice-local guidance differs from Objective-level defaults or clarifies validation:

```md
- [ ] Example semantic slice.
  - Policy: direct execution after preview.
  - Evidence: targeted tests and relevant repo checks pass.
```

```md
- [ ] Resolve the terminology boundary.
  - Policy: steer first; ask the human to choose the canonical term before editing docs.
```

## Verification

Before reporting completion for an execution-friendly Objective, confirm:

- `objective.md` contains `## Definition of Progress` and `## Runner Policy`;
- policy prose covers the minimum policy items above;
- any row-level `Policy:` notes are prose guidance, not machine-readable state;
- external systems and write-capable actions are explicitly bounded or out of scope;
- planning-only Objectives did not receive execution policy sections unless explicitly requested.
