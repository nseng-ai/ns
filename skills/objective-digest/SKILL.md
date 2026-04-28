---
name: objective-digest
description: 'Read-only objective dossier. Summarizes one objective across canonical and branch snapshots, including thesis, slice progress, PR state, readiness, and key findings.'
allowed-tools:
  - "Task"
  - "Bash(objective exec digest *)"
  - "Bash(objective list *)"
---

# objective-digest

Render a one-page Markdown digest of an objective from canonical and branch
snapshots. Keep the coordinator light; delegate dense reading when the current
harness allows it.

> For the canonical-vs-branch model, document anatomy, lifecycle, and shared
> rewrite rules, see `../objective/SKILL.md`.

## Goal

Brief a new agent or human on an objective in a single read: top-level
metadata, a distilled thesis, and durable findings. The operation is
read-only: do not write to brmem, mutate git, modify PRs, or save the digest
unless the user explicitly redirects output.

## Inputs

- **Slug, optional.** If present, pass it through. If omitted, let
  `objective exec digest` resolve from the current branch. If resolution
  fails, surface the CLI's `error.message` verbatim and direct the user to
  `objective list`.

## Related Objective Views

| Need                                           | Use                       |
| ---------------------------------------------- | ------------------------- |
| "What branch am I on and what is around me?"   | `objective-current`       |
| "What is this objective trying to accomplish?" | `objective-digest <slug>` |
| "What should I work on next?"                  | `objective-next <slug>`   |

## Delegation

Use one competent read-only worker when harness policy permits. Do not override
local model/subagent policy just for this skill.

The worker may run:

```bash
objective exec digest [slug] --format json
```

- **Preferred:** worker reads `references/digest-worker.md`, runs the CLI,
  and returns only the final digest or CLI error message.
- **Worker lacks shell:** coordinator runs the CLI and passes the JSON payload;
  worker must not run commands.
- **No subagents allowed:** coordinator reads `references/digest-worker.md`
  and executes the contract inline.

Do not load the worker reference in the coordinator when the worker can read
it. Do not paste raw objective blobs into coordinator context unless the worker
cannot run shell commands.

## Worker Prompt

Adapt this brief to the current harness:

```text
Read the bundled objective-digest reference at
references/digest-worker.md and follow it.

Inputs:
- objective slug: <slug, or omitted/current branch resolution>
- mode: run `objective exec digest [slug] --format json` yourself

Return exactly one of:
- the final Markdown digest
- the CLI error message verbatim if the command fails

Do not write files, mutate brmem/git/GitHub, or include process notes.
```

If the coordinator already ran the CLI because the worker cannot use shell
tools, replace the mode line with:

```text
mode: use the JSON payload below; do not run any shell command
```

## Coordinator Workflow

1. Choose the routing path above.
2. Send the worker prompt. Include the slug only if the user supplied one.
3. If the worker/CLI reports an error, surface `error.message` verbatim. For
   `no_objective_on_branch` or `ambiguous_objective`, tell the user to run
   `objective list`.
4. Lightly sanity-check successful worker output against the public contract:
   - title is `# \`<slug>\` — digest`
   - includes `## Thesis` and `## Key findings (binding for future work)`
   - contains the three metadata rows
5. Print the digest as the answer. Do not add commentary above or below the
   digest when the user asked for the digest itself.

## Public Invariants

The worker contract lives in `references/digest-worker.md`. The coordinator
preserves only these externally visible invariants:

- Title: `# \`<slug>\` — digest`
- Exactly three metadata rows: Associated PRs, Branch snapshots, Master
  canonical.
- Sections in order: Thesis, Key findings, optional warning block.
- No slice table, Markdown-derived progress counts, or prose-derived
  attribution.
- Warnings include only raw CLI warnings.
- Print to stdout only.
