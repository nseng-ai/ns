# Read-Initiative Slug-Only Contract

## Summary

The planned `initiative exec read-initiative` command is now scoped to accept only an explicit slug:

```text
initiative exec read-initiative <slug>
```

It should resolve only `.asdl/initiatives/<slug>/`. Callers that start from a path must select or derive the slug before invoking the CLI; the command itself should not accept path input.

## Initiative Impact

This narrows PR 4 and reduces duplicated selection normalization in CLI code. Initiative selection remains a skill/agent responsibility, while `read-initiative` stays focused on deterministic facts and raw Markdown output for one slug-named record.

The durable Initiative plan and roadmap now refer to slug validation, missing-slug handling, and invalid-slug errors instead of slug-or-path selection and invalid-path handling for `read-initiative`.

## Follow-Ups

- Implement PR 4 with a `read-initiative <slug>` CLI signature.
- Add scenario coverage for missing slugs, invalid slug-shaped input, absent records, closed records, missing expected files, JSON output, and Markdown output.
- Do not add path-acceptance behavior to `read-initiative`; keep path-to-slug normalization in the caller/skill layer.
