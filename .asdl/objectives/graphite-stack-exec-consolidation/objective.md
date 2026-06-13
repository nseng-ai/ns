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

- `asdl_core.gt.GtGateway.stack()` and the existing Graphite metadata reader are the right starting point for Python-side structured stack facts. Revised during contract design: the starting point holds, but `StackInfo` reports forks, cycles, and missing metadata rows only as prose warning strings, which cannot support fail-closed classification at the CLI layer; structured walk diagnostics on `StackInfo` are a prerequisite slice.
- `slot gt` is the appropriate explicit Graphite dependency boundary for reusable Graphite exec commands.
- `pr-address exec map-branch-prs` should remain Graphite-neutral and consume branch lists supplied by a Graphite-aware caller or preflight helper.
- The broader stack-address preflight helper can be designed without collapsing too much semantic agent judgment into CLI code.

Risks:

- Graphite's metadata DB is private and schema-versioned; structured helpers must fail closed and provide clear remediation when metadata is missing, stale, or unsupported.
- Forked stacks can make a linear trunk-to-tip branch list ambiguous. The helper must expose or reject ambiguity rather than silently following an arbitrary first child. Decision recorded (not yet de-risked in code): fail closed by default with a `forked_stack` error naming the fork point and children; `--downstack` is the unambiguous escape hatch.
- Over-consolidating into one helper could blur domain boundaries between Graphite topology, GitHub PR mapping, and PR feedback collection.
- Some existing `gt ls`/`gt log` references may be human-only verification guidance; replacing all mentions mechanically could remove useful visual checks.
- Replacing the TypeScript submit parser may require careful coordination with `asdl-dev` submit metadata behavior and may not be worth doing in the first implementation slice.

## Open Questions

- Should the stack-address preflight consolidation live in `pr-address exec` as a Graphite-neutral helper that accepts branch JSON, or in a Graphite-named command that composes topology and PR-address helpers?

Resolved (see `updates/2026-06-12-stack-branches-command-contract.md` for the full contract):

- First canonical command scope: `stack-branches` only. Richer stack facts (trunk, current, scope, warnings) ride in its `--format json` data payload; a broader `stack-info` command is deferred to the exec-candidate audit roadmap item.
- Fork behavior: fail closed by default — exit 2 with `error_type: forked_stack`, no partial branch list on stdout, message naming the fork branch and its children with remediation (check out the intended tip, or pass `--downstack`). Descendant-side forks are out of scope under `--downstack` and surface as warnings with exit 0. No "follow a selected path" flag in the first slice.
- Machine-decision hazards vs visual confirmations: audited. Hazards to migrate: `skills/stack-address/SKILL.md` preflight (builds branch lists from `gt ls --stack`), `skills/pr-address/references/cli-collection.md` (suggests `gt ls --stack` as branch source), `skills/code-workflows/references/delete-stack.md` (instructs discovering the stack from `gt branch info`/`gt ls`/`gt log` output). Acceptable human visual confirmations to retain: `gt ls`/`gt log` mentions in `code-gt-restack-resolve`, `code-resolve-merge-conflicts`, and `setup-graphite`. The TS `asdl-dev` submit `gt log --stack` parser remains its own roadmap decision.
