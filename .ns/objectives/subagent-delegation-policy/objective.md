# Subagent Delegation Policy

## Thesis

Parent-agent subagent guidance in this repo is fragmented across four surfaces written at
different times — a hardcoded tool snippet, per-agent `promptGuidelines`, the injected
`## Subagent delegation` doctrine, and the child prompt bodies — with no unified policy, no
timing rule, proven drift (dead `promptSnippet` fields the tool ignores), and no
content-level enforcement. The cost is real: on branch `add-session-logs-to-handoffs`, a
simple change expanded into a session whose "Investigate handoff requirements" episode
consumed ~209k tokens (~71% of live context) on parent-owned exploration that existing
guidance was supposed to delegate to explorer subagents. This Objective defines one
canonical delegation policy — purpose, a pre-exploration decision gate, a decision ladder,
context-economy rules, and named anti-patterns — gives every guidance surface exactly one
documented job, and enforces the result with tests.

## Scope

- **Policy content.** A single canonical statement of: why subagents exist (protect parent
  context; parent owns judgment); the decision gate (the delegate-or-not decision happens
  at task intake, before the first broad search or multi-document read — not after);
  the decision ladder (known file/trivial → direct; mapping multiple
  files/subsystems/required docs → batched explorers; self-contained change with complete
  context → task agent; judgment/design/user interaction → parent, never delegated);
  context economy (parent retains maps, conclusions, exact edit locations — never raw
  exploration); and named anti-patterns (parent-heavy exploration with late review-only
  delegation; delegating known-trivial reads; overlapping explorer scopes).
- **Surface contract.** Each surface carries one lane: doctrine preamble = the policy;
  per-agent `delegationDoctrine` = agent-specific trigger rows only; `promptGuidelines` =
  per-call mechanics only (batching, parameters, status interpretation, model
  inheritance); `promptSnippet` wired up or deleted; child prompt bodies = child-only
  rules; package README/AUTHORING document the contract itself plus doctrine coverage
  (which sessions receive it).
- **Enforcement.** Tests asserting the assembled doctrine carries the gate and
  anti-pattern content, and contract tests keeping surfaces in their lanes.
- **Context-economy convention.** The repository-level context-economy convention — parent
  and subagent evidence inheritance, revalidation from artifact anchors, named-trigger
  expansion, and "do not repeat the child's scan in the parent" — is canonically documented
  in `docs/conventions/agent-context-economy.md` (introduced by branch
  `evidence-inheritance-context-economy-policy`). This Objective is the canonical owner of
  the context-economy policy across both surfaces: it keeps the injected delegation
  doctrine's context-economy rules aligned with that convention by reference rather than
  restatement, so the convention has one home and the doctrine stays compact.
- **Owning code.** `ts/packages/internal/ns-pi-subagents` — `src/delegation-doctrine.ts`
  (`SUBAGENT_DELEGATION_INTRO`, `buildSubagentDelegationDoctrine`), `src/extension.ts`
  (`before_agent_start` injection, ~lines 84–88), `src/tool/subagent.ts`
  (`registerSubagentTool`: hardcoded snippet, guidelines flatten, `doctrineSections`) —
  plus the consumer definitions `.ns/pi/agents/explorer.md` and `.ns/pi/agents/task.md`,
  and `ts/packages/hosts/pi/src/runtime/agent-definition.ts` only if wiring
  `promptSnippet` requires parser changes. Existing tests to extend:
  `test/delegation-doctrine.test.ts`, `test/package.test.ts` (doctrine assembly),
  `test/agents/explorer-contract.test.ts`, `test/explorer-guidelines.test.ts`.

## Non-Goals

- Runner terminal-capture protocol injection
  (`src/runner-subagents/subagent-runtime-extension.ts`) — runtime protocol, not
  delegation policy.
