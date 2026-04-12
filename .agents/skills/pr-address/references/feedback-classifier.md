# Feedback classifier — LLM guidance

This file is the heart of `pr-address`. After Phase 1 fetches review
threads, PR-level reviews, and discussion comments, the LLM (you) applies
the rules below to classify each item and group them into an ordered
execution plan.

Classification is **LLM-driven, not rule-based**. Tools change and users
have patterns of their own — the LLM judges free-form review content
better than brittle string-matching rules keyed off specific bot names.
If this file ever starts listing more than a handful of specific bot
accounts or magic strings, that's a smell: the judgment should be stated
as principles, not enumerations.

## Inputs

Three arrays from Phase 1:

- **threads**: inline review threads from `pr-address
  get-review-comments`. Shape is `PRReviewThread` in
  `twerk_core.gh.types` (pushed down — read the dataclass, not prose).
- **reviews**: PR-level review submissions with `{id, author, body, state,
  submittedAt}`. State ∈ {`APPROVED`, `CHANGES_REQUESTED`, `COMMENTED`}.
- **discussions**: top-level PR comments with `{id, author, body,
  html_url}`

Plus a set of `restructured_paths` (files renamed/copied since the base
ref).

## Outputs

A classification record per input item with one of these fields set:

- **Review threads:** always emit an explicit record with
  `classification: "actionable"` or `classification: "informational"`.
  Review threads are never dropped silently.
- **Review submissions / discussion comments:** `classification:
  "actionable"` → goes into an execution batch.
- **Review submissions / discussion comments:** `classification:
  "informational"` or dropped silently → may be collapsed into
  `informational_count` in the final summary.

Plus, for explicit thread records and actionable items: `action_summary`
(≤120 chars, describes the change needed or the user decision required),
`complexity` (see below for actionable items), `pre_existing` flag
(true/false), and the original `thread_id` or `comment_id` is carried
through.

## Review-thread completeness invariant

Every unresolved review thread from Phase 1 must appear exactly once in the
classifier output.

- If the user passed `--all`, resolved threads included for reference do not
  count toward this invariant.
- Unresolved review threads must never disappear into `informational_count`.
- Before returning the plan, compare:

  `classified_unresolved_review_thread_count == fetched_unresolved_review_thread_count`

If the counts do not match, stop and re-classify. A partial thread list is a
bug, not an acceptable approximation.

## Classification rules

Evaluate every item against the rules below **in order**. First rule that
matches wins.

### Review submissions (PR-level)

1. **APPROVED** → drop silently. An approval doesn't require action.
2. **DISMISSED** → already filtered by the GraphQL query; should not appear.
3. **CHANGES_REQUESTED with non-empty body** → `classification:
   "actionable"`. Read the body to write `action_summary`. Complexity is
   usually `cross_cutting` or `complex` — a reviewer requesting changes
   rarely means a single-line fix.
4. **CHANGES_REQUESTED with empty body** → `classification: "actionable"`,
   but `action_summary: "Reviewer requested changes with no body — check
   inline threads for specifics"`. The inline threads will carry the real
   work.
5. **COMMENTED with empty body** → drop silently. It's a review with only
   inline comments; the inline comments will be classified separately.
6. **COMMENTED with body** → judge the body:
   - If it explicitly asks for a change ("please update", "can you add",
     "this should") → `actionable`.
   - If it's an observation, thanks, or approval in prose ("looks great",
     "nice refactor") → drop silently.
   - If it's a question the user needs to answer → `actionable` with
     `complexity: "local"` and `action_summary: "Reply to reviewer's
     question about <X>"`.

### Review threads (inline)

1. **Resolved threads** → already filtered in Phase 1 unless the user
   passed `--all`. If present because of `--all`, drop silently.
2. **Thread on a restructured path, first commenter is a bot** →
   `classification: "actionable"`, `complexity: "pre_existing"`,
   `pre_existing: true`. Action summary: `"Bot comment on moved file:
   <summary of body>"`. These land in Batch 0 and auto-resolve with the
   standard pre-existing comment without code changes.
3. **Thread from a bot, body is a trivial nit** (repeated boilerplate,
   suggests a pattern already present nearby, or flags a false positive
   you can verify in-place) → still `actionable`, but you will often
   decide to reply-and-resolve without a code change in Phase 3.
4. **Outdated thread** (`is_outdated: true`, `line: null`) → `actionable`
   with a note in the `action_summary`: `"[outdated] <summary>"`. In
   Phase 3, check whether the issue is already fixed; if so, resolve
   without a new edit.
5. **Normal inline thread with a request or suggestion** → `actionable`.
   Infer complexity from the body (see below).
6. **Normal inline thread with only questions or approvals** →
   `informational`. The user decides whether to reply or dismiss.

### Discussion comments

1. **Comment from an obvious CI status bot** (commit status summaries,
   workflow-run links, coverage reports) → drop silently. The heuristic:
   it's long, auto-generated, and has no request verbs. Do NOT enumerate
   specific bot account names here — judge the content.
2. **Comment from an obvious stacked-diff automation** (Graphite-style
   stack-status blocks, branch-rename notices) → drop silently. Same
   heuristic: auto-generated, no action needed.
3. **Comment asking for a change or a reply** → `actionable`. Complexity
   depends on scope.
