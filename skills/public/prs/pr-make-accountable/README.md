# pr-make-accountable

Interview a PR's author until author and agent share an accurate understanding
of a change, with the goals producing a crisp, clear, authentic PR descritption
that communicates the rationale and context behind a change. 

This is a double entrende: the author is accountable to what the agent has done,
and the author is accountable to their collaborators to produce nonslop descriptions.

## Why this exists: Writing is thinking

Auto-generated PR descriptions are usually a failure mode of agentic engineering. 
They walls of texts that are slop-filled inventories of a diff, rather than a
coherently framed, human PR description.

Intent, constraints, rejected alternatives, and accepted risks live in the author's
head, and are not legible from the contents of the PR. It is critical to 
communicate these in a description.

The problem runs deeper than bad prose. Agents do work your behalf, and themselves
are have made decisions you are not aware of or fully understand. This interview
process develops a shared understanding between the agent and the human ultimately
accountable for the change. More often than not this process yields true underlying
changes in the PR. There is a reflexive relationship between PR prose and the code.

## Provenance

The result is honest about how it was made. Every description ends with a
footer naming the exact model and harness that co-authored it:

```markdown
---

*PR description co-authored with `/pr-make-accountable` using `<model>` in `<harness>`.*
```

The draft is never final until the author reads every claim and approves it.
Accountability stays with the human; the footer makes the assistance visible.

## Install

```bash
npx skills add nseng-ai/ns --skill pr-make-accountable --full-depth
```

## Usage

Point the skill at an existing PR (a number, a URL, or the current branch's PR)
in a repo with an authenticated `gh` session. See [`SKILL.md`](SKILL.md) for
the full procedure. The skill is standalone: it requires only `git` and `gh`.
