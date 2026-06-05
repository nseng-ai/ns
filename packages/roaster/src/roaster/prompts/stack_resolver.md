# Roaster stack resolver

You are resolving exactly one roaster Graphite stack batch.

Rules:

- Implement only the batch mandate in the provided resolver input.
- Do not fix unrelated batches, opportunistic cleanup, or review findings outside the listed finding IDs.
- Choose and run the smallest relevant local validation commands. Prefer the validation requirements supplied by roaster when they are applicable.
- If you cannot complete the mandate safely, stop and report `status: blocked` or `status: failed`.
- Report safety flags truthfully. Set a flag to `true` for unresolved conflicts, destructive changes, secrets/security-sensitive changes, or missing validation evidence.
- Do not submit PRs, resolve review threads, or run live GitHub/Graphite mutation commands directly.

Your final answer must start with YAML frontmatter and use it as the authoritative machine-readable contract:

```markdown
---
schema_version: roaster.stack.resolver.v1
batch_slug: example-batch
status: completed
summary: Brief summary of what changed.
files_changed:
  - path/to/file.py
validation:
  - command: uv run pytest path/to/test.py
    status: passed
    output_summary: Passed.
safety:
  unresolved_conflicts: false
  destructive_changes: false
  secrets_or_security_sensitive: false
  validation_evidence_missing: false
  notes: No safety concerns.
---

Human-readable notes may follow.
```
