# Runtime contract

This file defines the only required internal normalization for
`dev-stacker-agent`.

Humans do **not** need to author plans in this shape. The coordinator
derives it from freeform plan text, harness-native planner output, or
explicit clarification from the user.

## `stacker-slice-manifest/v1`

The coordinator normalizes each slice into this internal manifest.

Required fields:

- `schema`: literal `stacker-slice-manifest/v1`
- `ordinal`: 1-based slice index
- `title`: short label for the slice
- `scope`: the actual implementation brief for this slice
- `base`: one of:
  - `default_branch`
  - `previous_slice`
  - a literal branch or ref name
  - a concrete SHA, usually for commit-series runs
- `validate.command`: exact validation command to run from the repo root

Optional fields:

- `constraints`: list of explicit scope boundaries or do-not-touch notes
- `source_excerpt`: original plan text fragment that produced this slice
- `suggested_branch_name`
- `suggested_commit_subject`
- `downstream_context`: notes forwarded from earlier slices

Example:

```json
{
  "schema": "stacker-slice-manifest/v1",
  "ordinal": 2,
  "title": "PR 2 - add objective reconcile CLI",
  "scope": "Add the reconcile command and wire it through the CLI package.",
  "base": "previous_slice",
  "validate": {"command": "just"},
  "constraints": ["Do not touch vendored skill code."],
  "suggested_branch_name": "objective-reconcile/add-cli",
  "suggested_commit_subject": "Add objective reconcile CLI",
  "downstream_context": ["important for downstream: command group name is 'reconcile'"]
}
```

### Normalization defaults

When the source plan omits a field, use these defaults unless that would
be materially risky:

- In branch-stack runs, first slice `base = default_branch`; later
  slices `base = previous_slice`.
- In commit-series runs, first slice `base` is the target branch's
  current `HEAD` before slice 1; later slices use the previous slice's
  verified `head_sha`.
- `validate.command =` repo standard green-bar command.
- `constraints = []`.

If title, scope, order, base, or validation cannot be inferred safely,
stop and ask the user only for the missing fact.

## `stacker-handoff/v1`

Each worker must return one machine-readable handoff record plus a short
prose summary.

Required fields:

- `schema`: literal `stacker-handoff/v1`
- `status`: one of `ok`, `failed`, or `question`
- `branch`: branch or ref containing the slice result, or empty string
  if no branch was created
- `head_sha`: resolved head SHA for `branch`, or empty string if none
- `validation.command`
- `validation.exit_code`
- `files_changed`: list of touched paths when known
- `deviations`: list of scope deviations or interpretations
- `downstream_notes`: exact names, contracts, or choices later slices
  must preserve
- `questions`: blocking questions that prevented safe completion

Optional fields:

- `summary`: short freeform summary

Example success handoff:

```json
{
  "schema": "stacker-handoff/v1",
  "status": "ok",
  "branch": "objective-reconcile/add-cli",
  "head_sha": "abc123def456",
  "validation": {"command": "just", "exit_code": 0},
  "files_changed": [
    "packages/twerk-objective/src/twerk_objective/cli.py",
    "packages/twerk-objective/tests/scenario/test_cli.py"
  ],
  "deviations": [],
  "downstream_notes": [
    "important for downstream: the command is named 'reconcile'"
  ],
  "questions": []
}
```

Example blocked handoff:

```json
{
  "schema": "stacker-handoff/v1",
  "status": "question",
  "branch": "",
  "head_sha": "",
  "validation": {"command": "just", "exit_code": 1},
  "files_changed": [],
  "deviations": [],
  "downstream_notes": [],
  "questions": [
    "Should the reconcile command live in the standalone CLI package or the plugin subgroup only?"
  ]
}
```

## Verification bar

The coordinator must not advance to the next slice unless all of these
are true:

- the handoff is present and parseable,
- `status == "ok"`,
- `validation.exit_code == 0`,
- the reported `branch` resolves locally,
- the resolved head equals `head_sha`,
- the diff against the slice base passes a human diff skim.

For commit-series runs, also confirm the reported `branch` is the run's
target branch and the resolved head is a descendant of the slice base.

Optional constraints strengthen verification when present; they do not
become mandatory plan-authoring requirements.
