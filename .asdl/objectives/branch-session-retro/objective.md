# Branch Session Retrospective Evidence CLI

## Thesis

Agents working on a branch should be able to ask, cheaply and repeatably, what would have made the branch's sessions faster, smaller, or higher quality. The right first step is a deterministic Python push-down CLI for skills: it should discover and parse local session logs, turn them into compact structured evidence, and leave semantic recommendations to the invoking skill and agent.

This workstream will build a multi-PR steelthread around `asdl-retro`: a new package with a standalone CLI and asdl plugin subgroup. The first skill-facing command is a hidden `retro exec collect-evidence` operation that emits one cohesive JSON payload for the current repo and branch context. In v1 the command is deterministic only; it does not call an LLM, write recommendations, or edit documentation, skills, or code.

## Scope

In scope:

- Add a new `packages/asdl-retro` package with standalone and plugin CLI wiring that follows existing repository conventions.
- Expose agent-facing operations under a hidden `exec` subgroup, beginning with `retro exec collect-evidence`.
- Implement a Pi JSONL session source adapter for local session logs associated with the current repo/worktree.
- Use conservative session association: collect repo/worktree sessions and mark branch confidence explicitly, rather than aggressively inferring branch ownership from prose or git history.
- Parse session JSONL deterministically to extract compact facts such as session metadata, message counts, tool calls, tool names, failed tool results, command arguments, files read, token usage when present, large outputs when measurable, and repeated mechanical patterns.
- Emit a stable JSON envelope suitable for skills: `success`, repo and branch context, session summaries, aggregate metrics, evidence items, warnings, and source references.
- Add unit and scenario tests for parser behavior, malformed or partial JSONL, missing session roots, conservative association labels, aggregation, JSON envelope shape, standalone CLI behavior, and plugin smoke wiring.
- Create or update a skill that invokes the CLI and performs the semantic branch retrospective from the returned evidence.

Out of scope for the first objective slice:

- Model-backed summarization inside Python.
- Automatic Markdown retrospective generation inside the CLI.
- Automatic edits to docs, skills, code, tests, Branch Memory, or Objective records.
- Aggressive branch inference from transcript prose, reflog heuristics, or commit timing.
- Durable per-session summary caches unless the evidence collector proves too slow or too verbose without them.
- Support for non-Pi session providers beyond clean adapter boundaries.

## Non-Goals

- Do not make the CLI the judge of what documentation, skill, or code changes should be made; it should provide evidence for a skill to interpret.
- Do not parse human-authored Markdown as structured data.
- Do not introduce runtime Graphite dependencies for generic branch facts; use ordinary git facts where needed unless a future command explicitly contracts around Graphite.
- Do not store raw transcripts in git, Branch Memory, or Objective files.
- Do not build a broad telemetry system, dashboard, or always-on background daemon in this workstream.
- Do not optimize for a human-first pretty report before the skill-facing JSON contract is useful and tested.

## Completion Criteria

- `packages/asdl-retro` exists in the workspace with standalone CLI and asdl plugin registration.
- The outer `retro` command contains a hidden `exec` subgroup, and `retro exec collect-evidence` is invocable by skills.
- `retro exec collect-evidence --repo <path> --branch <branch> --format json` returns a stable success/failure envelope and compact evidence payload without LLM calls.
- The Pi JSONL adapter can discover and parse session files for a repo/worktree, tolerate malformed or partial records with warnings, and preserve source references for evidence.
- The collector reports conservative association confidence when explicit branch metadata is absent, rather than pretending older repo sessions are certainly branch-specific.
- Aggregation identifies at least the first useful evidence classes: tool-call counts, failed tools, tools by name, repeated file reads, repeated shell commands, token usage when available, and large outputs when available.
- Scenario and unit tests cover the standalone command, hidden exec invocability, plugin smoke behavior, parser edge cases, and JSON contract stability.
- A skill or skill update delegates deterministic collection to `retro exec collect-evidence` and keeps semantic recommendation writing in the skill/agent.
- The repository quality suite is green after the package, CLI, tests, and skill/docs changes land.

## Assumptions and Risks

Assumptions:

- Pi JSONL session logs are available locally and stable enough for a first adapter that extracts generic events, messages, tool calls, tool results, timestamps, and usage records.
- Repo/worktree association is useful even when exact branch metadata is missing, provided the payload marks that association as lower confidence.
- A single cohesive `collect-evidence` command will remove enough repeated tool calls and prompt mechanics from skills to justify a new package.
- Skills are the right consumers for the first version: they can decide which evidence matters and can propose documentation, skill, CLI, test, or code changes without the Python command becoming semantic.
- Existing asdl CLI package conventions are sufficient for a new `asdl-retro` package with hidden exec operations and plugin discovery.

Risks:

- Session association may be too weak for older logs that lack explicit branch metadata. Mitigation: label confidence clearly and add explicit branch/session metadata capture in a later PR if needed.
- Session logs can be large or contain sensitive user/tool output. Mitigation: emit compact metrics and source references by default, avoid storing raw transcript content, and make any raw excerpts opt-in and bounded.
- The evidence schema could become too verbose, reintroducing token pressure for the skill. Mitigation: keep aggregate summaries compact, include limits, and test representative payload sizes.
- Tool duration and wall-time data may be incomplete in existing logs. Mitigation: report fields only when evidence exists and distinguish missing telemetry from zero cost.
- The CLI boundary could creep into semantic recommendation logic. Mitigation: keep recommendation categories and prioritization in the skill, and test the CLI as deterministic extraction/aggregation only.
- A new package adds maintenance overhead. Mitigation: keep the first command narrow, follow established package/test patterns, and avoid coupling it to brmem, Graphite, or provider-specific internals outside the adapter.

## Open Questions

- What exact command name should ship: `retro exec collect-evidence`, `branch-retro exec collect-evidence`, or another package/group name?
- How should future sessions record explicit branch metadata so association can become high-confidence without heuristics?
- Should a later PR add a local per-session summary cache, and if so should it live under Pi state, asdl state, or Branch Memory?
- What thresholds should define repeated reads, repeated commands, large outputs, and other evidence classes?
- Should the first skill produce only a recommendation report, or also offer follow-up commands to apply approved doc/skill/code changes?
