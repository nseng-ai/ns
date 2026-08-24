# Prompting Instructions

Load this reference for `## Prompting Instructions`, row-level `Prompting:` prose, or shaping the prompts an Objective's decision packets carry.

`objective-next` applies this section when it serializes a decision packet's proposed prompt (or an explicit decline). The record's `## Prompting Instructions` is its durable input to that serialization step — standing context the record states once so every produced prompt inherits it instead of each session re-deriving it.

It applies to every Objective pattern, not just execution-friendly ones: a steelthread record may shape runner-step prompts, an ideation record may shape grilling-session prompts for its Frontier questions, a planning-first record may shape research or plan prompts. The section is independent of `## Definition of Progress` and `## Runner Policy` — a record may carry any subset of the three.

## Objective-level section

Optional top-level prose section in `objective.md` after `## Completion Criteria`:

```md
## Prompting Instructions

Every prompt produced for this Objective should carry:

- Standing context: <key packages or folders, commands that matter, domain terms>
- Validation gate: <the concrete command(s) a prompt bakes in>
- Completion-evidence convention: <what "done" evidence looks like here>
- Default executor: <runner step / cold subagent / interactive session>
- Standing hazards: <what prompts must warn against>
```

All bullets are optional; keep only the ones the record can state durably.

## Row-level `Prompting:` prose

A roadmap row may carry `Prompting:` prose — per-row serialization hints (a tighter file surface, a specific validation command, "this row opens a grilling session"). Row-level `Prompting:` overrides Objective-level `## Prompting Instructions` for that row, mirroring how row-level `Policy:` overrides Objective-level execution policy.

## Interpretation rules

- Durable prose, not schema. Never in Record Frontmatter; never parsed by CLI code.
- Shapes serialization, never selection: it must not name which row is next. Step selection stays with the roadmap and narrative — prompting-instructions content that encodes ordering is drift to fix via `objective-update`.
- Advisory, not authorization: `## Prompting Instructions` alone grants no execution permission. Execution basis stays with durable execution policy (`references/execution-policy.md`) or recommendation-continuation confirmation.
- Feeds references, not transclusion. A produced prompt cites the anchors this section names — packages, folders, commands, terms — compactly. It never pastes this section into the prompt.
- Omitting it is fine; `objective-next` then derives prompt context per run.
- Stale prompting-instructions content (renamed packages, dead commands) is ordinary record drift; fix it through `objective-update` like any other stale prose.