- Fleet/run observability UI (owned by `subagent-run-observability`).
- Migrating subagent execution to harness-session-generation capabilities.
- Injecting doctrine into child sessions — children intentionally run with
  `extensions: false` / `--no-extensions` and keep their own prompts.
- Quantitative delegation thresholds (token or file counts) without repository evidence.
- Changing the doctrine assembly/injection architecture itself; this is a content and
  contract effort, not plumbing redesign.

## Completion Criteria

- One canonical policy statement exists containing the pre-exploration gate, decision
  ladder, context-economy rules, and named anti-patterns, and reaches extension-enabled
  parent sessions through the existing `before_agent_start` assembly.
- Each guidance surface carries only its lane; the duplicated explorer
  read-only/batching/selection wording is collapsed; dead `promptSnippet` fields are
  wired or removed.
- The surface contract and doctrine coverage (parents with the extension: yes; child
  sessions: no; runner substrate: separate protocol) are documented in the package's
  AUTHORING.md/README so future edits know where guidance text belongs.
- Tests assert policy content presence (gate and anti-patterns in the assembled
  doctrine) and cover the surface contract at least structurally.
- The assembled doctrine stays compact: the policy must not materially bloat every
  parent session's system prompt — bloat defeats the policy's own purpose.
- The doctrine's context-economy rules reference the canonical convention
  `docs/conventions/agent-context-economy.md` instead of restating it, and the two do not
  drift.

## Assumptions and Risks

Assumptions:

- A qualitative gate ("before the first broad search or multi-document read in an
  unfamiliar area") is sufficient; no numeric thresholds. If a future session finds
  evidence that qualitative wording still fails to fire, revisit rather than invent
  numbers.
- The existing injection mechanism (`registerSubagentTool` →
  `buildSubagentDelegationDoctrine` → `before_agent_start`) remains in place.
- Agent definitions remain consumer Markdown at `.ns/pi/agents/*.md` parsed by
  `hosts/pi`'s `agent-definition.ts`.
- This work has no code dependency on PR #3561 (`add-session-logs-to-handoffs`); it can
  land from a fresh branch off `master`.
- `docs/conventions/agent-context-economy.md` is the canonical home for context-economy /
  evidence-inheritance rules; the injected doctrine references it rather than owning a
  second copy.

Risks:

- Policy prose rots silently: current tests check assembly mechanics (ordering,
  healthy/unhealthy degradation, headings) but zero policy content. Mitigated by the
  enforcement slice.
- Content-phrase tests can be brittle; balance exact-sentence assertions against
  structural checks when writing them.
- The original failure was behavioral — guidance existed but never fired before parent
  exploration began. Rewritten wording must be imperative and sequenced, and only
  real-session observation truly validates it; a landed PR is necessary but not
  sufficient evidence.
- Duplication tends to be reintroduced by future edits unless the surface contract is
  both documented and tested.
- The context-economy convention doc lands via a separate branch
  (`evidence-inheritance-context-economy-policy`), so the context-economy reference carries
  a cross-branch dependency: if that doc's path, name, or content shifts before landing, the
  doctrine reference must be updated in step.

## Open Questions

- Canonical home for the shared policy preamble: platform TS constant (status quo —
  though it currently embeds consumer-ish "this repo" phrasing in platform code) vs.
  consumer Markdown loaded by the builder. Decide during the first slice after reading
  `docs/conventions/platform-and-consumer.md`. The context-economy sub-portion of the
  preamble now has a canonical home in `docs/conventions/agent-context-economy.md`; this
  question remains open only for the delegation-specific doctrine preamble.
- `promptSnippet`: wire the per-agent snippets into tool registration, or delete the
  dead fields and keep one tool-level snippet.
- Enforcement depth: content-presence tests only, or also negative lane tests (e.g.,
  `promptGuidelines` must not restate when-to-delegate policy).
- Whether "treating a non-final-text status as done" belongs in the named anti-pattern
  list or stays a task-agent mechanics bullet in `promptGuidelines`.
