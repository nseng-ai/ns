# Subagent Pushdown

Subagent pushdown is the practice of using a runner subagent as a bounded semantic subroutine. The parent keeps ownership of the workflow, deterministic state, and validation. The subagent receives a focused question, enough artifact-backed evidence to answer it, and a compact return contract that is easy for the parent to inspect.

Use this pattern to manage context without confusing LLM-to-LLM communication with program-to-program APIs.

## Relationship to CLI Pushdown

CLI pushdown and subagent pushdown solve different problems:

- **CLI pushdown:** mechanics move to tested deterministic commands. Use it for parsing, filtering, sorting, grouping, pagination, retries, schema validation, and repeated command sequences. JSON is usually the right output.
- **Subagent pushdown:** bounded semantic work moves to a fresh LLM context. Use it for reading large artifacts, classifying ambiguous prose, comparing alternatives, or producing evidence-backed recommendations. Prose or Markdown keyed by stable references is usually the right output.

A healthy workflow often uses both: deterministic commands prepare compact manifests and validate results, while a subagent reads selected evidence and reports semantic judgments.

## Use Subagents For

- Large artifact reading when selected locators or compact manifests keep the scope bounded.
- Ambiguous human-prose classification, such as distinguishing an actionable review request from FYI/status noise.
- Bounded code review or design review against a supplied diff, file list, or manifest.
- Comparing a small set of alternatives and explaining tradeoffs.
- Evidence-backed recommendations where the parent can check cited paths, IDs, or locators.
- Independent inspection of files, issues, comments, logs, or payload artifacts.
- Cheap-model first passes where the parent validates the report before acting.

## Do Not Use Subagents For

- Deterministic parsing, filtering, sorting, pagination, retries, or validation.
- Strict JSON serialization as the main final-text deliverable.
- Broad work that depends on hidden parent context or global repository understanding not supplied to the subagent.
- Hidden side effects, background mutations, or workflow ownership.
- Avoiding a short direct read or an existing selected-detail CLI lookup.

If the work is mechanical and testable, push it into a CLI. If the work is semantic but bounded and inspectable, consider a subagent.

## Parent Responsibilities

The parent agent owns the end-to-end workflow:

1. Define why delegation is useful and what focused question the subagent must answer.
2. Provide bounded context, artifact paths, stable IDs, locators, counts, and relevant rules.
3. Specify authorization and safety limits, especially read-only behavior unless edits are explicitly intended.
4. Inspect the subagent status and final text before consuming it.
5. Translate semantic output into deterministic schemas when downstream tools require schemas.
6. Validate translated artifacts against manifests, counts, locators, and schema validators before acting.
7. Fix parent-owned translation or schema mistakes locally.
8. Retry or escalate only when the semantic report is incomplete, ambiguous, contradicted by evidence, or too human-sensitive for the chosen model.

The parent should not outsource workflow ownership, final validation, or downstream mutation decisions to the subagent.

## Subagent Responsibilities

A subagent should:

- Inspect the evidence it was given, including artifact paths and locators.
- Answer the focused question, not redesign the parent workflow.
- Cite the paths, locators, IDs, or line ranges it used.
- State coverage: what was inspected, what was accounted for, and what was not inspected.
- Name uncertainties, blockers, contradictions, or missing evidence.
- Avoid inventing IDs, locators, files, or context not present in the prompt.

## Interface Guidance

Prefer compact prose or Markdown reports with stable references. A useful report includes:

- a coverage summary;
- one section per stable ID, file, issue, thread, or comment;
- semantic labels or recommendations;
- concise rationale and evidence references;
- confidence, uncertainty, or blocker notes; and
- explicit “not inspected” notes where coverage is partial.

Avoid making the subagent copy boilerplate that the parent already has, such as long manifests, exact locators, empty arrays, or schema fields mechanically derivable from the parent context. Avoid strict JSON as the default final-text protocol between LLM routines. Strict JSON is brittle in freeform agent text and makes cheap models spend attention on serialization rather than judgment.

Structured subagent capture can still be appropriate when the parent deliberately uses terminal-capture mode, typed tool parameters, or another explicit structured capture mechanism. Treat that as a separate interface, not the default final assistant text contract.

## Deterministic Boundary Principle

JSON belongs at deterministic boundaries: agent to CLI, CLI to agent, tool to tool, and validator to planner. Those boundaries need stable structure, exact coverage, schema validation, and testable behavior.

Agent-to-agent boundaries should optimize for semantic clarity. The parent can then translate the semantic report into a deterministic artifact and validate it before any action.

## Validation and Escalation

Before acting on a subagent report, the parent should validate it against the evidence it already controls:

- required IDs and counts are accounted for;
- cited paths and locators exist;
- recommendations do not contradict manifests or source files;
- downstream schema artifacts validate; and
- safety or authorization constraints are still satisfied.

If validation fails because the parent copied a locator incorrectly, omitted an empty array, produced malformed JSON, or otherwise mishandled deterministic structure, fix the parent translation. Do not ask the subagent to repair schema mechanics.

If validation fails because the semantic report omitted an item, duplicated an item, misread evidence, or reported low confidence, retry the subagent once with the diagnostics. Escalate to the parent/default stronger model, or ask the user, when reviewer intent is human-sensitive, evidence requires broader code context, or the retry remains ambiguous.

## Worked Example: `pr-address` Feedback Classification

The `pr-address` workflow needs both deterministic guarantees and semantic judgment:

1. A CLI command fetches PR feedback and emits a compact manifest with stable review, thread, comment, locator, and payload references.
2. A CLI command builds a deterministic classification scaffold. IDs, locators, item pointers, and review-thread comment coverage are prefilled.
3. A classifier subagent reads selected payload evidence and returns a prose/Markdown classification report keyed by exact review IDs, thread IDs, discussion comment IDs, and covered comment IDs.
4. The parent fills only semantic fields in the scaffold from that report, preserving all deterministic fields copied from the scaffold.
5. A CLI validator checks the parent-generated JSON packet for schema validity and exact-once coverage.
6. A planner runs only after validation succeeds.

The anti-pattern is asking the subagent to return only the final strict JSON packet. That conflates semantic classification with machine serialization and creates failure modes such as malformed JSON, stale schema examples, missing empty arrays, copied locator mistakes, and lost coverage.

The target flow keeps the subagent focused on judgment while deterministic commands and the parent-owned scaffold preserve safety.

## Launch Checklist

Before launching a subagent, confirm:

- [ ] The task is semantic, bounded, and artifact-backed.
- [ ] A deterministic CLI or short direct read would not be simpler.
- [ ] The prompt includes all required paths, locators, IDs, counts, rules, and safety limits.
- [ ] The expected answer is a compact prose/Markdown report keyed by stable references.
- [ ] The report asks for coverage, evidence, confidence, and blockers.
- [ ] The parent has a deterministic way to validate or sanity-check the answer before acting.
- [ ] Downstream JSON or schema artifacts, if any, will be built and validated by the parent or deterministic tools.
