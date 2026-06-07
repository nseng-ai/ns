---
name: roaster-stack
description: "Drive the skill-first roaster Graphite stack bake-off workflow: collect roaster findings, triage into resolver batches, enforce `roaster stack exec` gates, create Graphite branches, submit, and render a dashboard."
---

# roaster-stack

Use this skill to run the **skill-first** `roaster stack` bake-off path. The agent in the current session owns triage and resolution. Python is only used through deterministic `roaster stack exec` commands.

## Safety contract

- Run only on a disposable Graphite branch/PR.
- Use `gt` for stack branch creation, modification, and submission.
- Halt immediately on any `roaster stack exec record-batch` negative/failure result, validation failure, or `gt` error.
- Do not silently remediate a failed batch. Report the failed batch, gate evidence, manifest locator, and resume point.
- Each triage batch must declare tight but complete `expected_paths` globs and runnable `validation_requirements`.

## Workflow

1. Collect findings:
   - `roaster review list-matching`
   - For each selected review key: `roaster review run <key> --format json`
2. Triage in context into JSON with:
   - `summary`
   - `findings`
   - `batches`, each with `slug`, `title`, `summary`, `finding_ids`, `dependencies`, `confidence`, `risk`, `resolver_mandate`, `validation_requirements`, and `expected_paths`.
3. Persist triage:
   - Pipe the triage JSON to `roaster stack exec record-triage --impl-branch <branch> --impl-branch-slug <slug> --profile-slug <profile> --run-slug <run> [--target-pr <pr>]`.
4. Order batches:
   - `roaster stack exec order-batches --impl-branch <branch> --impl-branch-slug <slug> --profile-slug <profile> --run-slug <run>`.
5. For each ordered batch, resolve inline in this session:
   - Edit the code directly.
   - Pipe resolver JSON to `roaster stack exec record-batch <batch-slug> --impl-branch <branch> --impl-branch-slug <slug> --profile-slug <profile> --run-slug <run>`.
   - If it halts, stop and report.
   - On pass, compute branch name with `roaster stack exec compute-branch-name --impl-branch-slug <slug> --run-slug <run> --batch-slug <batch>`.
   - Run `gt create <branch-name> -m "<message>"` for a new batch branch, or `gt modify -m "<message>"` when updating the current generated branch.
6. After all batches pass:
   - `gt submit --no-interactive`.
   - Render dashboard: `roaster stack exec render-dashboard --impl-branch <branch> --impl-branch-slug <slug> --profile-slug <profile> --run-slug <run>`.
   - Post the rendered Markdown to the target PR.

## Resolver JSON

For `record-batch`, provide JSON like:

```json
{
  "status": "completed",
  "summary": "What changed.",
  "files_changed": ["path/to/file.py"],
  "validation": [
    {"command": "just test", "status": "passed", "output_summary": "passed"}
  ],
  "safety": {"destructive": false, "security_sensitive": false, "notes": "No concerns."}
}
```

The command re-runs the manifest validation requirements and independently checks touched-file scope, conflict markers, and deletions. Advisory safety flags are recorded but do not mechanically block.

## Halt/resume report

When halted, report:

- batch slug and status;
- gate issues and validation command output summaries;
- manifest/resolver locators from the command output;
- current branch and whether working tree edits remain;
- exact next command to resume after the user decides how to proceed.
