# Pi Stack Run Extension

## Thesis

Multi-PR Objective work currently relies on an agent remembering a procedural protocol: create the next branch, reset context, load the Objective and previous handoff, implement one slice, validate, update the Objective, store another handoff, and stop. That protocol is valuable but too easy to drift from across long sessions.

This Objective will build a project-local Pi extension that automates the workflow control plane for implementing an ordered Graphite stack while preserving the agent as the semantic implementer. The extension should own stack-plan loading, Branch Memory artifacts, branch/session orchestration, and structured completion/blockage signals. The agent should still read the plan body, inspect the codebase, make implementation decisions, edit files, run validation, update Objectives, and draft handoffs.

The v1 design is intentionally small and durable. A stack plan is stored in Branch Memory as Markdown with minimal YAML frontmatter containing only the Objective slug and ordered `planned_branches`. The Markdown body remains human-authored guidance for the agent and is not parsed by the extension, except for a literal check that each planned branch string appears somewhere in the body. Each slice branch has a pointer-only Branch Memory ledger that records which Branch Memory plan entry and content hash started it. Completion is inferred from the expected handoff artifact existing on that slice branch.

## Scope

In scope:

- Add a project-local Pi extension under `.pi/extensions/asdl-stack-run/`.
- Use the Pi extension APIs for slash commands, custom tools, `ctx.newSession(...)`, and shell execution through the extension runtime.
- Use the `yaml` npm package directly, with a tiny deterministic frontmatter fence extractor, for plan and ledger frontmatter parsing.
- Define and validate runtime-only TypeScript schemas for:
  - `asdl.stack-plan.v1` plan frontmatter;
  - `asdl.stack-slice-ledger.v1` pointer-only slice ledger frontmatter.
- Store stack plans in Branch Memory:
  - namespace: `stack-plans`;
  - key: `<objective>.md`;
  - branch: the branch where `/stack-run` starts.
- Support `/stack-run <local-plan-file>` by validating the local file, storing it in Branch Memory as the canonical plan, and continuing from the Branch Memory entry.
- Support running an existing Branch Memory plan by key.
- Treat branch names as slice identity.
- Derive Branch Memory keys from objective plus branch, using `---` as the slash escape, and reject planned branch names that contain literal `---`.
- Derive slice handoff keys under `session-artifacts` rather than requiring the plan frontmatter to repeat them.
- Create slice branches with raw git from the intended parent and immediately track them with Graphite using `gt track`; do not create placeholder or empty implementation commits.
- Require a clean worktree before starting a slice branch.
- Start a fresh Pi session for each slice, with a small kickoff prompt that points the agent at the Branch Memory plan, Objective, current branch, prior handoff when one exists, and required structured tools.
- Register structured custom tools:
  - `stack_slice_done` for completion reports and handoff drafts;
  - `stack_slice_blocked` for v1 blockage reports that stop the workflow.
- For v1, trust the agent's `stack_slice_done` payload, trust that the agent ran validation, and have the extension store the agent-drafted handoff in Branch Memory.
- Write concise branch-local slice ledgers in Branch Memory namespace `stack-runs`, with pointer-only frontmatter:

```yaml
schema: asdl.stack-slice-ledger.v1
plan:
  branch: <plan-branch>
  namespace: stack-plans
  key: <objective>.md
  sha256: <plan-content-hash>
```

- Infer slice completion from the expected handoff artifact existing in `session-artifacts` on the slice branch.
- Add enough status/recovery behavior for `/stack-run` or a follow-up command to resume the first incomplete planned branch when possible.

Out of scope for v1:

- Making the extension an implementation engine or semantic planner.
- Parsing the Markdown plan body into tasks, validation commands, or sections.
- Maintaining a mutable lifecycle status such as `running`, `complete`, `blocked`, or `aborted` in the slice ledger.
- Storing raw transcripts, tool output, validation logs, or code diffs in Branch Memory.
- Adding checked-in JSON Schema files for the plan or ledger schemas.
- Building a generic reusable Pi package or global extension before the project-local workflow proves useful.
- Automatically submitting Graphite PRs.

## Non-Goals

- Do not replace Objectives, Graphite, Branch Memory, or the existing agent skills; the extension coordinates them.
- Do not turn Branch Memory into a hidden task database. In v1 it stores the plan artifact, pointer-only slice ledgers, and handoff artifacts.
- Do not parse human Markdown as structured task state. The only machine-readable plan contract is the frontmatter.
- Do not create placeholder commits merely to make a branch appear in Graphite. The first real commit should be created by `gt modify` after the agent has implemented the slice.
- Do not verify all mechanical completion facts in v1. The trusted `stack_slice_done` protocol is a deliberate simplification, with later hardening expected if the steelthread proves useful.
- Do not store or expose secrets, raw session logs, or large generated outputs.

