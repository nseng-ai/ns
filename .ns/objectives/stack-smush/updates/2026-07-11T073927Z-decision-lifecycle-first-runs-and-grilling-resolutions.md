# Decision lifecycle: first real runs and grilling resolutions

Two live packaged stacks ran the post-submit decision lifecycle end to end by hand,
and a live grilling session (2026-07-11) resolved how that lifecycle gets encoded
into the process. This update records both.

## The manual runs

**Run 1 — `extension-feedback/follow-up-cleanups--*` (PRs #3364–#3371).** All eight
PRs retitled with `[decision]`/`[span]` prefixes derived from the branch-name grammar.
The four decision PRs (#3364, #3366, #3368, #3370) received isolated
`<!-- ns-decisions-log:begin/end -->` blocks stating the pending human decision, a
recommendation, and alternatives. Those four decisions remain **pending**; they have
no committed decision records yet.

**Run 2 — `flow-deepening-smush--*` (PRs #3377–#3381).** Same retitling and
decisions-log treatment, then the full loop: each decision PR was walked bottom-up
(`gt checkout` / `gt up`), the decision presented with a recommendation, and on the
human's answer (all three accepted by @schrockn, 2026-07-10) a decision record was
committed on the decision branch itself as a Semantic Update under
`flow-deepening-round-2` (via `gt modify -c`, descendants auto-restacked, branches
force-pushed with lease), and the PR mirror flipped from Pending to Accepted with a
pointer to the committed record.

Observations that shaped the resolutions below:

- Flow's managed-region body policy preserved the decisions-log blocks across body
  edits with zero changes — preserve-opaque already works; it is just untested and
  unwritten as a contract.
- Flow title regeneration would strip the classification prefixes; titles need
  grammar-aware handling before `ns flow submit` is safe to rerun on a packaged stack.
- The owning Objective was inferable by inspection in both runs, but nothing records
  it; the decide loop had to rediscover it.
- `gt submit` scope (trunk-to-current) is too broad when a packaged stack sits above
  another session's in-flight stack; run 2 pushed with `git push --force-with-lease`
  scoped to the five stack branches instead.

## Grilling resolutions (live session, 2026-07-11)

1. **Placement:** all decision-lifecycle question rows live on this Objective.
   Flow-package implementation slices respect flow's consumer-neutrality; graduation
   to a separate Objective only if the lifecycle outgrows this one.
2. **Classification rendering:** `[decision]`/`[span]` **title prefixes** plus the
   grammar-bearing branch names; **no labels** — automation parses `headRefName`
   grammar directly, so labels are consumer-less and Parked. Amends the review-policy
   row's earlier "labels" direction.
3. **Decisions-log contract:** the decision record committed on the decision branch is
   canonical; the PR block is a subordinate mirror flow treats as opaque human-owned
   text (preserve-opaque). Render-from-record is Parked behind observed drift.
4. **Decide surface:** skill-first, matching v1 philosophy — a post-submit decide
   skill encodes the loop; the deterministic CLI push-down is Parked
   (objective-side, never the flow package) behind repetition evidence.
5. **Objective linkage:** bound at **smush time** — the skill takes the owning
   Objective as invocation input and records the packaging event as a Semantic Update
   under it (chosen over commit-message trailers and brmem so linkage lives in the
   Objective's own update stream). Partially graduates the objectives-interaction Fog
   item.

## Roadmap changes

Four new task rows (classification-aware PR titling in flow submit; decisions-log
convention; decide-skill authoring; smush-time objective binding), a revision note on
the resolved review-policy row, and three new Parked entries (PR labels,
render-from-record, decide CLI push-down).

## Completion Criteria status

Criterion 2 ("proved on real work") is **partial**: two real stacks are packaged,
classified, and (run 2) decided and encoded, but neither has landed through the land
path yet. Run 1's four decisions are still pending and lack committed records — the
decide skill's first target once authored.
