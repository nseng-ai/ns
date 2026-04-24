# Worker brief template

Fill this brief from a normalized `stacker-slice-manifest/v1`, not from
a required user-authored plan schema. Replace every `[bracketed]`
placeholder with the concrete value for this slice. Drop a section when
it does not apply, but do not rename the remaining sections.

---

## Assignment

- Plan file: `[absolute-path-to-plan-file]`
- Slice ordinal: `[1-based-index]`
- Slice title: `[normalized title]`
- Source excerpt: `[optional source text excerpt or "not provided"]`

Implement only this slice. Do not move on to later slices. If the plan
is incomplete or contradictory, stop and report a blocking question.

## Environment

- Repo root: `[absolute-repo-root]`
- Base ref resolved by coordinator: `[branch-or-ref]`
- Suggested branch name: `[suggested-branch-name]`
- Suggested commit subject: `[suggested-commit-subject]`
- Repo workflow notes: `[repo-specific workflow notes, such as Graphite
  conventions]`

Use the repo's workflow conventions for branch creation, commit
creation, and stack inspection. Do not push, submit, or open a PR.

## Scope

`[normalized scope for this slice]`

## Constraints

[Zero or more explicit constraints. If none, write:
"No explicit extra constraints beyond the normalized scope."]

## Downstream Context

[Forwarded notes from prior slices. If none, write: "None."]

## Validation

From the repo root, run:

```bash
[exact validation command]
```

The exit code must be `0` for a successful handoff.

## Exit Criteria

When this slice lands and validation is complete, emit:

1. One JSON line conforming to `stacker-handoff/v1`:

   ```json
   {"schema":"stacker-handoff/v1","status":"ok","branch":"<name>","head_sha":"<full-sha>","validation":{"command":"<command>","exit_code":0},"files_changed":["path/to/file"],"deviations":[],"downstream_notes":[],"questions":[]}
   ```

2. A short prose summary covering:
   - scope actually implemented,
   - any deviations or scope interpretations,
   - any exact names or shapes later slices must reuse,
   - any blocking questions if you had to guess.

If validation failed, still emit the JSON line with `status: "failed"`
and the real non-zero exit code, then summarize the failure and include
the last useful chunk of validation output.

Do **not**:

- advance to the next slice,
- submit, push, or open a PR,
- modify the plan file itself, or
- silently scope-expand to "fix the whole stack."
