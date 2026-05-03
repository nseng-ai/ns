# Examples

These examples show how `dev-stacker-agent` should think about
normalization. They are examples of the coordinator's internal work,
not a required author-facing plan schema.

## Example 1: loose markdown plan with explicit validation

Input plan:

```md
# Objective reconcile stack

1. First add the shared reconciliation primitives in asdl-core.
2. Then add the objective CLI command that consumes them.
3. Finish with scenario tests and docs.

Validation: just
Avoid touching vendored skills.
```

Normalized slices:

```json
[
  {
    "schema": "stacker-slice-manifest/v1",
    "ordinal": 1,
    "title": "PR 1 - reconciliation primitives",
    "scope": "Add the shared reconciliation primitives in asdl-core.",
    "base": "default_branch",
    "validate": {"command": "just"},
    "constraints": ["Do not touch vendored skills."]
  },
  {
    "schema": "stacker-slice-manifest/v1",
    "ordinal": 2,
    "title": "PR 2 - objective CLI command",
    "scope": "Add the objective CLI command that consumes the new primitives.",
    "base": "previous_slice",
    "validate": {"command": "just"},
    "constraints": ["Do not touch vendored skills."]
  },
  {
    "schema": "stacker-slice-manifest/v1",
    "ordinal": 3,
    "title": "PR 3 - scenario tests and docs",
    "scope": "Add scenario coverage and docs for the new objective reconcile flow.",
    "base": "previous_slice",
    "validate": {"command": "just"},
    "constraints": ["Do not touch vendored skills."]
  }
]
```

## Example 2: freeform notes with defaults

Input plan:

```md
- slice one: parser cleanup
- slice two: wire the parser into the command
- slice three: tighten error messages
```

Normalized slices:

```json
[
  {
    "schema": "stacker-slice-manifest/v1",
    "ordinal": 1,
    "title": "PR 1 - parser cleanup",
    "scope": "Clean up the parser implementation.",
    "base": "default_branch",
    "validate": {"command": "just"},
    "constraints": []
  },
  {
    "schema": "stacker-slice-manifest/v1",
    "ordinal": 2,
    "title": "PR 2 - wire parser into command",
    "scope": "Wire the cleaned-up parser into the command path.",
    "base": "previous_slice",
    "validate": {"command": "just"},
    "constraints": []
  },
  {
    "schema": "stacker-slice-manifest/v1",
    "ordinal": 3,
    "title": "PR 3 - tighten error messages",
    "scope": "Refine user-facing error messages without broadening scope.",
    "base": "previous_slice",
    "validate": {"command": "just"},
    "constraints": []
  }
]
```

## Example 3: commits without PRs

Input plan:

```md
Use commits, not PR branches:

- slice one: parser cleanup
- slice two: wire the parser into the command
- slice three: tighten error messages
```

The coordinator records output shape `commit-series`, resolves one
target branch, and uses the same manifest shape. Slice 1 might be:

```json
{
  "schema": "stacker-slice-manifest/v1",
  "ordinal": 1,
  "title": "Slice 1 - parser cleanup",
  "scope": "Clean up the parser implementation.",
  "base": "abc123",
  "validate": {"command": "just"},
  "constraints": [],
  "suggested_commit_subject": "Clean up parser implementation"
}
```

Later slices use the previous verified `head_sha` as `base`.

## Example 4: when to ask instead of default

Input plan:

```md
1. Add the new storage layer.
2. Update the old command to use it.
3. Also clean up the flaky tests.
```

Do not guess if any of these are materially unclear:

- whether step 3 depends on steps 1-2 or is intentionally independent,
- whether "old command" refers to one CLI entry point or several, or
- whether the repo's default validation command is too weak for the
  stated scope.

Ask only for the missing fact, then continue normalizing.
