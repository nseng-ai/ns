---
name: objective
description: "Conceptual reference for the twerk objective subsystem — multi-session workstreams anchored in GitHub issues labeled `objective`. Covers what an objective is, the body-as-state / comments-as-history contract, the `Objective: #N` commit trailer convention, the create → progress → reconcile → close lifecycle, and the anatomy of an objective body (outcome, context anchor, completion criteria, assumptions & risks, roadmap). Fires on any prompt mentioning objectives — conceptual questions ('how do objectives work', 'explain the objective lifecycle'), ad-hoc operations outside the four operation skills, AND alongside objective-create / objective-list / objective-progress / objective-reconcile as shared grounding. The four operation skills own their workflows and reference this skill for shared concepts and templates rather than re-deriving them. Read-only — no state mutation."
allowed-tools: []
---

<!-- PUBLIC SKILL: Do not reference twerk-internal module paths or class names in this file. Describe CLI operations, not implementation. See AGENTS.md § "Public Skill Authoring". -->

# objective

Conceptual reference for the twerk objective subsystem. This skill does not
perform operations. Use it as shared grounding alongside the four operation
skills (`objective-create`, `objective-list`, `objective-progress`,
`objective-reconcile`), and as a landing spot for ad-hoc questions or
operations that don't map cleanly to any of them.

## What an objective is

An objective is a multi-session workstream whose **primitive operation is
"make progress"**. It is a GitHub issue labeled `objective`. A sibling skill
(`objective-progress`) repeatedly reads the issue, assesses the codebase,
implements the next piece of work, and writes a reconciliation comment back.
The issue body is the stable spec + curated context; the comments are the
running progress log.

Three consequences shape everything else:

