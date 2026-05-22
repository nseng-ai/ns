# Branch Session Retrospective Evidence CLI

## Thesis

Agents working on a branch should be able to ask, cheaply and repeatably, what would have made the branch's sessions faster, smaller, or higher quality. The right first step is a deterministic Python push-down CLI for skills: it should discover and parse local session logs, turn them into compact structured evidence, and leave semantic recommendations to the invoking skill and agent.

This workstream will build a multi-PR steelthread around `aretro`: a new package with a standalone `aretro` CLI and matching asdl plugin subgroup. Reusable session parsing and analysis belongs in `asdl-core`; `aretro` should stay a thin CLI and skill boundary that queries the shared library and renders the retrospective evidence envelope. The first skill-facing command is a hidden `aretro exec collect-evidence` operation that emits one cohesive JSON payload for the current repo and branch context. In v1 the command is deterministic only; it does not call an LLM, write recommendations, or edit documentation, skills, or code.

## Scope

In scope:

- Add a new `packages/aretro` package with standalone and plugin CLI wiring that follows existing repository conventions.
- Expose agent-facing operations under a hidden `exec` subgroup, beginning with `aretro exec collect-evidence`.
- Add a reusable harness-neutral session parsing and analysis library in `asdl-core` for querying session sources, parsing records, and computing compact deterministic metrics; keep harness identity distinct from model provider metadata.
- Implement the first Pi JSONL session source adapter in `asdl-core` for local session logs associated with the current repo/worktree.
- Keep the session source boundary future-ready for later Claude, Codex, or other harness adapters without implementing those adapters in this slice.
- Use conservative session association: collect repo/worktree sessions and mark branch confidence explicitly, rather than aggressively inferring branch ownership from prose or git history.
- Parse session records deterministically to extract compact facts such as session metadata, message counts, tool calls, tool names, failed tool results, command arguments, files read, token usage when present, large outputs when measurable, and repeated mechanical patterns.
- Emit a stable JSON envelope suitable for skills: `success`, repo and branch context, session summaries, aggregate metrics, evidence items, warnings, and source references.
- Add unit and scenario tests for parser behavior, malformed or partial JSONL, missing session roots, conservative association labels, aggregation, JSON envelope shape, standalone CLI behavior, and plugin smoke wiring.
- Create or update a skill that invokes the CLI and performs the semantic branch retrospective from the returned evidence.

Out of scope for the first objective slice:

- Model-backed summarization inside Python.
- Automatic Markdown retrospective generation inside the CLI.
- Automatic edits to docs, skills, code, tests, Branch Memory, or Objective records.
- Aggressive branch inference from transcript prose, reflog heuristics, or commit timing.
- Durable per-session summary caches unless the evidence collector proves too slow or too verbose without them.
- Implementing non-Pi session providers such as Claude or Codex beyond clean adapter boundaries.

## Non-Goals

- Do not make the CLI the judge of what documentation, skill, or code changes should be made; it should provide evidence for a skill to interpret.
- Do not parse human-authored Markdown as structured data.
- Do not introduce runtime Graphite dependencies for generic branch facts; use ordinary git facts where needed unless a future command explicitly contracts around Graphite.
- Do not store raw transcripts in git, Branch Memory, or Objective files.
- Do not build a broad telemetry system, dashboard, or always-on background daemon in this workstream.
- Do not optimize for a human-first pretty report before the skill-facing JSON contract is useful and tested.

## Completion Criteria

- `packages/asdl-core` contains reusable harness-neutral session parsing interfaces and models, deterministic analysis helpers, and the Pi JSONL adapter as the first source implementation.
- `packages/aretro` exists in the workspace with standalone CLI and asdl plugin registration.
- The outer `aretro` command contains a hidden `exec` subgroup, and `aretro exec collect-evidence` is invocable by skills.
- `aretro exec collect-evidence --repo <path> --branch <branch> --format json` returns a stable success/failure envelope and compact evidence payload without LLM calls.
- The `aretro` command consumes the shared `asdl-core` session library rather than owning harness-specific parsers or analysis logic.
- The Pi JSONL adapter in `asdl-core` can discover and parse session files for a repo/worktree, tolerate malformed or partial records with warnings, and preserve source references for evidence.
- The collector reports conservative association confidence when explicit branch metadata is absent, rather than pretending older repo sessions are certainly branch-specific.
- Aggregation identifies at least the first useful evidence classes: tool-call counts, failed tools, tools by name, repeated file reads, repeated shell commands, token usage when available, and large outputs when available.
- Scenario and unit tests cover the standalone command, hidden exec invocability, plugin smoke behavior, parser edge cases, and JSON contract stability.
- A skill or skill update delegates deterministic collection to `branch-retro exec collect-evidence` and keeps semantic recommendation writing in the skill/agent.
- The repository quality suite is green after the package, CLI, tests, and skill/docs changes land.

