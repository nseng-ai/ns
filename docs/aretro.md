# Branch Retrospective Evidence

`aretro` collects compact, factual observations from local agent session logs so the `branch-retro` skill or another language-model workflow can write human-facing guidance for a branch.

## Boundary

The deterministic TypeScript CLI collects, normalizes, counts, filters, and compresses evidence. It emits observations only. The language model interprets those observations and decides whether they imply missing docs, confusing UX, weak architecture, inefficient workflow, or normal exploration.

The CLI may report facts such as:

- a tool was called a certain number of times;
- a tool result was marked as failed;
- a file path was read repeatedly;
- an exact shell command occurred repeatedly;
- token usage counters were present;
- a tool result or command execution had large or truncated output.

The deterministic CLI must not emit diagnoses such as `confusion`, `missing_docs`, `bad_architecture`, `wasted_work`, `needs_refactor`, or `skill_gap`.

## Recommendation Policy

Human-facing retrospectives should optimize for two benefits: higher-quality future outcomes and greater agent efficiency, including lower wall time and token spend. Recommendations should be cost/benefit judgments over the deterministic evidence, not a list of every possible improvement.

Treat maintenance and drift risk as first-class costs. This is especially important for documentation: a new doc only pays for itself when future agents can discover it through an existing path and when its source of truth and update trigger are clear. Prefer executable or tested affordances, such as CLI operations, task-runner targets, package scripts, or validated helpers, when the evidence points to repeated mechanical work.

A good retrospective may recommend no change, a follow-up measurement, or a small routing note when the evidence is weak, the durable fix is unclear, or the drift cost of a new artifact exceeds the expected quality/efficiency benefit.

## Evidence Item Principles

Evidence items should be:

- source-ref-backed, with representative session references;
- factual and mechanically reproducible;
- compact enough for JSON envelopes and prompts;
- harness-neutral where possible;
- privacy-conscious: no raw transcript text, prompts, assistant prose, or tool/command output by default.

If a field can contain user-entered text, the aggregation layer should bound it or omit it. For example, failed tool error text is not emitted; repeated command subjects are bounded.

## Implemented Evidence Kinds

Allowed deterministic evidence kinds include:

- `tool_usage_count`
- `failed_tool_result`
- `repeated_file_read`
- `repeated_shell_command`
- `token_usage_observed`
- `large_output_observed`

These kinds are observations, not recommendations.

## Component Roles

- `@asdl/aretro` package-local session adapters parse harness-specific logs into normalized session facts without retaining raw transcript content.
- `@asdl/aretro` evidence aggregation turns normalized session facts into deterministic observations.
- `aretro` exposes the branch-facing TypeScript CLI and renders the `aretro exec collect-evidence --format json` envelope.
- `branch-retro` is the first skill consumer of that standalone evidence command: it consumes the JSON envelope, applies semantic judgment, weighs cost, drift, and discoverability, and writes the final retrospective recommendations.
