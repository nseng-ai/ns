---
name: objective-digest
description: 'Read-only objective dossier. Summarizes one objective across canonical and branch snapshots, including thesis, remaining work, and key findings.'
allowed-tools:
  - "Bash(objective exec digest *)"
  - "Bash(objective list *)"
---

# objective-digest

Render a one-page Markdown digest of an objective from canonical and branch
snapshots. The skill runs inline in the calling agent: the CLI does the
deterministic work, so the model only needs to fill prose placeholders
into a pre-built template.

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
  fails, surface the CLI's error message verbatim and direct the user to
  `objective list`.

## Related Objective Views

| Need                                           | Use                       |
| ---------------------------------------------- | ------------------------- |
| "What branch am I on and what is around me?"   | `objective-current`       |
| "What is this objective trying to accomplish?" | `objective-digest <slug>` |
| "What should I work on next?"                  | `objective-next <slug>`   |

## How it works

`objective exec digest` does all the deterministic work and returns a
self-contained brief: pre-computed metadata table, pre-rendered merged
PR list (linkified), raw master body for the thesis, raw master roadmap
for remaining work, raw per-snapshot notes for findings, and the
literal output template. You only need to fill the prose placeholders.

## Workflow

1. Run:

   ```bash
   objective exec digest [slug]
   ```

   Pass the slug only when the user supplied one.

2. **If the command exits non-zero**, surface its stderr message
   verbatim. For `no_objective_on_branch` or `ambiguous_objective`,
   tell the user to run `objective list`.

3. **If the command succeeds**, follow the brief on stdout: it walks
   you through five steps (metadata, merged PRs, thesis, remaining
   work, findings) plus the output template. Steps 1–2 are verbatim
   blocks — copy them as-is. Steps 3–5 are prose: read the master
   body, master roadmap, and notes blocks, then emit the filled
   template.

4. Print the filled digest as the answer. Do not add commentary above
   or below the digest when the user asked for the digest itself.

## Public Invariants

The brief enforces these externally visible invariants:

- Title: `# \`<slug>\` — digest`
- Exactly three metadata rows: Associated PRs, Branch snapshots, Master
  canonical — already pre-rendered by the CLI.
- Sections in order: Thesis, Merged PRs, Remaining work, Key findings.
- Merged PRs is a linkified bullet list (`- [#N](url) — title`) sorted
  by PR number, pre-rendered by the CLI; render `_No merged PRs yet._`
  when none exist.
- Remaining work is one bullet per unfinished roadmap slice
  (`- **<slice headline>.** <one short sentence>`).
- Key findings bullets are each one short sentence after the headline —
  no semicolons, no compound clauses.
- No slice table, Markdown-derived progress counts, or prose-derived
  attribution. The CLI computes counts, the latest-snapshot pick, and
  the merged-PR list; you supply only prose for thesis, remaining work,
  and findings.
- Print to stdout only.
