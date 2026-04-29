---
name: objective-digest
description: 'Read-only objective dossier. Summarizes one objective across canonical and branch snapshots, including thesis, remaining work, and key findings.'
allowed-tools:
  - "Bash(objective exec digest *)"
  - "Bash(objective list *)"
---

# objective-digest

Render a one-page objective dossier from canonical and branch snapshots. The
CLI computes deterministic facts; the agent only fills prose placeholders in
the emitted template.

> For the canonical-vs-branch model, document anatomy, lifecycle, and shared
> rewrite rules, see `../objective/SKILL.md`.

## Goal

Brief a new agent or human on one objective: metadata, thesis, merged PRs,
remaining work, and durable findings. Read-only: do not write to brmem, mutate
git, modify PRs, or save the digest unless the user explicitly redirects
output.

## Ownership Boundary

The final digest is **agent-authored prose over CLI-provided facts**. The
boundary is explicit:

- **CLI (`objective exec digest`)** computes deterministic facts
  (associated PRs, branch snapshot count, master canonical metadata,
  merged-PR linkified bullet list, latest-snapshot pick) and emits raw
  Markdown blocks (master `body.md`, master `roadmap.md`, per-snapshot
  `notes.md` blocks) plus a literal output template. It does not summarize
  prose.
- **Agent (this skill)** copies the pre-rendered metadata and merged-PR
  list verbatim, and writes the Thesis, Remaining work, and Key findings
  sections by reading the embedded raw Markdown.

This is a deliberate boundary, not a half-finished pushdown. Promoting the
final prose into Python would require Markdown parsing and summarization,
which the canonicalization plan defers. Tests for `objective exec digest`
assert the prompt/template contract — presence of metadata rows, raw
Markdown blocks, and template scaffolding — not final digest prose
wording.

## Inputs

- **Slug, optional.** If present, pass it through. If omitted, let
  `objective exec digest` resolve from the current branch. If resolution
  fails, surface the CLI's error message verbatim and direct the user to
  `objective list`.

## Related Objective Views

| Need                                           | Use                       |
| ---------------------------------------------- | ------------------------- |
| "where am I in the current stack?"             | `objective-current`       |
| "What is this objective trying to accomplish?" | `objective-digest <slug>` |
| "What should I work on next?"                  | `objective-next <slug>`   |

## CLI Contract

`objective exec digest` does all the deterministic work and returns a
self-contained brief:

- pre-rendered metadata table and merged-PR list;
- raw master body for thesis;
- raw master roadmap for remaining work;
- raw per-snapshot notes for findings;
- literal output template.

## Workflow

1. Run:

   ```bash
   objective exec digest [slug]
   ```

   Pass the slug only when the user supplied one.

2. **If the command exits non-zero**, surface its stderr message
   verbatim. For `no_objective_on_branch` or `ambiguous_objective`,
   tell the user to run `objective list`.

3. **If the command succeeds**, follow stdout. Copy Steps 1-2 verbatim.
   Fill Steps 3-5 from the master body, master roadmap, and notes blocks.

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
  the merged-PR list.
- Print to stdout only.
