# Feedback classifier rules

A classification packet covers the latest single-PR feedback manifest.

## Dispositions

Use only:

- `actionable`
- `informational`

Do not use stack-only dispositions or stack-wide planning terms.

## Actionable items

Actionable reviews, review threads, and discussion comments require:

- non-empty `summary`
- non-empty `action_summary`
- `complexity`: `pre_existing`, `local`, `single_file`, `cross_cutting`, or `complex`

Set `pre_existing: true` only with `complexity: "pre_existing"`.

## Informational items

Informational items require `informational_reason`, such as:

- `resolved_reference`
- `automation`
- `acknowledgement`
- `approval`
- `question_only`
- `fyi`
- `noise`
- `already_addressed`
- `other`

Review-thread informational items can later require an explicit user decision (`act`, `dismiss`, or `skip`) during planning.

## Validation

```bash
pr-address exec validate-feedback-classification \
  --pr-number <pr-number> \
  --classification-file <classification.json> \
  --format json
```

`--classification-json` is available for compact inline packets. `--classification-file <path>` is only for files outside the current git worktree; worktree-local paths hard-fail with no override.
