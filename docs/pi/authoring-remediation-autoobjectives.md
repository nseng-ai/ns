# Authoring a Remediation Autoobjective

**Status:** Written 2026-06-30 from the `code-smell-roaster-remediation` build-out.

**What this is:** a procedural playbook for turning a large review/audit
backlog into a single execution-friendly ("auto") Objective that a runner can
work down slice by slice. It is the "how" companion to the conceptual design
brief in [Standing Objectives & Objective Runners](./standing-objectives-and-runners.md)
and the canonical spec in [`docs/objective-system.md`](../objective-system.md).
Read those for the model (the bounded↔standing / human↔autonomous axes, anti-goals,
and the optional `## Definition of Progress` / `## Runner Policy` sections). This
doc assumes that model and shows the assembly line.

Nothing here introduces new record shape, schema, registry, or lifecycle state.
A remediation autoobjective is an ordinary Objective record whose prose is
shaped well enough for autonomous pursuit. "Autoobjective" stays colloquial.

## When to use this

Reach for this pattern when **all** of the following hold:

- A review, audit, or sweep produced a **backlog far too large for one PR** —
  dozens to hundreds of independent findings (the seed run was 162 confirmed
  code smells across 47 packages).
- The findings are **mostly independent and package-local**, so they can be
  remediated in parallel slices rather than one ordered sequence.
- The work is **mechanical-ish and low-novelty per finding** — each has a
  documented fix, so a runner can execute a slice without re-deriving strategy.
- You want the backlog to **outlive this session** as durable, re-checkable
  source material rather than a chat transcript or a scratch file.

Do **not** use it when the backlog is small enough for one or two PRs (just fix
it), when findings are tightly coupled and must land in a fixed order (write a
normal bounded Objective with sequenced roadmap rows), or when each item needs
genuine design work (the per-finding "smallest fix" won't be trustworthy, so the
runner-policy autonomy is unsafe).

A remediation autoobjective is usually **bounded**, not standing: it closes when
every finding has a disposition. That distinguishes it from a maintain-forever
standing autoobjective like `eliminate-redundant-optional-undefined`, whose
finish line is retirement, not backlog exhaustion. (See that Objective's
`autonomous-objective-lessons.md` for the standing-loop variant.)

## The pipeline

```text
Sweep (multi-agent)  →  Adversarial verify  →  references/  →  roadmap clusters  →  policy + dispositions
   (Workflow)            (second-pass agent)    (durable        (one row per          (Definition of
                                                 source)          cluster)              Progress + Runner Policy)
```

## Step 1 — Sweep with a multi-agent Workflow

Partition the target tree and fan out one reviewer agent per partition, then
let the Workflow tool drive concurrency. Key choices that made the seed run
produce usable output:

- **Partition by package/area, ~20 source files per chunk.** Small enough that
  a reviewer reads each file in full; large enough that intra-package
  duplication is visible to a single agent.
- **Exclude what the review itself excludes.** The seed sweep dropped test
  files, vendored skills, and generated/`.venv` code up front. Reviewing
  out-of-scope code wastes tokens and produces findings you'll only dispose.
- **Cap findings per chunk (2–3 highest-conviction).** Uncapped reviewers pad.
  A cap forces ranking and keeps the backlog made of things worth doing.
- **Force structured output.** Give each reviewer a JSON schema
  (`smell`, `file`, `line`, `evidence`, `fix`, `severity`) so results aggregate
  without parsing prose.

Cost is real and worth stating up front so the author can budget: the seed run
spent ~244 agents and ~9.5M output tokens over ~30 minutes for 849 files. Scale
the partition count and per-chunk cap to the tree size and the budget.

> Gotcha from the seed run: `Workflow`'s `args` arrived as a JSON **string**,
> not a parsed array. Parse defensively at the top of the script
> (`typeof args === 'string' ? JSON.parse(args) : args`).

## Step 2 — Adversarially verify every finding

A single reviewer pass hallucinates line numbers, misquotes evidence, and
mislabels style nits as design smells. Pipe every raw finding through a second,
independent agent that **re-reads the actual file** and confirms or rejects it.
In the seed run this dropped 12 of 174 raw findings (~7%) — small in percent,
but those 12 would each have become a roadmap row a runner wasted a slice on.

