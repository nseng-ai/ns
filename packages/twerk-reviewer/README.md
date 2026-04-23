# twerk-reviewer

`twerk-reviewer` runs markdown-defined reviewers against the current branch
diff. Once you've chosen a harness, adding a new reviewer is literally adding
a markdown file under `reviews/`.

## Quick start

```bash
# Write a reviewer.
cat > reviews/demo.md <<'EOF'
---
description: Short description.
---

Flag issues.
EOF

# Run it against the current branch diff. If exactly one supported harness
# is on PATH, it's selected automatically.
reviewer review run demo
```

## CLI

```
reviewer harness list        # detect known harnesses on PATH
reviewer harness show        # print which harness would be used

reviewer review list         # enumerate reviews/**/*.md as keys
reviewer review run <key>    # resolve reviews/<key>.md, run it, print findings
```

Every operation also has a JSON form for machine consumers:

```bash
reviewer review run dignified-python --format json
reviewer harness list --format json
```

## Harness selection

`twerk-reviewer` does not know how to call an LLM directly. Each harness
(Claude Code, Codex, Pi, …) is driven through a small adapter that knows its
argv shape and stdout contract. The first-class adapter today is
**Claude Code**; adding others is a future slice.

Resolution order for which harness a review uses:

1. `--harness <name>` on the `review run` command.
2. `TWERK_REVIEWER_HARNESS` environment variable.
3. The single harness detected on `PATH`, if exactly one is available.
4. Failure — either no harness is on `PATH`, or more than one is and the
   choice is ambiguous.

The Claude Code adapter shells out to:

```
claude -p --output-format stream-json --verbose --bare \
  --model <model> --system-prompt <prompt> \
  --tools Bash,Read [--json-schema <schema>] -- <prompt>
```

`--bare` skips hooks, plugins, and CLAUDE.md auto-discovery so reviews are
fast and deterministic. `--output-format stream-json` emits one JSON event
per line; the adapter reads the terminal `result` event, which in findings
mode carries the model's structured output conforming to `--json-schema`.
`--tools Bash,Read` restricts the model to read-only exploration — no
`Edit` / `Write`, so a review run cannot mutate the repo.

## Execution and cost model

