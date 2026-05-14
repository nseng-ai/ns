# Read-Objective Slug-Only Contract

## Summary

The planned `objective exec read-objective` command is now scoped to accept only an explicit slug:

```text
objective exec read-objective <slug>
```

It should resolve only `.asdl/objectives/<slug>/`. Callers that start from a path must select or derive the slug before invoking the CLI; the command itself should not accept path input.

## Objective Impact

This narrows PR 4 and reduces duplicated selection normalization in CLI code. Objective selection remains a skill/agent responsibility, while `read-objective` stays focused on deterministic facts and raw Markdown output for one slug-named record.

The durable Objective plan and roadmap now refer to slug validation, missing-slug handling, and invalid-slug errors instead of slug-or-path selection and invalid-path handling for `read-objective`.

## Follow-Ups

- Implement PR 4 with a `read-objective <slug>` CLI signature.
- Add scenario coverage for missing slugs, invalid slug-shaped input, absent records, closed records, missing expected files, JSON output, and Markdown output.
- Do not add path-acceptance behavior to `read-objective`; keep path-to-slug normalization in the caller/skill layer.
