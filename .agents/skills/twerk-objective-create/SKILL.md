---
name: twerk-objective-create
description: "Create a GitHub issue that anchors a twerk objective — a multi-session workstream whose primitive operation is 'make progress' via the twerk-objective-progress skill. Use whenever the user wants to start an objective, capture a multi-session workstream in GitHub, turn a rough brief into an issue-backed objective, or set up a lightweight control plane for a related series of PRs. The issue body is a curated context anchor with completion criteria, assumptions, risks, and either a roadmap or loose next steps — not a plain task ticket. Apply the `twerk-objective` label, use plain markdown, and create the issue with `gh`."
allowed-tools:
  - "Bash(gh issue *)"
  - "Bash(gh label *)"
  - "Bash(git remote *)"
  - "Bash(mktemp)"
---

# twerk-objective-create

Create a GitHub issue that serves as the **context anchor** for a twerk objective.

## What an objective is

An objective is a multi-session workstream whose **primitive operation is
"make progress"**. A sibling skill (`twerk-objective-progress`) repeatedly reads the
issue, assesses the codebase, implements the next piece of work, and writes a
reconciliation comment back. The issue body is the stable spec + curated
context; the comments are the running progress log.

Three consequences shape this skill:

1. **Context anchoring.** The issue must give a fresh agent session enough
   curated context to start working *without re-deriving everything from
   scratch*. Not a research dump — a deliberately chosen set of pointers,
   constraints, and decisions. See Martin Fowler's
   [context anchoring](https://martinfowler.com/articles/reduce-friction-ai/context-anchoring.html).

2. **Structure follows the work.** Some objectives are genuinely exploratory
   and want loose prose plus a few next steps. Others are a roadmap of
   related PRs and want an ordered phase list that turns the objective into
   a lightweight control plane for a series of PRs. Pick the shape that
   matches what the user described — do not force one onto the other.

3. **Continuous re-evaluation.** After each unit of progress, the objective
   body is completely re-evaluated — not just appended to. Claims are
   verified against the current codebase (which may have shifted while work
   was in flight). Assumptions are re-checked. External processes or humans
   may add comments to the issue that should be incorporated into the
   high-level description. The objective body always reflects current
   reality, not the state of the world when it was first written.

An objective is **not** a plain issue. If the work is a single task that fits
in one session with no need for preserved context across sessions, it should
be a normal issue, not a twerk objective.

## Goal

Create one GitHub issue that:

- states the outcome and concrete completion criteria
- curates the context a future session will need (the anchor)
- names the assumptions the plan rests on and the risks that could invalidate them
- lays out roadmap vs. loose next steps at the right level of structure
- is labeled `twerk-objective` so it shows up in `twerk objective list`

## Core rules

- Start from the current conversation. Ask follow-ups only when a critical
  detail is missing.
- Curate context, don't dump it. Every bullet in the anchor should be there
  because a future session will actually need it.
- Match structure to the work. Do not force a roadmap onto a loose objective,
  and do not leave a multi-PR refactor as freeform prose.
- Always ensure the `twerk-objective` label exists before creating the issue.

## When to ask questions

Ask at most 1-3 short questions only when a critical detail is missing:

- the outcome isn't concrete enough to write completion criteria
- you can't tell whether this is loose/exploratory or a structured roadmap
- the scope has multiple plausible interpretations
- there are important constraints or non-goals that need confirmation

If the conversation already gives you enough, draft and create directly.

## Workflow

### 1. Decide the shape

Before drafting, classify the objective:

- **Loose / exploratory** — outcome is known but the path isn't. Use prose +
  `## Initial Next Steps`; skip the roadmap.
- **Structured / roadmap** — the user described phases, milestones, or a
  series of related PRs. Use `## Roadmap` with ordered, progressable items.
- **Hybrid** — a known first phase, then TBD. Use `## Roadmap` for the known
  part and mark later phases as open.

If the choice is non-obvious, tell the user which shape you picked and why.

### 2. Capture the objective

Pull from the conversation (and targeted codebase reads only when they improve
the anchor):

- target outcome
- completion criteria — concrete, verifiable conditions. `twerk-objective-progress`
  evaluates these each session and uses them to decide when the objective can
  be closed.
- the curated context anchor — files, modules, patterns, prior decisions,
  existing code a fresh session should read first
- assumptions the plan rests on, and risks that could invalidate them.
  `twerk-objective-progress` reviews these each session and flags invalidated ones.
- roadmap or initial next steps, depending on the shape
- scope boundaries and non-goals when they matter

Do not do broad codebase research just to make the issue look formal. Do
targeted reads when a specific pointer would meaningfully help a future
session; otherwise, rely on the conversation.

### 3. Draft the issue

Use `references/body-template.md` as the default shape. Omit sections that
are genuinely empty rather than leaving placeholders.

Title guidance:

- Lead with the concrete outcome.
- Readable as a future list entry.
- Avoid vague titles like "Investigate objective stuff" unless the objective
  really is exploratory.

Body guidance:

- Keep prose tight. Prefer bullets over paragraphs for the anchor sections.
- Under **Context Anchor**, write pointers a fresh agent can act on: file
  paths, module names, specific patterns to follow, prior decisions. Not
  background essays. Ask yourself: "if a new session read only this, could
  they start working?" Make pointers specific enough that a re-evaluation
  pass can verify they're still accurate.
- Under **Assumptions & Risks**, be explicit. Mark each item as an assumption
  or a risk. These are the things `twerk-objective-progress` checks each session.
  An assumption that was true at creation time may become false as code
  shifts, and external comments may surface new risks.
- Under **Completion Criteria**, phrase each criterion as a verifiable
  assertion that can be re-checked each session against the codebase.
- Under **Roadmap**, make items progressable: each should be something a
  single session can meaningfully advance, phrased as an outcome.

If the user explicitly wants to review the draft before issue creation, show
the draft and wait. Otherwise, create the issue once the objective is clear.

### 4. Ensure the label exists

```bash
gh label list --limit 200
gh label create twerk-objective --color 0e8a16 --description "Objective tracked by twerk"
```

If you need to confirm the target repository:

```bash
git remote get-url origin
```

### 5. Create the issue

Prefer `--body-file` over inline shell quoting.

```bash
gh issue create --title "<title>" --body-file <temp-file> --label twerk-objective
```

The issue body is the full objective record. Do not create a follow-up
metadata comment — progress updates are posted later by `twerk-objective-progress`.

### 6. Report the result

Always return:

- issue number and URL
- final title
- which shape you used (loose / roadmap / hybrid)
- confirmation that `twerk-objective` was applied
- a one-line summary of what the issue captures

If you created the label during this run, mention it explicitly.

## Anti-patterns

- Treating the issue as a plain task ticket. An objective is a context anchor
  for repeated progress sessions.
- Dumping raw research into the body instead of curating pointers. If a
  bullet wouldn't actually help the next session, cut it.
- Forcing a roadmap onto a loose objective, or leaving a structured multi-PR
  workstream as freeform prose.
- Omitting completion criteria — `twerk-objective-progress` can't evaluate closure
  without them.
- Omitting assumptions and risks — they are how future sessions detect that
  the plan has drifted.
- Generating metadata blocks, YAML frontmatter, or comment-backed storage
  models. Plain markdown only.
- Creating the issue without the `twerk-objective` label.
- Treating the objective body as a static document written once at creation.
  The body is continuously re-evaluated and rewritten by
  `twerk-objective-progress` — author it with that lifecycle in mind.
- Asking a long interview before drafting anything.
