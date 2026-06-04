# Execution Policy

Load this reference when the user asks for execution-friendly Objectives, runner policy, `objective-next` execution, autonomous pursuit, direct execution after preview, `## Definition of Progress`, `## Runner Policy`, or row-level `Policy:` notes.

This is shared policy guidance. Creation-specific interview/template guidance lives in `skills/objective-create/references/execution-friendly-create.md`. `objective-next` preview and confirmed-execution rules live in `skills/objective-next/references/confirmed-execution.md`.

## Optional sections

Execution-friendly Objectives may add optional top-level prose sections after `## Completion Criteria`:

```md
## Definition of Progress

Progress is keepable when:

- ...

Do not keep changes that:

- ...

Useful evidence includes:

- ...

## Runner Policy

This Objective is execution-friendly for `objective-next` under the boundaries below.

- Direct execution is allowed when: ...
- Steer or ask first when: ...
- How work may change files and be left: ...
- Validation before keeping work: ...
- What will not happen unless explicitly requested: ...
```

Ordinary planning-only Objectives may omit these sections.

## Interpretation rules

- Policy is durable prose, not schema.
- Do not add YAML/frontmatter, UUIDs, hidden state, queues, ledgers, task databases, automation registries, or lifecycle states.
- Concrete roadmap rows alone do not imply execution permission.
- A `## Runner Policy` heading alone is insufficient when the content is ambiguous.
- Row-level `Policy:` prose may override Objective-level defaults for that row.
- Row-level `Evidence:` prose is expected evidence, not machine state.
- External systems and write-capable actions are out of scope by default. Publishing, deploying, mutating GitHub issues/PRs, submitting PRs, calling write APIs, or changing external systems requires explicit policy or confirmed preview scope.
- Do not describe every execution-friendly Objective as autonomous. Human-assisted execution after preview is weaker than autonomous pursuit.

## Autonomy-designed minimum

Before treating an Objective as designed for autonomous pursuit, require stronger durable support than ordinary execution-friendliness:

1. a North Star or equivalent durable goal;
2. a Definition of Progress;
3. load-bearing assumptions and risks;
4. runner boundaries and escalation guidance.

Metrics may be part of the Definition of Progress when they exist, but qualitative rubrics and boundaries are still valid and often necessary.