1. **Context anchoring.** The issue must give a fresh agent session enough
   curated context to start working _without re-deriving everything from
   scratch_. Not a research dump — a deliberately chosen set of pointers,
   constraints, and decisions. See Martin Fowler's
   [context anchoring](https://martinfowler.com/articles/reduce-friction-ai/context-anchoring.html).

2. **Structure follows the work.** Some objectives are genuinely exploratory
   and want loose prose plus a few next steps. Others are a roadmap of
   related PRs and want an ordered phase list that turns the objective into
   a lightweight control plane for a series of PRs. Shape the body to match
   what the work actually is.

3. **Continuous re-evaluation.** After each unit of progress, the objective
   body is completely re-evaluated — not just appended to. Claims are
   verified against the current codebase (which may have shifted while work
   was in flight). Assumptions are re-checked. External processes or humans
   may add comments to the issue that should be incorporated into the
   high-level description. The objective body always reflects current
   reality, not the state of the world when it was first written.

An objective is **not** a plain issue. If the work is a single task that
fits in one session with no need for preserved context across sessions, it
should be a normal issue, not a twerk objective.

## Lifecycle

```
objective-create  →  objective-progress (repeated)  →  objective-reconcile (per merged PR)  →  close
```

- **Create** (`objective-create`): draft the initial issue with outcome,
  context anchor, completion criteria, assumptions & risks, and either a
  roadmap or initial next steps. Apply the `objective` label.
- **Progress** (`objective-progress`): read the issue body, assess the
  codebase, pick the next useful piece of work, implement it, post a
  reconciliation comment, and rewrite the body to reflect current reality.
  Runs repeatedly across sessions.
- **Reconcile** (`objective-reconcile`): after a PR merges, read the merged
  PR, rewrite the objective body, and post a reconciliation comment as the
  log entry for that PR.
- **Close** (offered by both `objective-progress` and `objective-reconcile`
  when all completion criteria are met): post a closure comment using
  `references/closure-comment-template.md` and close the issue.

## Body / comments contract

**The body is the current-state snapshot.** It is continuously rewritten by
`objective-progress` and `objective-reconcile` to reflect what's been done,
what remains, what constraints are in force, and which assumptions still
hold. A fresh session can read the body alone and understand where the
objective stands.

**The comments are the history.** Each reconciliation comment is an
append-only log entry tied to a specific unit of progress or a merged PR.
They accumulate; they are not rewritten.

Operational rules that follow:

- Read the body by default. Do not load comments unless the body is
  ambiguous, internally inconsistent, or stale relative to in-flight work.
- When comments are needed, focus on the most recent reconciliation comment
  first and stop as soon as you have what you need.
- After any unit of progress, both outputs are produced: the body is
  rewritten in place, and a new reconciliation comment is posted.

## Anatomy of an objective body

See `references/body-template.md` for the canonical shape. The sections are:

- **Outcome** — the target state in one or two sentences. Concrete enough
  that someone unfamiliar with the work can tell whether it was achieved.
- **Context Anchor** — curated pointers a future session will actually need:
  file paths, module names, patterns to follow, prior decisions. Not
  background essays. Ask: "if a new session read only this, could they start
  working?"
- **Completion Criteria** — concrete, verifiable conditions.
  `objective-progress` and `objective-reconcile` evaluate these each session
  and use them to decide when the objective can be closed. Phrase each as a
  re-checkable assertion.
- **Assumptions & Risks** — the things that could invalidate the plan, each
  marked explicitly as an assumption or a risk. Reviewed every session;
  assumptions that become false change the plan.
- **Roadmap** _or_ **Initial Next Steps** — the shape depends on the work.
  Structured roadmaps suit a known series of related PRs; loose next steps
  suit exploratory workstreams. See **Sequence patterns** below for
  roadmap shapes.

## The `Objective: #N` trailer convention

Every commit made in service of an objective must include an
`Objective: #<number>` trailer in the commit message:

```
Add GitHub gateway types and ABC

Objective: #23
Co-Authored-By: ...
```

This is how `objective-progress` auto-detects which objective to resume from
a branch's in-flight commits, and how `objective-reconcile` auto-detects
which objective a merged PR advances. Without the trailer, both operations
fall back to asking the user.

Auto-detection rules:

- **objective-progress**: scan commits reachable from `HEAD` but not from
  the repo's trunk/default branch (i.e., `<merge-base>..HEAD`). Parse
  `Objective: #N` trailers. If exactly one number appears (even across
  multiple trailers), use it automatically. If multiple different numbers
  appear, ask the user to disambiguate.
- **objective-reconcile**: scan the PR's commit messages via
  `gh pr view <pr> --json commits`. Same disambiguation rules.

## Sequence patterns

When an objective uses a structured roadmap, the shape of item 1 matters —
it determines how the objective proves progress. Four patterns, each with a
full definition and example in `templates/`:

- `templates/steelthread.md` — **steelthread / vertical slice**. Item 1 is a
  minimal end-to-end slice proving the concept works. Fits multi-layer work
  where proving integration early is valuable.
- `templates/incremental-refactor.md` — **incremental refactor**. Items are
  a sequence of small, risk-free restructures of existing code. Fits broad
  behavior-preserving refactors.
- `templates/layered.md` — **layered / foundational**. Item 1 is a substrate
  (new abstraction, module, or data model) that nothing uses yet. Fits work
  where no end-to-end path exists until the substrate lands.
- `templates/parallel.md` — **parallel / fan-out**. Items are independent
  work on different parts of a surface. Fits migrations and cleanup passes
  across many similar pieces.

Pick the closest pattern and note any deviations in the objective body.

## Shared references

- `references/body-template.md` — canonical issue body shape used by
  `objective-create` when drafting a new objective.
- `references/reconciliation-comment-template.md` — reconciliation comment
  used by both `objective-progress` (mid-objective work) and
  `objective-reconcile` (post-merge). Replace `<caller>` in the footer with
  your skill name.
- `references/closure-comment-template.md` — closure comment used by both
  `objective-progress` step 6b and `objective-reconcile` step 8 when all
  completion criteria are met. Replace `<caller>` in the footer.

## Operation skill index

- `objective-create` — draft and file the initial GitHub issue for a new
  objective.
- `objective-list` — display current objectives (read-only entry point).
- `objective-progress` — pick up an existing objective, implement the next
  piece, post a reconciliation comment, rewrite the body.
- `objective-reconcile` — after a PR merges, update the objective body and
  post a reconciliation comment as a log entry.

## Shared anti-patterns

- Treating the issue as a plain task ticket instead of a context anchor for
  repeated progress sessions.
- Treating the body as a static document written once at creation. The body
  is continuously re-evaluated and rewritten — author every section with
  that lifecycle in mind.
- Dumping raw research into the body instead of curating pointers. If a
  bullet wouldn't actually help the next session, cut it.
- Omitting completion criteria — without them, no session can evaluate
  closure.
- Omitting assumptions and risks — they are how future sessions detect that
  the plan has drifted.
- Committing objective work without an `Objective: #N` trailer, which
  silently breaks auto-detection in progress and reconcile.
- Loading the comment thread by default. The body is the current snapshot;
  comments are history and only matter when the body is ambiguous or stale.