## Assumptions and Risks

Assumptions:

- Reusable session parsing and analysis is useful outside `asdl-retro`, so `asdl-core` is the right home for harness-neutral models, source interfaces, parsers, and aggregate metrics. PR 2 confirms the source/parser boundary can land independently of the `branch-retro` collector.
- Pi JSONL session logs are available locally and stable enough for a first adapter that extracts generic events, messages, tool calls, tool results, timestamps, and usage records. PR 2 validates this against synthetic structural fixtures; real-log validation remains for the later steelthread pass.
- A small harness-neutral session source boundary can support the Pi adapter now and later Claude/Codex adapters without over-generalizing the v1 schema. PR 2 de-risks the boundary by using explicit `harness`, `source_info`, `source_ref`, and `association` models while keeping Pi schema names inside the adapter.
- Repo/worktree association is useful even when exact branch metadata is missing, provided the payload marks that association as lower confidence.
- A single cohesive `collect-evidence` command will remove enough repeated tool calls and prompt mechanics from skills to justify a new package. PR 3 validates the command boundary for repo/branch resolution, session-source querying, compact summaries, warnings, and the skill-facing envelope; PR 4 still needs to prove richer aggregation removes enough repeated inspection work.
- Skills are the right consumers for the first version: they can decide which evidence matters and can propose documentation, skill, CLI, test, or code changes without the Python command becoming semantic.
- Existing asdl CLI package conventions are sufficient for a new `aretro` package with a standalone `aretro` CLI, hidden exec operations, and plugin discovery.

Risks:

- Session association may be too weak for older logs that lack explicit branch metadata. Mitigation: label confidence clearly and add explicit branch/session metadata capture in a later PR if needed.
- Session logs can be large or contain sensitive user/tool output. Mitigation: emit compact metrics and source references by default, avoid storing raw transcript content, and make any raw excerpts opt-in and bounded. PR 2 de-risks the parser/model layer by retaining output lengths/counts and selected safe arguments, not raw prompt, assistant, tool-result, or command-output text. PR 3 extends the mitigation at the CLI envelope by summarizing counts and source refs only and by testing that raw prompt/tool-output/command text is not emitted.
- The evidence schema could become too verbose, reintroducing token pressure for the skill. Mitigation: keep aggregate summaries compact, include limits, and test representative payload sizes. PR 3 de-risks the first envelope by returning only repo/query/source metadata, aggregate counts, compact session summaries, warnings, and empty `evidence_items`; representative payload-size validation remains for real sessions.
- Tool duration and wall-time data may be incomplete in existing logs. Mitigation: report fields only when evidence exists and distinguish missing telemetry from zero cost.
- The CLI boundary could creep into semantic recommendation logic. Mitigation: keep recommendation categories and prioritization in the skill, and test the CLI as deterministic extraction/aggregation only. PR 3 further de-risks this by implementing no LLM calls or recommendations and by leaving PR4 aggregation evidence as explicit empty `evidence_items` rather than pretending semantic analysis exists.
- The shared core boundary could become over-generalized before non-Pi providers exist. Mitigation: define only the narrow query/source and normalized-event vocabulary needed by the Pi adapter and branch retrospective evidence. PR 2 partly de-risks this by limiting normalized facts to session identity, association, counts, model/provider metadata, tool and command metadata, usage, source refs, and warnings.
- Pi-specific JSONL details could leak into generic core models. Mitigation: isolate harness quirks in the Pi adapter and keep shared analysis over normalized session facts. PR 2 partly de-risks this with a dedicated `sessions.adapters.pi_jsonl` module and tests that check shared model names are not Pi-prefixed.
- A new package adds maintenance overhead. Mitigation: keep the first command narrow, follow established package/test patterns, and avoid coupling it to brmem, Graphite, or provider-specific internals outside the adapter.

## Open Questions

- As aggregation begins, what additional harness-neutral facts are needed beyond the PR 2 vocabulary of source identity, source refs, conservative association, message counts, model/provider metadata, tool calls/results, command executions, usage counters, and warnings?
- How should future sessions record explicit branch metadata so association can become high-confidence without heuristics?
- Should a later PR add a local per-session summary cache, and if so should it live under Pi state, asdl state, or Branch Memory?
- What thresholds should define repeated reads, repeated commands, large outputs, and other evidence classes?
- Should the first skill produce only a recommendation report, or also offer follow-up commands to apply approved doc/skill/code changes?
