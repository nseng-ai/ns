# pr-make-accountable

Interview a PR's author until author and agent share an accurate understanding
of the change, then co-author a PR description that proves it.

## Why this exists

Auto-generated PR descriptions are a failure mode of agentic engineering. They
are long, mechanically assembled inventories of the diff — slop reviewers must
wade through, and often counterproductive: they restate what the code already
says while omitting what the code cannot say: *why*. Intent, constraints,
rejected alternatives, and accepted risks live in the author's head, not in the
diff.

The problem runs deeper than bad prose. Agents working on your behalf make
design decisions on your behalf — some you do not understand. A description
generated from the diff papers over that gap. This skill closes it.

## What it does

The skill inverts the usual direction: instead of generating a description
*for* you, it interviews *you*. It builds an inventory of the PR from the
evidence, then asks questions — politely, insistently — about the decisions
visible in the diff and the context the diff cannot supply, until every
material decision, tradeoff, and limitation has a shared, evidence-consistent
story.

Two problems get solved at once:

1. **The description problem.** The final body (What / Why / Changes / Reviewer
   focus) is drafted only from the shared interview record, so it carries
   rationale and judgment calls rather than a file listing — a far higher-value
   artifact for reviewers.
2. **The understanding problem.** The interview routinely surfaces undefended
   decisions, unintended behavior, or scope that should change. Discovering the
   PR needs work — and amending it before review — is a first-class outcome,
   not a failure of the process.

Writing is thinking: the description is the artifact that proves you understand
the change your name goes on.

## Provenance

The result is honest about how it was made. Every description ends with a
footer naming the exact model and harness that co-authored it:

```markdown
---

*PR description co-authored with `/pr-make-accountable` using `<model>` in `<harness>`.*
```

The draft is never final until the author reads every claim and approves it.
Accountability stays with the human; the footer makes the assistance visible.

## Usage

Point the skill at an existing PR (a number, a URL, or the current branch's PR)
in a repo with an authenticated `gh` session. See [`SKILL.md`](SKILL.md) for
the full procedure. The skill is standalone: it requires only `git` and `gh`.
