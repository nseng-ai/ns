# pr-make-accountable

Interview a PR's author until author and agent share an accurate understanding
of a change, with the goal of producing a crisp, clear, authentic PR description
that communicates the rationale and context behind the change.

The name is a double entendre: the author is accountable for what the agent has
done, and accountable to their collaborators for producing non-slop descriptions.

## Why this exists: Writing is thinking

Auto-generated PR descriptions are usually a failure mode of agentic engineering.
They are walls of text — slop-filled inventories of a diff rather than a
coherently framed, human PR description.

Intent, constraints, rejected alternatives, and accepted risks live in the
author's head and are not legible from the contents of the PR. It is critical
to communicate them in the description.

The problem runs deeper than bad prose. Agents work on your behalf and make
decisions you are not aware of or do not fully understand. This interview
process develops a shared understanding between the agent and the human
ultimately accountable for the change. More often than not it yields real
changes to the PR itself: there is a reflexive relationship between PR prose
and the code.

The skill deliberately slows authors down to increase an organization’s
capacity to produce high-quality software. It reduces review bottlenecks and
improves the conceptual coherence of each change.

## How it works

1. The agent inspects the PR and identifies the intent, rationale, and design
   decisions that the code and commit history cannot explain.
2. The agent interviews the author about those gaps, politely challenging
   unclear reasoning, misunderstandings, and decisions that may need changes.
3. The author can amend the PR before continuing. Once author and agent share
   an accurate understanding, they co-author a complete PR description.
4. The author reads and approves every claim before the agent updates the PR.
   The agent then reports any remaining reviewability concerns and open topics.

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

## Example

See [PR #3940](https://github.com/nseng-ai/ns/pull/3940), which used
`pr-make-accountable` to co-author the description for this documentation.