Prompt the verifier to **default to reject** when evidence doesn't check out,
and to reject mislabels (a formatting/test-coverage complaint dressed as a
"smell") not just hallucinations. Use `pipeline()` so each finding verifies as
soon as its review completes, rather than a barrier between the two phases.

Verification is what makes the downstream `references/` trustworthy enough to
hand a runner with execution autonomy. Don't skip it.

## Step 3 — Preserve findings under `references/`

Write the confirmed findings into the Objective record as durable source
material, one file per cluster, with an index:

```text
.sdl/objectives/<slug>/
  references/
    README.md          # index: how the sweep ran, severity legend, cluster table
    <cluster>.md        # one per package/area; findings grouped by sub-package
```

This mirrors the `ts-cli-core-structural-cleanup` precedent. Rules that make it
work:

- **`references/` is source material, not current truth.** The repo moves
  between the sweep and pickup. Every reference file must tell the runner to
  **re-verify path, line, and that the smell still exists** before acting. Say
  this loudly in `README.md` and at the top of each cluster file.
- **Record the sweep's provenance and known gaps** in `README.md`: how it ran,
  raw-vs-confirmed counts, the severity legend, and — critically — what the
  sweep *couldn't* see. The seed sweep's reviewers each saw only their own
  partition, so **cross-package duplication is undercounted by construction**;
  the README states this so nobody mistakes the backlog for a ceiling.
- **Keep each finding's full evidence + smallest-fix**, not a one-line summary.
  The whole point is that a future runner acts without re-deriving the analysis.
- **Watch for filename collisions** with the record's own files — the seed run
  renamed the `objective` package's cluster file to `objective-package.md` so it
  wouldn't shadow the record's top-level `objective.md`.

## Step 4 — Cluster findings into roadmap rows

One roadmap row per `references/<cluster>.md` file. Not one row per finding —
that turns `roadmap.md` into a task database, which is an explicit anti-goal.

- **A row names the cluster, its finding count + severity split, and points at
  its reference file.** That's enough for a runner to pick a slice; the detail
  lives in `references/`.
- **Size a slice to one coherent, review-substantive PR.** The cluster is the
  default unit because it's how the smells were found and how ownership is
  easiest to reason about. Allow a large cluster to split into sub-package
  sub-rows at pickup time (the seed roadmap flags `infra`, `capabilities`, and
  `local/pi-tools` for this, and calls out the big god-file findings that each
  deserve their own slice).
- **Flag cross-Objective overlap in the row itself.** Where a cluster sits near
  another active Objective's open rows (the seed run's `infra`/`capabilities`
  clusters overlap `ts-cli-core-structural-cleanup`'s gateway-dedup and
  land-stack work), say so in the row so the first runner checks before
  duplicating effort.

## Step 5 — Runner policy and the disposition vocabulary

Write the optional `## Definition of Progress` and `## Runner Policy` sections
(see the design brief for the template). Two decisions specific to remediation
backlogs:

### Disposition, not just "done"

A finding has three honest outcomes, borrowed from
`ts-cli-core-structural-cleanup`'s "Classification" pattern. Bake these into
scope, completion criteria, and the runner loop:

- **fixed** — smell removed, validation evidence recorded.
- **disposed** — re-probed and the smell is no longer real, not worth the churn,
  or the prescribed fix would be worse than the smell. Requires rationale.
- **routed** — the finding belongs to another active Objective's ownership.
  Requires rationale and the target Objective named.

Completion is *every finding has a disposition*, not *every finding is fixed*.
Without the disposed/routed escape hatches, a stale or misjudged finding (and at
~160 findings there will be some) blocks closure forever or pressures a runner
into a bad refactor.

### Decide the autonomy ceiling explicitly

Pick where the runner stops on the human↔autonomous axis and write it as prose,
not a permission bit. The seed Objective chose **full pipeline up to PR
submission, never landing**: a runner may pick a cluster, fix it, validate, and
`gt submit` a PR per slice without asking each time, but a human reviews and
merges. State the keep/leave rule (local commits on a feature branch via the
`gt` workflow, never on `main`/`master`) and the hard "what will not happen"
list (no land/merge, no deploy, no GitHub mutation beyond opening the PR).

