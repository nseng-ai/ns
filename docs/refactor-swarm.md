# refactor-swarm

A reusable, multi-agent workflow for applying one file-local change across many
files. It is the **execute** half of a refactor: a swarm of agents makes the edits
in parallel, an adversarial pass verifies the invariants, and you get a structured
report back.

The matching planning half is not a tool — it's the orchestrator (the agent you're
talking to) doing its job in the session.

## How you use it

Type:

```
refactor-swarm: <one-line intent>
```

for example `refactor-swarm: rename the OLD identifier to NEW everywhere`.

That kicks off two phases:

1. **Plan** — interactive, in this chat session.
2. **Execute** — the `refactor-swarm` workflow runs detached and returns a report.

## Plan is interactive in the session

A workflow runs detached and can't stop to ask you anything, so all the judgment
happens up front, with you in the loop. From your intent, the orchestrator:

- **drafts the shared brief** — the rules every per-file agent will apply;
- **discovers candidate files** with `git grep` plus judgment, skipping generated
  and historical paths;
- **classifies the work** into two tiers:
  - **simple** — files each decidable on their own (most renames land here),
  - **complex** — coordinated changesets where several files must change together
    (a moved entry point, a re-exported symbol, a split module);
- **asks you the ambiguous calls** and iterates until you approve the partition.

Files are partitioned so no file belongs to more than one agent — the agents edit
concurrently, so their file sets must be disjoint.

## Execute

Once the plan is locked, the workflow fans out:

- **simple tier** — one cheap agent per file, applying the shared brief (plus any
  file-specific hint). Defaults to a small, fast model.
- **complex tier** — one smarter agent per changeset, owning the whole coordinated
  multi-file edit. Defaults to a larger model; overridable per changeset.
- **verify** — one read-only, adversarial agent per invariant (e.g. "no residual
  references to OLD"), which defaults to failing when unsure.

Simple and complex edits run concurrently (disjoint files); verification runs after
the edits, since invariants read the whole tree.

## What you get back

A structured report:

- **summary** — counts: files changed, changesets done, invariants failed, judgment
  calls surfaced.
- **skips** — the headline feature. Every change an agent deliberately _didn't_ make
  because it was ambiguous or risky, with a one-line reason. This is where you look
  for the calls that need a human.
- **failures** — invariants that did not cleanly hold, with concrete evidence.
- **simple / complex / verify** — the full per-agent results.

## What it doesn't do (the brackets)

The workflow is the middle of the sandwich. It does **not**:

- move files (`git mv`) — the orchestrator does any moves _before_ the run;
- run the build/test gate — the orchestrator runs `uv sync` / `just` / `pytest`
  _after_ the run and reports the result.

## When to use / when not

**Use it** when the same shape of change applies to many files, each file is
transformable from its own contents plus a shared brief, and light per-file judgment
is acceptable.

**Don't use it** when the change requires unified judgment across files that can't be
captured in a brief, when the files aren't separable into disjoint units, or when a
single deterministic find-and-replace would do the job more cheaply.