## Completion Criteria

- `.pi/extensions/asdl-stack-run/` exists as a project-local Pi extension with its runtime dependencies declared locally.
- The extension validates minimal stack-plan frontmatter with `schema: asdl.stack-plan.v1`, `objective`, and ordered `planned_branches`.
- `/stack-run <local-plan-file>` stores a validated plan in Branch Memory namespace `stack-plans` using key `<objective>.md` on the starting branch. Identical existing content is accepted; differing content requires explicit replacement or confirmation.
- `/stack-run <plan-key>` can load and validate an existing Branch Memory stack plan.
- The extension rejects planned branches containing literal `---` and derives ledger/handoff keys deterministically using `---` as the slash escape.
- The extension checks that each planned branch string appears literally in the plan body without parsing Markdown sections.
- The extension can find the first incomplete planned branch by combining branch-local pointer ledgers and derived handoff existence.
- Starting a slice requires a clean worktree, creates/checks out the planned branch with raw git from the intended parent, and tracks it with Graphite without creating an empty commit.
- Each started slice branch receives a pointer-only Branch Memory ledger in namespace `stack-runs` pointing back to the canonical Branch Memory plan entry and content hash.
- Each slice starts in a fresh Pi session with a compact kickoff prompt that tells the agent what to load and how to signal completion or blockage.
- `stack_slice_done` and `stack_slice_blocked` are registered Pi custom tools. `stack_slice_done` carries an agent-drafted handoff and queues closeout; `stack_slice_blocked` stops the workflow in v1.
- Slice closeout stores the handoff draft in Branch Memory namespace `session-artifacts` under the derived key for the current branch.
- The workflow can resume after interruption by reading the Branch Memory plan and branch-local ledger rather than relying on prior chat history.
- The Objective includes tests or documented validation appropriate for the extension code, and the repository quality suite remains green after the extension and Objective updates land.

## Assumptions and Risks

Assumptions:

- Pi's extension APIs are sufficient for this control plane: slash commands can call `ctx.newSession(...)`, custom tools can be invoked by the model, and tools can queue follow-up slash commands for session-replacement work.
- A project-local extension is the right first home because the workflow depends on this repo's Objective, Branch Memory, Graphite, and handoff conventions.
- Branch Memory is an appropriate durability layer for stack plans, pointer ledgers, and handoff artifacts because these are branch-scoped, inspectable text artifacts and the repo already depends on `brmem`.
- Minimal plan frontmatter plus human-readable plan body is enough for the extension/agent boundary: the extension gets deterministic branch order, and the agent interprets the body using the current branch name.
- Using branch names as slice identity is stable enough for v1. If branches are renamed, the plan and relevant Branch Memory artifacts may need manual repair.
- Trusting `stack_slice_done` is acceptable for the first steelthread because it keeps the extension small and lets hardening be driven by observed failures.

Risks:

- The trusted completion protocol may advance after incomplete validation, missing Objective updates, or inaccurate handoff content. Mitigation: keep v1 supervised by default and design later hardening around mechanical verification.
- Minimal frontmatter may make plan authoring ambiguous if the Markdown body does not clearly name each branch. Mitigation: require literal branch presence in the body and include the current branch in the kickoff prompt.
- Branch Memory plan storage can diverge from a local draft if users edit a file after storing it. Mitigation: treat the Branch Memory entry as canonical once `/stack-run` stores it and preserve a content hash in slice ledgers.
- Graphite metadata can drift from the planned branch order after manual restacks. Mitigation: use the plan as the creation recipe and Graphite/git as actual branch state during recovery, warning rather than silently rewriting history when they disagree.
- Rejecting branch names containing `---` is a small constraint, but it keeps derived keys readable and reversible.
- Keeping schemas only in TypeScript runtime validation avoids checked-in schema overhead, but external repair tools will not have a separate JSON Schema contract.
- Project-local Pi extension code may not be covered by the existing Python-focused validation suite unless explicit TypeScript or command-level checks are added.

## Open Questions

- What exact slash command names should ship in v1: `/stack-run`, `/stack-continue`, `/stack-status`, and internal `/stack-closeout`, or a smaller command surface first?
- What is the minimal useful `stack_slice_done` parameter schema after branch and handoff key derivation are handled by the extension?
- How much UI confirmation should supervised mode require at plan storage, branch start, and closeout?
- What is the best lightweight way to test a project-local Pi extension in this repo's existing validation setup?
- Should a v2 add mechanical verification of current branch, changed files, Objective update presence, validation reruns, clean worktree, and Graphite branch state before advancing?
- Should the extension eventually graduate into a reusable Pi package or remain repo-local as an asdl workflow tool?