For a structural/quality backlog, also state **no observable behavior change**
as a non-goal and require existing-or-focused tests to confirm parity per slice.

## Step 6 — Execute the backlog with Objective Runner steps

Authoring stops at a runnable record; execution is a separate surface. The
supported runner for a remediation autoobjective is the Objective Runner step
workflow (ADR 0022): each step is one invocation of

```text
sdl objective exec runner-step <slug> [--guidance <text|@file>] [--model <m>] [--timeout <seconds>]
```

driven by a judging parent — the `objective-autorun` skill is the entry point
for running the backlog as repeated steps, and `objective-runner-step` is the
per-step parent playbook. (The earlier `/objective:autopilot` Pi command is
frozen legacy slated for deletion; do not use it.)

Each step dispatches a **fresh child session** that does exactly one coherent
slice for *this* Objective and leaves the work uncommitted; the runner then
deterministically verifies the tree the child left behind, **creates the commit
itself** with provenance trailers, and prints a Runner Checkpoint. The parent
reads the checkpoint and makes every between-step decision — continue, recover
with `--recover`, record a Semantic Update via `objective-update`, or stop.

This is where the Step 5 Runner Policy is consumed. The autonomy ceiling you
wrote maps onto parent behavior, not flags: a step budget given to
`objective-autorun` bounds a launch the way `--iterations` once did, and PR
submission is never runner behavior — the seed Objective's "full pipeline up to
PR submission, never landing" now means the parent (or human) submits the
resulting stack through the normal `gt`/flow workflow after the run.

Guards that make it safe to point at a ~160-finding backlog: the runner refuses
a dirty starting worktree (default mode), a detached HEAD, or a closed
Objective; it never commits on `main`/`master`, never pushes or submits, and
fails verification for a child that committed on its own. A verification
failure leaves the tree as the child left it and returns control to the parent,
whose biased default is one `--recover` re-dispatch with sharpened guidance;
anything that cannot be cleanly recovered stops for manual review.

Because each child re-derives its slice from `references/` plus current repo
state, the "re-verify at pickup" rule from Step 3 is enforced per iteration: a
stale finding is **disposed** by that iteration, not blindly fixed.

## What not to do

- **Don't make `roadmap.md` a per-finding queue.** Rows are clusters; findings
  live in `references/`.
- **Don't treat `references/` as current truth.** Always re-verify at pickup.
- **Don't write a run ledger.** Use `updates/` only for kept progress, reusable
  learnings (e.g. a finding that turned out stale), or policy refinements — not
  per-commit or per-slice changelogs.
- **Don't re-run the sweep mid-Objective** to find more. The backlog is fixed at
  creation; a fresh sweep is a new Objective if it's warranted.
- **Don't formalize the disposition words as schema.** `fixed`/`disposed`/
  `routed` are prose conventions in `roadmap.md`, not a state field.
- **Don't grant autonomy past the novelty the findings actually have.** The
  execution-friendly Runner Policy is only safe because each finding ships a
  trustworthy smallest-fix. If a cluster turns out to need design work, that's a
  steer-first / ask case, and the policy should say so.

## Worked example

`code-smell-roaster-remediation` is the reference implementation of this
playbook end to end:

```text
.sdl/objectives/code-smell-roaster-remediation/
  objective.md     # scope = 162 findings; no-behavior-change non-goal;
                   #   Definition of Progress + Runner Policy (submit, never land)
  roadmap.md       # 21 cluster rows, severity splits, cross-Objective overlap flags
  references/
    README.md       # sweep provenance, severity legend, 21-row cluster table
    infra.md … ts-root.md   # 21 cluster files, findings grouped by sub-package
```

Read it alongside this doc when authoring the next one.

## Relationship to other docs

- [Standing Objectives & Objective Runners](./standing-objectives-and-runners.md)
  — the conceptual model and anti-goals this playbook operates within.
- [`docs/objective-system.md`](../objective-system.md) — canonical record shape
  and operations.
- `skills/objective-create/references/execution-friendly-create.md` — the
  agent-facing interview/template guidance for the policy sections.
- `.sdl/objectives/eliminate-redundant-optional-undefined/autonomous-objective-lessons.md`
  — lessons from the *standing* (maintain-forever) autoobjective variant; useful
  contrast when your backlog has no natural exhaustion point.
