# Commit-message narration convention

Task artifact for the **Commit-message narration convention** roadmap row of the
`stack-smush` Objective. This is the run-building convention: how an agent producing
a **Commit Run** writes commits so that **Packaging** (smush) can later slice the run
into **Decision PRs** and **Span PRs** from prose alone. It is written as skill-ready
prose — an authoring agent should be able to lift these sections into the run-building
side of a skill with minimal reshaping.

Grounding: the resolved Commit-run contract and Packaging semantics rows in
`../roadmap.md`, the frontier grilling resolutions in
`../updates/20260710T111652Z-frontier-grilling-session-resolutions.md`, the packaging
mechanics resolution in
`../updates/20260710T122903Z-packaging-mechanics-design-resolved.md`, and the
canonical vocabulary (Commit Run, Packaging, Decision PR, Span PR, Slice Map, Span
Squash) in the root `CONTEXT.md`.

## What you are producing

The branch is the run. A Commit Run is a linear, merge-free sequence `trunk..tip` on
one feature branch — no merge commits, no run IDs, no manifests, no state beyond the
branch itself (Commit-run contract, resolved 2026-07-10). You are not deciding PR
boundaries while you work: decision/span classification happens at packaging time,
not production time. Packaging reads your commit messages, infers which commits carry
high-impact choices, and holds override authority — it may promote a commit you
thought minor into a Decision PR, or demote one you thought pivotal into a span.

That inversion is the whole convention. There are **no structured markers**: no
`Smush-Decision:` trailer, no magic subject prefixes, no metadata scheme of any kind
(settled; do not reintroduce one). Narrative prose is the only decision signal, so
the quality of packaging rests entirely on how well each message narrates what
happened and why. Write every commit message for a reader who will arrive later, see
only `git log`, and have to partition the run into "choices worth careful human
review" and "consequences of those choices."

## Narrated intent: make decisions legible

When a commit embodies a choice — an interface shape, a dependency taken or refused,
a design fork where a plausible alternative existed — say so in the message body, in
the form of the choice:

> Chose X over Y because Z.

Name the alternative you rejected and the reason it lost. This is the single
highest-leverage sentence you can write, because it is exactly what packaging looks
for when deciding whether a commit anchors a Decision PR: one high-impact choice plus
the commits needed to judge it in isolation (Packaging semantics, resolved
2026-07-10). A message that only describes the edit ("add retry wrapper") hides the
decision; a message that narrates it ("wrap the gateway in a bounded retry — chose
per-call budgets over a global circuit breaker because callers already own timeout
policy") lets packaging find the cut without re-deriving your reasoning from the
diff.

Concretely:

- **Subject line**: imperative, specific, and honest about scope — it is what a
  human scans in the Slice Map and what survives into squash digests.
- **Body for decision-bearing commits**: one short paragraph of why-prose. State the
  choice, the alternative(s) considered, the deciding reason, and — when it exists —
  what would falsify the choice or force revisiting it. This paragraph is durable: the
  packaging design keeps a decision boundary commit's why-paragraph as the rationale
  that classification carries before submission.
- **Body for consequence commits**: a sentence or two is enough. Say what step this
  is in the plan you are executing ("mechanical rename following the gateway split
  two commits back"). Explicitly linking a commit to the decision it executes helps
  packaging group maximal stretches into Span PRs.
- **Do not self-classify.** Never write "DECISION:" or "span commit" or otherwise
  pre-partition the run. You may naturally emphasize that something was a
  considered choice — that emphasis *is* the signal — but classification vocabulary
  belongs to packaging, which judges from prose and may overrule you.

When in doubt about whether something was "a decision," narrate it as if it were:
the cost of an extra why-paragraph is trivial, and packaging can demote freely.
The unrecoverable failure mode is the silent choice — a load-bearing alternative
rejected with no trace in the log, which packaging can only misfile as span filler.

## Granularity: one coherent semantic step per commit

Each commit is one coherent semantic step — a unit a reader can name in a sentence
and judge as a whole. Not one file, not one keystroke-sized diff, and not "everything
I did before lunch."

Guidance that follows from how packaging consumes the run:

- **Separate the choice from its fallout.** If a decision forces a wide mechanical
  consequence (a rename sweep, call-site updates, regenerated fixtures), put the
  decision and its minimal demonstration in one commit and the mechanical propagation
  in the next. Packaging builds a Decision PR from "one high-impact choice plus the
  commits needed to judge it in isolation" — a decision buried inside 400 lines of
  fallout cannot be judged in isolation, and the cut lands badly.
- **Do not entangle unrelated steps.** A commit that both fixes a bug and reshapes an
  interface forces packaging to either split hairs or misclassify. If you notice two
  stories in one staged diff, commit them separately.
- **Small is recoverable, smeared is not.** Packaging can merge a too-fine stretch of
  commits into one span (interior span commits vanish at Span Squash, their subjects
  preserved in a narration digest). It cannot cleanly split a too-coarse commit —
  the surveyed mechanics slice at commit boundaries only, and `gt split` is unusable
  by agents (`graphite-slicing-mechanics-survey.md`). Err toward finer commits with
  honest messages.
- **Course corrections are steps too.** If you reverse or rework an earlier commit in
  the same run, say so and say why ("back out the per-call budgets from three commits
  ago — real traces show callers share one deadline"). A narrated reversal is
  packaging signal; a silent one is noise that degrades the whole stretch.

Do not rewrite history to fake elegance. The run is allowed to look like real work.
Packaging exists precisely so the production side does not have to produce
review-shaped commits; your obligation is legibility, not curation.

## Greenness: tip green, interior may be red

The greenness contract (Commit-run contract, resolved 2026-07-10) is deliberately
asymmetric:

- **The run tip must validate.** Before the run is offered for packaging, its tip
  passes the repo's validation entrypoint (`just` in this repo). A red tip is not a
  packageable run — fix forward until it is green.
- **Interior commits may be red.** You are not required to keep every intermediate
  commit green, and you must not squash, reorder, or delay commits merely to preserve
  interior greenness. A red interior commit inside a span disappears at Span Squash;
  its message still matters (it feeds the narration digest), but its buildability does
  not.
- **Slice boundaries are packaging's problem, not yours.** Packaging verifies each
  proposed boundary SHA with `just` in a temporary worktree and makes boundaries green
  by moving the cut or adding a fix-forward commit into the slice
  (`../updates/20260710T122903Z-packaging-mechanics-design-resolved.md`). You do not
  know where the cuts will fall, so do not try to pre-position green commits at
  imagined boundaries.

One production-side courtesy follows from that mechanic: since cuts prefer green
commits, a run where the *natural* seams — the moments a semantic step completes —
tend to validate gives packaging more freedom to cut where the story says to cut,
rather than where the build allows. Treat that as a lean, not a rule: when finishing
a coherent step, leaving the tree green at that commit is nice-to-have; the only hard
requirement remains the tip.

## Summary for skill authors

Liftable one-paragraph form: build the run as a linear, merge-free branch off trunk;
one coherent semantic step per commit; narrate intent in every message and, wherever
a real alternative existed, write the choice as "chose X over Y because Z" in the
body — no markers, trailers, or self-classification, since packaging infers
decisions from prose and holds override authority; separate choices from their
mechanical fallout; prefer finer commits over smeared ones because packaging can
merge but never split; keep the tip green, let interior commits be red, and leave
boundary greenness to packaging.
