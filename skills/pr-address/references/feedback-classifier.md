# Feedback classifier — LLM guidance

This file is the heart of `pr-address`. After `prepare-run` or `get-feedback`
returns a compact feedback manifest, the LLM applies the rules below to classify
each item and group actionable work into an ordered execution plan.

Classification is **LLM-driven, not rule-based**, but the classifier's output is
validated deterministically before the parent skill acts on it. Tools change and
users have patterns of their own — the LLM judges free-form review content
better than brittle string-matching rules keyed off specific bot names. If this
file ever starts listing more than a handful of specific bot accounts or magic
strings, that's a smell: the judgment should be stated as principles, not
enumerations.

## Inputs

The classifier receives payload artifact evidence, not pasted raw review JSON:

- **Manifest:** the compact `data` object from `pr-address exec prepare-run` or
  `pr-address exec get-feedback` in default payload mode.
- **Raw payload path:** `manifest.payload_reference.payload_path`, pointing to
  the full `.raw.json` payload envelope.
- **Locators:** `body_locator` and `item_pointer` values from manifest reviews,
  review-thread comments, and discussion comments.
- **Restructured files:** optional `restructured_files` from `prepare-run`, used
  when judging moved/copied-path bot comments as pre-existing.
- **Classification template:** the deterministic scaffold from
  `pr-address exec classification-template`, when available. It pre-fills IDs,
  locators, item pointers, and review-thread comment coverage.
- **Selected body text:** obtained either by a payload-aware summarizer/subagent
  that can read the raw payload file, or by targeted calls to
  `pr-address exec read-feedback-detail`.

Do not paste the full raw payload artifact into the main transcript. Pass paths,
locators, the generated template, expected output shape, and completeness
requirements to the side channel. If no separate subagent or helper is available,
inspect only the required bodies with `read-feedback-detail`.

## Delegated classifier report

When acting as a delegated classifier subagent, return a concise prose/Markdown
classification report keyed by stable review, thread, discussion-comment, and
covered thread-comment IDs. Do not emit the final validation JSON packet unless
the parent prompt explicitly requests a special machine packet for a structured
terminal-capture mode.

Recommended report shape:

```md
## Coverage

- Reviews: accounted for 1/1
- Review threads: accounted for 1/1
- Thread comments: covered 2/2
- Discussion comments: accounted for 1/1

## Review threads

### PRRT_kw...

Disposition: actionable
Summary: Reviewer is asking for a clearer error message.
Recommended action: Update the raised error text and nearby assertion.
Complexity: single_file
Pre-existing: no
Covered comments: 123456, 123457
Confidence: high
Evidence: /data/review_threads/0/comments/0/body, /data/review_threads/0/comments/1/body

## Discussion comments

### 987654

Disposition: informational
Summary: CI status bot posted a passing workflow summary.
Informational reason: automation
Needs reply: no
Confidence: high
Evidence: /data/discussion_comments/0/body
```

For each required item, include the disposition, summary, evidence inspected,
and confidence or blockers. For actionable items, include recommended action,
complexity, and whether the item is pre-existing. For informational items,
include the informational reason. For actionable discussion comments, include
whether a reply is needed.

The report should be easy for the parent to inspect and translate into the
classification scaffold. It is intentionally not a strict schema.

## Canonical validation packet

The parent skill builds the canonical JSON classification packet and passes it to
`pr-address exec validate-feedback-classification`. That packet has
`schema_version: 1`:

```jsonc
{
  "schema_version": 1,
  "reviews": [
    {
      "review_id": "PRR_...",
      "disposition": "actionable", // or "informational"
      "body_locator": {
        "json_pointer": "/data/reviews/0/body",
        "item_pointer": "/data/reviews/0"
      },
      "summary": "Human-readable classification summary.",
      "action_summary": "Required for actionable items.",
      "complexity": "local",
      "pre_existing": false,
      "informational_reason": null
    }
  ],
  "review_threads": [
    {
      "thread_id": "PRRT_...",
      "disposition": "actionable",
      "thread_item_pointer": "/data/review_threads/0",
      "covered_comments": [
        {
          "comment_id": 123456,
          "body_locator": {
            "json_pointer": "/data/review_threads/0/comments/0/body",
            "item_pointer": "/data/review_threads/0/comments/0"
          }
        }
      ],
      "summary": "Thread summary.",
      "action_summary": "Required for actionable threads.",
      "complexity": "single_file",
      "pre_existing": false,
      "informational_reason": null
    }
  ],
  "discussion_comments": [
    {
      "comment_id": 987654,
      "disposition": "informational",
      "body_locator": {
        "json_pointer": "/data/discussion_comments/0/body",
        "item_pointer": "/data/discussion_comments/0"
      },
      "summary": "Comment summary.",
      "action_summary": null,
      "complexity": null,
      "needs_reply": false,
      "informational_reason": "automation"
    }
  ]
}
```

When a `classification-template` scaffold is available, the parent fills that
scaffold instead of writing the packet from scratch. Preserve all prefilled IDs,
locator references, item pointers, thread item pointers, and
`covered_comments`; fill only semantic judgment fields. Use locator references
copied from the manifest. Do not invent IDs, pointers, or item paths.

