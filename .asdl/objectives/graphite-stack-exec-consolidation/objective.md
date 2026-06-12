# Graphite Stack Exec Consolidation

## Thesis

Agents should not parse human-facing Graphite output such as `gt ls`, `gt ls --stack`, or `gt log --stack` when they need stack topology. ASDL already has programmatic Graphite metadata readers, but the agent-facing workflows still lack a single canonical structured command. This Objective tracks consolidating Graphite stack facts behind explicit `gt`-named exec helpers, updating skills to use those helpers, and pushing the remaining stack-address preflight mechanics into tested CLI surfaces.

## Scope

- Expose a canonical structured command for the current Graphite stack's non-trunk branches in trunk-to-tip PR coverage order, likely under the explicit Graphite boundary `slot gt exec`.
- Define the command contract so it is pipe-friendly for `pr-address exec map-branch-prs` while still offering richer JSON diagnostics for agents.
- Audit and update agent-facing skills and references that currently tell agents to inspect or parse `gt ls`, `gt ls --stack`, or `gt log` for stack topology.
- Decide which additional structured Graphite exec facts belong with the canonical helper, such as stack info, descendant subtree/fork structure, or current tracking status.
- Include the broader stack-address preflight push-down in completion: branch-to-PR mapping, stack JSON construction, compact `stack-feedback-prep` invocation, and summary/reference output should be consolidated into a tested helper or a deliberately documented command sequence.
- Audit the existing TypeScript `asdl-dev submit` `gt log --stack` parser and decide whether to replace it with structured topology facts or document why its submit-specific behavior remains separate.

## Non-Goals

- Do not wrap ordinary Graphite mutations such as `gt create`, `gt modify`, `gt submit`, `gt restack`, or `gt move` merely to hide Graphite.
- Do not move GitHub PR mapping into a Graphite command; branch-to-PR mapping remains PR-address/GitHub domain unless a higher-level preflight helper composes it explicitly.
- Do not couple lower-level Python helpers to CCC's private TypeScript orchestration layer.
- Do not make `pr-address` depend on Graphite except through explicitly Graphite-named command paths or caller-supplied structured input.
- Do not treat Graphite's SQLite metadata schema as a public unlimited contract; fail closed on unsupported schema or ambiguous topology.

## Completion Criteria

- A canonical agent-invoked command exists for current-stack branch discovery without parsing `gt ls`/`gt log` display output.
- The command's output contract is documented and tested for ordering, current branch inclusion, trunk exclusion, untracked branches, missing metadata, warnings, and fork/ambiguity handling.
- `stack-address` no longer instructs agents to build branch lists from `gt ls --stack`; it uses the canonical command and preserves strict open-PR coverage.
- Agent references that mention `gt ls`/`gt log` for machine decisions are audited and either updated to structured helpers or explicitly limited to human visual confirmation.
- Stack-address preflight mechanics are pushed down or otherwise canonicalized so agents do not manually hand-build branch-to-PR stack JSON and compact prep summaries with brittle shell/JQ steps.
- The `asdl-dev submit` `gt log --stack` parser has an explicit decision: replaced, routed through a structured helper, or retained with documented submit-specific rationale and risk.

## Assumptions and Risks

Assumptions:

- `asdl_core.gt.GtGateway.stack()` and the existing Graphite metadata reader are the right starting point for Python-side structured stack facts.
- `slot gt` is the appropriate explicit Graphite dependency boundary for reusable Graphite exec commands.
- `pr-address exec map-branch-prs` should remain Graphite-neutral and consume branch lists supplied by a Graphite-aware caller or preflight helper.
- The broader stack-address preflight helper can be designed without collapsing too much semantic agent judgment into CLI code.

Risks:

- Graphite's metadata DB is private and schema-versioned; structured helpers must fail closed and provide clear remediation when metadata is missing, stale, or unsupported.
- Forked stacks can make a linear trunk-to-tip branch list ambiguous. The helper must expose or reject ambiguity rather than silently following an arbitrary first child.
- Over-consolidating into one helper could blur domain boundaries between Graphite topology, GitHub PR mapping, and PR feedback collection.
- Some existing `gt ls`/`gt log` references may be human-only verification guidance; replacing all mentions mechanically could remove useful visual checks.
- Replacing the TypeScript submit parser may require careful coordination with `asdl-dev` submit metadata behavior and may not be worth doing in the first implementation slice.

## Open Questions

- Should the first canonical command be only `stack-branches`, or should it expose a broader `stack-info` contract from the start?
- Should forked stacks produce a negative exit by default, an explicit diagnostic with partial branch list, or require an opt-in flag to follow a selected path?
- Should the stack-address preflight consolidation live in `pr-address exec` as a Graphite-neutral helper that accepts branch JSON, or in a Graphite-named command that composes topology and PR-address helpers?
- Which `gt ls`/`gt log` skill references are machine-decision hazards versus acceptable human visual confirmations?