4. **Comment that's just an acknowledgment / thanks / FYI from a human** →
   `informational`. User may reply or dismiss.
5. **Comment that summarizes prior work** ("Here's what I changed in this
   round…") → drop silently.

### Bot detection — rule of thumb

A comment is "from a bot" if any of these are true:

- The author login ends with `[bot]`.
- The comment body is auto-generated boilerplate (consistent structure
  across many comments, no prose from a human).
- The comment is a repeated nit that a linter would produce.

You don't need to match a specific list of bot accounts. The principle:
bots are mechanical, humans are specific. When in doubt, treat borderline
cases as human — better to bother the user once than to silently drop a
real request.

## Complexity levels

Assigned only to `actionable` items. Used for batching.

- **pre_existing** — bot comment on a moved/restructured file. Batch 0.
  Auto-resolves without a code change.
- **local** — one file, one location, a few lines at most. Typical cases:
  rename a variable on line N, fix a typo, add a type annotation. Batch 1.
- **single_file** — one file, multiple locations. Typical cases: "rename
  this throughout the file", "apply the LBYL pattern everywhere in this
  module". Batch 2.
- **cross_cutting** — multiple files affected. Typical cases: "update
  every caller of `foo()`", "rename this function and every import".
  Batch 3. **Needs user approval before executing.**
- **complex** — multiple comments inform a single unified architectural
  change, or one comment describes a refactor that touches design rather
  than syntax. Batch 4. **Needs user approval before executing.**

When you're uncertain between two levels, pick the higher one. Better to
ask for approval than to auto-execute something surprising.

## Batch assembly

Batches are always in this order:

| # | Name                | auto_proceed | Contents                                                                 |
| - | ------------------- | ------------ | ------------------------------------------------------------------------ |
| 0 | Pre-Existing        | yes          | All items with `complexity: "pre_existing"`                              |
| 1 | Local Fixes         | yes          | All items with `complexity: "local"`                                     |
| 2 | Single-File         | yes          | All items with `complexity: "single_file"`                               |
| 3 | Cross-Cutting       | **no**       | All items with `complexity: "cross_cutting"`                             |
| 4 | Complex             | **no**       | All items with `complexity: "complex"`                                   |
| 5 | Informational       | **no**       | All review threads with `classification: "informational"` (per-item prompt) |

Skip any batch that would be empty.

If two items are clearly part of a single unified change (e.g., reviewer
left separate comments on `impl.py:50` and `cmd.py:100` asking for the
same refactor), group them into one "meta-item" in the complex batch
rather than two unrelated complex entries.

## False positives from automated reviewers

Before making a code change for a bot comment, **verify**. Many bot
comments are technically correct under the bot's model but wrong in
context:

1. **Read the flagged code carefully**. Look at the 5–10 lines before and
   after, not just the flagged line.
2. **Check whether the pattern the bot wants already exists** on a
   preceding line (LBYL check, guard clause, type cast, etc.). If it
   does, the bot is misreading the flow.
3. **Check whether the bot is applying a rule that doesn't fit this
   context**. Example: a "use pathlib" rule firing on a line that
   deliberately uses `os.path` for Python-version compatibility.
4. **If it's a false positive**: do NOT edit the code. In Phase 3, reply
   to the thread explaining why, reference the specific line where the
   correct pattern already exists, and resolve the thread. Don't argue
   with the bot — just state the fact and resolve.

## Output format (for your own notes during Phase 2)

You don't have to emit a specific JSON schema — this classifier is a
mental model, not a CLI. But a useful internal representation looks
something like:

```jsonc
{
  "pr_number": 123,
  "pr_title": "...",
  "pr_url": "...",
  "review_threads": [
    {
      "thread_id": "PRRT_abc",
      "path": "src/foo.py",
      "line": 42,
      "classification": "actionable",
      "pre_existing": false,
      "action_summary": "Use LBYL pattern for the dict lookup",
      "complexity": "local",
      "original_comment": "This would be clearer as an `in` check"
    },
    {
      "thread_id": "PRRT_def",
      "path": "src/foo.py",
      "line": 57,
      "classification": "informational",
      "pre_existing": false,
      "action_summary": "Reviewer asked whether this helper belongs on the gateway",
      "original_comment": "Should this move onto the gateway instead?"
    }
  ],
  "actionable_reviews": [
    {
      "review_id": "PRR_abc",
      "action_summary": "Reviewer requested error-handling rework",
      "complexity": "cross_cutting"
    }
  ],
  "discussion_actions": [
    {
      "comment_id": 12345,
      "action_summary": "Update CHANGELOG entry per reviewer",
      "complexity": "cross_cutting"
    }
  ],
  "informational_count": 7,
  "batches": [ /* see batch assembly above */ ]
}
```

Use this as a scratchpad during Phase 2; you don't have to print it to
the user verbatim. The user sees the plan-display output in the format
from `operations.md` §`plan-display`.

## When this file is wrong

If the skill mis-classifies something — e.g., auto-dismisses a real
review comment, treats a human question as a bot nit, or mis-batches a
cross-cutting change as local — the fix goes here, not in the SKILL.md.
Update the rule that failed, add a principle (not a hard-coded enum), and
re-run the skill. This file is the only place classification behavior
should change.