Enum values:

- `disposition`: `actionable`, `informational`
- `complexity`: `pre_existing`, `local`, `single_file`, `cross_cutting`,
  `complex`
- `informational_reason`: `resolved_reference`, `automation`,
  `acknowledgement`, `approval`, `question_only`, `fyi`, `noise`,
  `already_addressed`, `other`

Field rules:

- Every item has a non-empty `summary`.
- `actionable` items have non-empty `action_summary`, non-null `complexity`, and
  no `informational_reason`.
- `informational` items have `informational_reason`, and no `action_summary`,
  `complexity`, `pre_existing: true`, or `needs_reply: true`.
- `pre_existing: true` and `complexity: "pre_existing"` must appear together.

## Completeness invariant

Completeness has two layers:

- The delegated classifier report must account for every required review,
  unresolved review thread, covered thread comment, and discussion comment by
  stable ID.
- The parent-generated JSON packet must satisfy exact-once validation.

The final packet must account for the manifest exactly:

- Every manifest PR-level review appears in `classification.reviews` exactly
  once.
- Every unresolved manifest review thread appears in
  `classification.review_threads` exactly once.
- Every comment in each classified unresolved review thread appears exactly once
  in that thread's `covered_comments`.
- Every manifest discussion comment appears in `classification.discussion_comments`
  exactly once.
- Resolved threads are not actionable and should not be classified unless the
  validator/schema explicitly supports a reference-only reason in the future.

Unresolved review threads must never disappear into an aggregate count. Old
scratchpad fields such as `actionable_reviews`, `discussion_actions`, and
`informational_count` are no longer the contract; informational items are
explicit per-ID records with `informational_reason`.

## Validation and retry

The parent skill validates the compact manifest and parent-generated packet with
`pr-address exec validate-feedback-classification` before showing an execution
plan. Prefer split inputs (`--manifest-file` / `--classification-file` or the
matching `--*-json` options); legacy wrapper JSON remains supported.

If validation returns `exit_code: 1`, inspect `data.counts` and `data.errors`.
The parent fixes translation, schema, and scaffold-preservation mistakes locally:
malformed JSON, missing arrays, locator mismatches, copied pointer drift, or
wrongly edited `covered_comments` do not require a new classifier run. Retry or
escalate the classifier only when diagnostics show incomplete, duplicate,
ambiguous, or contradictory semantic judgments in the report. If the retry still
fails, stop and report the diagnostics. If validation returns `exit_code: 2`,
treat it as malformed workflow input and stop.

## Cost-aware model routing

In Pi, ordinary initial classification should request the canonical cheap
classification model named in the shared Pi launch policy via the runner
subagent `model` field when that model is available. This model is only for a
bounded first-pass semantic report over compact manifest entries, payload
locators, selected body text, and these finite classifier rules; it is not
authority to bypass deterministic validation.

Escalate to the parent/default strong model, or to the concrete Pi escalation
target named in the shared Pi launch policy, when validation reveals missing or
duplicate semantic judgments, comments are ambiguous, reviewer intent is
human-sensitive, the classifier reports low confidence or blockers, or the
classifier needs complex cross-file code context. Pass the diagnostics and
original manifest/template evidence to the escalation run.

## Classification rules

Evaluate every item against the rules below **in order**. First rule that
matches wins.

### Review submissions (PR-level)

1. **APPROVED** → `disposition: "informational"`, usually
   `informational_reason: "approval"`.
2. **DISMISSED** → should not normally appear. If it does, classify as
   informational with `informational_reason: "already_addressed"` unless the
   body clearly requests new work.
3. **CHANGES_REQUESTED with non-empty body** → `disposition: "actionable"`.
   Read the body to write `action_summary`. Complexity is usually
   `cross_cutting` or `complex` — a reviewer requesting changes rarely means a
   single-line fix.
4. **CHANGES_REQUESTED with empty body** → `disposition: "actionable"`, with
   `action_summary: "Reviewer requested changes with no body — check inline threads for specifics"`.
   The inline threads will carry the real work.
5. **COMMENTED with empty body** → `disposition: "informational"`, usually
   `informational_reason: "noise"`. It's often a review shell with only inline
   comments.
6. **COMMENTED with body** → judge the body:
   - If it explicitly asks for a change ("please update", "can you add",
     "this should") → `actionable`.
   - If it's an observation, thanks, or approval in prose ("looks great", "nice
     refactor") → `informational`.
   - If it's a question the user needs to answer → `actionable` with
     `complexity: "local"` and an action summary like `Reply to reviewer's question about <X>`.

### Review threads (inline)

1. **Resolved threads** → reference-only. Current validation rejects them in the
   packet, so do not include them as work.
2. **Thread on a restructured path, first commenter is a bot** →
   `disposition: "actionable"`, `complexity: "pre_existing"`,
   `pre_existing: true`. Action summary: `Bot comment on moved file: <summary of body>`.
   These land in the Pre-Existing batch and auto-resolve with the standard
   pre-existing comment without code changes.
