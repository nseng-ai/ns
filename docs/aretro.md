# Branch Retrospective Evidence

`aretro` collects compact, factual observations from local agent session logs so a later retrospective skill or language model can write human-facing guidance for a branch.

## Boundary

The deterministic Python layer collects, normalizes, counts, filters, and compresses evidence. It emits observations only. The language model interprets those observations and decides whether they imply missing docs, confusing UX, weak architecture, inefficient workflow, or normal exploration.

Python may report facts such as:

- a tool was called a certain number of times;
- a tool result was marked as failed;
- a file path was read repeatedly;
- an exact shell command occurred repeatedly;
- token usage counters were present;
- a tool result or command execution had large or truncated output.

Python must not emit diagnoses such as `confusion`, `missing_docs`, `bad_architecture`, `wasted_work`, `needs_refactor`, or `skill_gap`.

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

- `asdl-core` session adapters parse harness-specific logs into normalized session facts without retaining raw transcript content.
- `asdl-core` evidence aggregation turns normalized session facts into deterministic `SessionEvidenceItem` observations.
- `aretro` exposes the branch-facing CLI and renders the `aretro exec collect-evidence --format json` envelope.
- Future retrospective skills should consume the JSON envelope, apply semantic judgment, and write the final retrospective.
