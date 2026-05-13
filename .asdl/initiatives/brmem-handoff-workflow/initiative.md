# Branch Memory Handoff Workflow

## Thesis

Agents need a durable, branch-scoped way to hand off work between sessions that is as easy to invoke as a lightweight skill but stores the resulting artifact in Branch Memory instead of an arbitrary local file. The steelthread is a new `branch-handoff` skill that creates a Markdown handoff artifact in `brmem` namespace `session-artifacts` under keys shaped like `handoffs/<slug>.md`.

This should let agent sessions run in serial, and eventually across multiple harnesses, with durable branch-local context that can later be harvested from merged PRs into the project knowledge base or corpus. The workflow should remain an artifact workflow, not a task system.

## Scope

The first pass creates a new first-party `branch-handoff` skill with no dependency on, or reference to, any existing temp-file handoff workflow. The skill should guide an agent to summarize the current session into a concise Markdown artifact and store it with `brmem put` in namespace `session-artifacts`.

The handoff artifact key should be slug-based, using the pattern `handoffs/<slug>.md`, so a single branch can contain multiple handoffs and a handoff can span more than one session. The skill should create or derive an artifact slug from the requested handoff focus when one is not supplied, then preflight Branch Memory so it does not accidentally overwrite an existing artifact.

The skill should also explain how a later session or different harness can discover and read stored handoffs for the current branch using `brmem list` and `brmem get`.

## Non-Goals

- Do not modify or replace any existing handoff skill.
- Do not create Python CLI tooling for the steelthread.
- Do not introduce a task database, workflow controller, state machine, owners, due dates, or hidden metadata.
- Do not hardcode a single `handoff.md` entry per branch.
- Do not require artifact storage in working-tree files, PR comments, issues, or temp files.
- Do not implement harvesting merged PR artifacts into the knowledge base yet; only preserve a layout that makes harvesting plausible later.

## Completion Criteria

- A new first-party `branch-handoff` skill exists and is discoverable.
- The skill creates Markdown handoff artifacts in Branch Memory namespace `session-artifacts` with keys shaped like `handoffs/<slug>.md`.
- The skill creates or derives an artifact slug when one is not supplied, and refuses accidental overwrite unless the user explicitly asks to replace an existing artifact.
- The skill gives future sessions enough instructions to list and read handoff artifacts from the same branch.
- The skill remains skill-only for the steelthread and uses the existing `brmem` CLI directly.
- The skill is documented clearly enough that an agent can use it without knowing any prior temp-file workflow.

## Assumptions and Risks

Assumptions:

- Branch Memory is the right durability layer because the artifacts should be branch-scoped, inspectable, and separate from working-tree files or commits.
- A single namespace, `session-artifacts`, is broad enough for future session summaries and lessons learned without forcing a new storage scheme.
- Slug-shaped keys under `handoffs/` are sufficient to support multiple handoffs per branch and multi-session continuation.
- A skill-only steelthread is enough to validate the workflow before adding CLI validation or higher-level automation.

Risks:

- The slug-collision risk is de-risked for the steelthread by the implemented skill rule: use an explicit slug when provided, otherwise derive concise kebab-case from the handoff focus/title, and preflight with `brmem check` before writing.
- If artifacts become too broad, Branch Memory may turn into an unstructured task system; the skill keeps handoffs concise and artifact-oriented, but this remains a risk to watch as more artifact types are added.
- If future harnesses interpret the artifact layout differently, harvesting and cross-harness reuse may become brittle; the initial key pattern and namespace are now documented explicitly in the skill.
- The overwrite-loss risk is de-risked for the steelthread by requiring `brmem check` and explicit replacement intent before `brmem put` overwrites an existing artifact.

## Open Questions

- When harvesting artifacts from merged PRs is implemented later, which artifact types beyond handoffs should be collected first?