3. **Thread from a bot, body is a trivial nit** (repeated boilerplate, suggests
   a pattern already present nearby, or flags a false positive you can verify
   in-place) → still `actionable`, but execution will often reply-and-resolve
   without a code change.
4. **Outdated thread** (`is_outdated: true`, `line: null`) → `actionable` with a
   note in `action_summary`: `[outdated] <summary>`. During execution, check
   whether the issue is already fixed; if so, resolve without a new edit.
5. **Normal inline thread with a request or suggestion** → `actionable`. Infer
   complexity from the body.
6. **Normal inline thread with only questions or approvals** → `informational`
   with `informational_reason: "question_only"`, `"approval"`, or `"fyi"`. The
   user decides whether to reply or dismiss.

### Discussion comments

1. **Comment from an obvious CI/status bot** (commit status summaries,
   workflow-run links, coverage reports) → `informational` with
   `informational_reason: "automation"` unless it contains a direct request.
2. **Comment from obvious stacked-diff automation** (stack-status blocks,
   branch-rename notices) → `informational` with
   `informational_reason: "automation"` unless it contains a direct request.
3. **Comment asking for a change or a reply** → `actionable`. Set
   `needs_reply: true` when the action is a reply rather than a code change, or
   when a reply is needed after the code change. Complexity depends on scope.
4. **Comment that's just an acknowledgment / thanks / FYI from a human** →
   `informational` with `informational_reason: "acknowledgement"` or `"fyi"`.
5. **Comment that summarizes prior work** ("Here's what I changed in this
   round…") → `informational` with `informational_reason: "already_addressed"`
   or `"fyi"`.

### Bot detection — rule of thumb

A comment is "from a bot" if any of these are true:

- The author login ends with `[bot]`.
- The comment body is auto-generated boilerplate (consistent structure across
  many comments, no prose from a human).
- The comment is a repeated nit that a linter would produce.

You don't need to match a specific list of bot accounts. The principle: bots are
mechanical, humans are specific. When in doubt, treat borderline cases as human —
better to bother the user once than to silently drop a real request.

## Complexity levels

Assigned only to `actionable` items. Used for batching.

- **pre_existing** — bot comment on a moved/restructured file. Batch 0.
  Auto-resolves without a code change.
- **local** — one file, one location, a few lines at most. Typical cases: rename
  a variable on line N, fix a typo, add a type annotation. Batch 1.
- **single_file** — one file, multiple locations. Typical cases: "rename this
  throughout the file", "apply the LBYL pattern everywhere in this module".
  Batch 2.
- **cross_cutting** — multiple files affected. Typical cases: "update every
  caller of `foo()`", "rename this function and every import". Batch 3. **Needs
  user approval before executing.**
- **complex** — multiple comments inform a single unified architectural change,
  or one comment describes a refactor that touches design rather than syntax.
  Batch 4. **Needs user approval before executing.**

When you're uncertain between two levels, pick the higher one. Better to ask for
approval than to auto-execute something surprising.

## Batch assembly

Batches are derived from the validated packet, not from unvalidated scratchpad
fields. Use only `disposition: "actionable"` items for actionable batches.

| # | Name          | auto_proceed | Contents                                           |
| - | ------------- | ------------ | -------------------------------------------------- |
| 0 | Pre-Existing  | yes          | All items with `complexity: "pre_existing"`        |
| 1 | Local Fixes   | yes          | All items with `complexity: "local"`               |
| 2 | Single-File   | yes          | All items with `complexity: "single_file"`         |
| 3 | Cross-Cutting | **no**       | All items with `complexity: "cross_cutting"`       |
| 4 | Complex       | **no**       | All items with `complexity: "complex"`             |
| 5 | Informational | **no**       | Review threads with `disposition: "informational"` |

Skip any batch that would be empty.

If two items are clearly part of a single unified change (e.g., reviewer left
separate comments on `impl.py:50` and `cmd.py:100` asking for the same
refactor), group them into one "meta-item" in the complex batch rather than two
unrelated complex entries.

## False positives from automated reviewers

Before making a code change for a bot comment, **verify**. Many bot comments are
technically correct under the bot's model but wrong in context:

1. **Read the flagged code carefully**. Look at the 5–10 lines before and after,
   not just the flagged line.
2. **Check whether the pattern the bot wants already exists** on a preceding
   line (LBYL check, guard clause, type cast, etc.). If it does, the bot is
   misreading the flow.
3. **Check whether the bot is applying a rule that doesn't fit this context**.
   Example: a "use pathlib" rule firing on a line that deliberately uses
   `os.path` for Python-version compatibility.
4. **If it's a false positive**: do NOT edit the code. During execution, reply
   to the thread explaining why, reference the specific line where the correct
   pattern already exists, and resolve the thread. Don't argue with the bot —
   just state the fact and resolve.

## When this file is wrong

If the skill mis-classifies something — e.g., treats a human question as a bot
nit, marks a cross-cutting change as local, or chooses the wrong informational
reason — the fix goes here, not in the main `SKILL.md`. Update the rule that
failed, add a principle (not a hard-coded account list), and re-run the skill.
This file is the only place classification behavior should change.