Running a review is a single LLM invocation via the harness adapter.
There is **no cheap pre-filter layer** between `reviewer review run` and
the model — every review key you enumerate pays one model call per run.
The "cheap detection" idea lives in rule authoring (see
[Writing cheap reviewers](#writing-cheap-reviewers) below), not as a
separate code path.

### Where a review runs

| Context                             | What invokes it                                                      | What the user pays per run           |
| ----------------------------------- | -------------------------------------------------------------------- | ------------------------------------ |
| Local (`reviewer review run <key>`) | Your shell — one model call through `claude` on PATH                 | Charged to your own Claude Code auth |
| CI (`reviewer.yml`)                 | One matrix job per discovered review key, each a separate model call | `ANTHROPIC_API_KEY` repo secret      |

Local and CI both execute the same adapter and prompt shape. Only the
caller differs.

### Model selection

The model used for a given run resolves in this order (see
`_resolve_model` in
`packages/twerk-reviewer/src/twerk_reviewer/workflow.py`):

1. `--model <name>` passed to `reviewer review run`.
2. `default_model` in the review's frontmatter.
3. Error (`ModelNotProvided`) if neither is set.

The claude-code adapter accepts either an alias (`sonnet`, `opus`,
`haiku`) or any full model name starting with `claude-` (see
`_CLAUDE_CODE_MODEL_ALIASES` and `_CLAUDE_CODE_MODEL_PREFIXES` in
`harness/claude/adapter.py`). An alias follows the installed `claude`
CLI's current default for that family; pin a specific model name
(e.g. `claude-sonnet-4-6`) in frontmatter if you need run-to-run
stability.

`.github/workflows/reviewer.yml` does not pass `--model`, so CI uses
each review's frontmatter `default_model`. To override the model a
review uses in CI, edit its `default_model`; the workflow does not
need to change.

### Cost

Cost is dominated by model choice and prompt size. Each review run is:

- One Claude Code CLI invocation with `--tools Bash,Read`.
- System prompt + review definition + diff fed as input.
- One assistant response (structured findings in findings mode, prose
  in text mode).

The adapter captures usage and cost from the terminal `result` event
(`_extract_usage` in `harness/claude/adapter.py`) when the underlying
CLI reports them, so per-run token counts and `total_cost_usd` are
observable on the `ReviewExecutionResponse.usage` field.

Three levers move cost:

1. **Model family.** Sonnet is the dignified-python default; Haiku is
   substantially cheaper for Tier-A-style rules; Opus is only worth it
   when a review genuinely needs deep code understanding.
2. **Diff size.** The review prompt carries the diff. Large refactors
   run more expensive reviews than small changes.
3. **Review count.** CI fans out across every key under `reviews/`.
   Ten reviews on a 500-line PR is roughly ten times the cost of one.

There is intentionally no cost-cap or early-abort mechanism today.
When dogfood evidence indicates CI cost is a problem, policy work
(per-review budgets, skip-on-size heuristics, selective fan-out) will
be tracked as a separate slice.

### Writing cheap reviewers

Since every review pays a full model call, the "cheap vs expensive"
tradeoff is encoded in **what the review asks the model to do**, not
in a pre-filter layer. The pattern — originally written up in
`reviews/dignified-python.md` — is a two-tier rule set inside a single
review definition:

- **Tier A — mechanically detectable from the diff alone.** Rules
  where the model can decide from the added lines without reading the
  surrounding codebase. Example: _"Flag `os.path.join` in added
  lines"_. Cheap because the model needs little context and rarely
  needs `Read`.
- **Tier B — light judgment; skip if unsure.** Rules that need
  small amounts of surrounding context, and explicit prompt-level
  guidance to skip rather than guess on ambiguity. Example: _"Flag a
  try/except used as control flow, but skip when the except clause
  does real error handling."_ Higher false-positive cost, so the
  prompt tells the model to prefer silence over speculation.

The split is a rule-authoring convention, not a code contract — a
review is free to mix tiers or add its own framing. What it buys is
predictable cost-per-run: reviews that stay in Tier A run fast on
Sonnet / Haiku and scale out in CI without surprises.

**Engineer-led resolution.** Once a finding is posted, the engineer
resolves it in their normal workflow (reading the surrounding code,
deciding whether the rule applies, editing). The reviewer never
proposes automated fixes — see `_READ_ONLY_TOOLS = "Bash,Read"` in
`harness/claude/adapter.py`. This is a deliberate design choice:
cheap detection + human resolution composes better than expensive
auto-fix under a linter, especially for judgment-heavy rules.

## Review definition format

A reviewer is a markdown file under `reviews/` at the repo root. Nested
subdirectories are allowed: `reviews/python/typing.md` is key
`python/typing`. The reviewer `name` comes from the filename (without its
extension) — e.g. `dignified-python.md` becomes the reviewer named
`dignified-python`. The frontmatter holds structured metadata; everything
after the closing `---` fence becomes the reviewer's instructions.

```md
---
description: Review Python diffs for violations of the team's dignified Python standards.
default_model: sonnet
---

Concrete rules for the model. The adapter wraps these with a prompt that
asks the model to emit findings as JSON.
```

Required frontmatter fields:

- `description`

Optional frontmatter fields:

- `default_model` — used when the `--model` flag is not passed.

The markdown body (after the closing fence) is required and becomes the
reviewer's `instructions`.

## Finding schema

Every review executor must emit JSON of this shape on stdout:

```json
{
  "findings": [
    {
      "path": "src/app.py",
      "line": 12,
      "severity": "warning",
      "summary": "Use pathlib instead of os.path",
      "details": "Line 12 joins paths with os.path.join."
    }
  ]
}
```

`line` may be `null` for file-level findings. `severity` is one of
`info`, `warning`, `error`. An empty `findings` array means the review
passed.
