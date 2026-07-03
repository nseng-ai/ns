# Agent-Era CLI Design Survey

## Purpose

This survey maps command-line interface guidance for two overlapping audiences:
humans using a terminal directly, and AI agents consuming CLI output inside a
context window. It is intentionally not an ADR. The goal is to preserve the
competing positions and identify decisions that ji/Clinkr must resolve in ADRs
before turning them into hard rules.

Sources consulted:

- Command Line Interface Guidelines, <https://clig.dev/>
- Anthropic, "Writing effective tools for AI agents", <https://www.anthropic.com/engineering/writing-tools-for-agents>
- Speakeasy, "Making your CLI agent-friendly", <https://www.speakeasy.com/blog/engineering-agent-friendly-cli>
- Agent Layer documentation, <https://agent-layer.dev/docs/>

## Baseline: clig.dev's human-first CLI

clig.dev explicitly frames modern CLIs as **human-first** text UIs rather than
pure machine interfaces. Its core stance is not anti-automation: composability,
standard streams, exit codes, JSON, and stable interfaces remain essential. The
emphasis is that good automation behavior should not require hostile defaults for
humans.

High-confidence guidance from clig.dev:

- Use an argument parsing library; basic flag/help behavior should be boring and
  conventional.
- Return exit code `0` on success and non-zero on failure; map non-zero codes to
  important failure modes.
- Send primary output, including machine-readable output, to `stdout`; send
  errors, logs, and status messaging to `stderr`.
- Provide concise default help and complete `-h`/`--help` help.
- Prefer human-readable output by default, but provide `--json` for structured
  machine-readable output and `--plain` when rich human formatting would break
  line-oriented composition.
- Keep successful output brief, but say enough that humans do not wonder whether
  state-changing commands hung or silently did something surprising.
- Make errors useful: catch expected errors, rewrite them for humans, reduce
  noise, suggest next steps, and avoid raw tracebacks except as debug context.
- Never require prompts; prompts are allowed only when `stdin` is a TTY, and
  `--no-input` should disable interactivity.
- Confirm dangerous operations, with escalating confirmation strength for more
  severe actions; provide scriptable alternatives such as `--force` or explicit
  confirmation values.
- Use `--dry-run` for operations where users should inspect intended changes
  before committing them.
- Treat output formats, flags, subcommands, and config as long-lived interfaces;
  keep changes additive where possible.

Important clig.dev philosophy for ji: human-first and composable are compatible,
but a CLI must be explicit about which output is a human UI and which output is a
stable interface.

## Agent-era guidance

Agent-era guidance starts from a different consumer model. A script or pipe reads
bytes deterministically; an LLM agent reads output as context, chooses among many
tools probabilistically, and is constrained by tokens, tool descriptions, and
error-recovery loops.

### Anthropic: tools as contracts with nondeterministic agents

Anthropic argues that tools for agents are a new kind of software contract: the
caller is nondeterministic and may choose the wrong tool, wrong arguments, or an
inefficient strategy. Its guidance emphasizes:

- Build fewer, higher-level tools that match real workflows instead of exposing
  every low-level API operation.
- Namespace tools so agents can distinguish boundaries and avoid confusing
  overlapping capabilities.
- Return meaningful context, not maximal raw data. Prefer semantic names and
  task-relevant fields over low-level identifiers unless those identifiers are
  needed for follow-up calls.
- Offer response verbosity controls such as concise vs detailed output when both
  high-level reading and follow-up identifiers matter.
- Optimize for token efficiency with pagination, filtering, range selection,
  truncation, and sensible defaults.
- When truncating, tell the agent how to get the next or narrower result.
- Treat errors as steering signals: validation failures should include specific,
  actionable corrections and examples, not opaque codes or tracebacks.
- Evaluate tools with realistic agent tasks and track tool calls, errors, token
  use, and latency, not just final task success.
- Prompt-engineer tool descriptions/specs because those descriptions are loaded
  into the agent's context and shape tool choice.

For CLI design, the direct translation is that an agent-facing command should not
only be parseable; it should actively preserve context budget and steer recovery.

### Speakeasy: agent-friendly CLIs as discoverable structured tools

Speakeasy's agent-friendly CLI guidance converges on the need for CLIs that are
simple for agents to inspect and call. The relevant themes are:

- Stable, predictable command and flag shapes are more important for agents than
  clever interactive flows.
- Structured output is a first-class contract, not a bolt-on convenience.
- Machine-readable documentation and context surfaces help agents discover the
  right command without scraping human prose.
- Non-interactive usage needs explicit support; a command that blocks on a prompt
  is a poor agent tool.
- Generated or schema-backed CLIs can keep implementation, docs, and machine
  expectations aligned.

For ji, this supports Clinkr's existing direction: typed schemas,
`resultSchema`, deterministic JSON envelopes, and command-level schema emission
are agent-era advantages.

### Agent Layer: workflow skills over raw commands

Agent Layer frames agent usage around skills/workflows layered above CLI tools.
Its relevant design pressure is that CLIs are not always consumed directly by a
human or a bare script; they may be invoked from procedural agent instructions.
That strengthens the case for:

- stable command contracts that skills can reference;
- explicit non-interactive and machine-readable modes;
- outputs that are compact enough to be pasted into an agent context;
- hidden or namespaced command groups for agent-only operations when a command is
  not meant to be top-level human UX.

ji already follows this pattern with hidden `exec` subgroups for skill-invoked
operations.

## Where the sources agree

These points have enough cross-source agreement to become candidate hard rules in
`sdl-cli-design`, subject to checking Clinkr support:

1. **Parseable structure is mandatory for agent-facing commands.** Humans may see
   rich prose; agents need explicit formats, schemas, or envelopes.
2. **Human output and machine output are different interfaces.** Human output can
   evolve; machine output must be stable and documented.
3. **Non-interactive operation must be explicit and reliable.** Prompts are for
   TTY humans; agents and scripts need flags or fast failures with corrective
   guidance.
4. **Errors should be actionable.** They should identify what failed, why it is
   recoverable or not, and what input or command shape to try next.
5. **Context volume is a design constraint.** Long lists, logs, diffs, and search
   results need filters, pagination, truncation, compaction, or summaries.
6. **Dangerous writes need visible intent.** Destructive or broad operations need
   confirmations, force/confirm flags, dry-run support, or a typed preview.
7. **Docs and schemas are part of the interface.** Help text, examples,
   `--json-schema`, and agent-facing skill prose must agree.

## Contested or unresolved decisions

### Exit codes vs structured error envelopes

clig.dev says non-zero exit codes should map to important failure modes. Some
CLI traditions use richer numeric taxonomies. Clinkr currently leans toward a
small process-level distinction plus a structured machine envelope carrying
`error_type`.

Decision needed: should ji standardize richer numeric exit codes, keep simple
`0`/`1`/`2` process semantics and rely on envelope fields, or define a hybrid?

Dissent to preserve: rich numeric codes are easy for shells but lossy for agents;
structured envelopes are agent-friendly but require consumers to parse JSON and
may not help simple shell conditionals.

### TTY-sensitive output vs explicit stable formats

clig.dev recommends human-readable output by default and notes TTY detection as a
heuristic for human output. Agent guidance values predictable outputs and explicit
formats. Auto-switching behavior can surprise agents, tests, and scripts.

Decision needed: when should ji commands vary output by TTY, and when must they
require an explicit `--format`, `--json`, `--plain`, or `--compact` flag?

Dissent to preserve: TTY-sensitive defaults improve direct human UX; explicit
formats improve reproducibility and agent reliability.

### Pretty JSON parity vs compact/token-efficient JSON

clig.dev recommends formatted JSON for `--json`. Clinkr has a documented
byte-compatible Python parity concern around JSON key order, `ensure_ascii`, and
`indent=2`. Anthropic-style agent guidance pushes toward token efficiency and
compaction for large responses.

Decision needed: should Clinkr preserve pretty JSON as the default machine
format, add an opt-in compact mode, or change defaults for agent-facing `exec`
commands?

Dissent to preserve: pretty JSON is readable and parity-preserving; compact JSON
saves tokens but may be worse for humans and could violate compatibility.

### Pagination/truncation strategy

Anthropic recommends pagination, filtering, range selection, and truncation with
helpful continuation guidance. clig.dev recommends pagers for large human output.
Those are different mechanisms: a pager helps a terminal human, while an agent
needs bounded returned bytes plus a continuation contract.

Decision needed: should Clinkr provide first-class pagination/truncation helpers,
a generic compaction layer, per-command result shaping, or only guidance in the
skill?

Dissent to preserve: central primitives create consistency but may impose the
wrong abstraction on domain-specific commands; per-command design can be better
fit but may drift.

### Usage errors inside the machine envelope

Agent-era guidance wants recoverable errors to be structured and actionable.
Traditional parser usage errors often print help-like text and exit before the
handler returns a typed result. If those errors bypass Clinkr's envelope, agents
get an inconsistent contract.

Decision needed: should argument/usage errors be represented in the same machine
envelope as handler failures for `--format json`, including structured data and
suggested corrections?

Dissent to preserve: enveloping parser errors improves agent consistency; parser
native errors may be simpler and closer to human CLI conventions.

### Confirmation and danger tiers

clig.dev gives mild/moderate/severe danger guidance, with increasingly strong
confirmation. Agent tool specifications can expose destructive/open-world
annotations. Clinkr currently does not appear to provide a first-class danger or
confirmation tier abstraction.

Decision needed: should ji encode danger tiers in Clinkr APIs, document them as
skill-level conventions, or leave them command-local?

Dissent to preserve: first-class tiers improve consistency and reviewability;
command-local confirmation keeps unusual workflows flexible.

## Initial Clinkr critique seed

The Objective already identified several likely gaps to validate with file:line
evidence in the next roadmap slice:

- no general output volume discipline: pagination, truncation, compaction, or
  streaming/JSONL;
- `failure` exits lack structured `data` for machine recovery;
- `error_type` is an unconstrained free string;
- `negative` outcomes can map to process exit `0`, which may conflict with
  shell expectations;
- usage errors are not necessarily returned in the same machine envelope;
- no first-class danger/confirmation tiers;
- aliases and dry-run conventions appear manual rather than framework-backed.

These are hypotheses until the Clinkr audit produces file:line evidence and a
classification of land-now, contested, or large-backlog.

## Implications for `sdl-cli-design`

The eventual skill should be a Clinkr-grounded overlay rather than a generic CLI
style guide. Candidate structure:

1. **Basics as hard gates**: parser, help, stdout/stderr, exit status,
   non-interactive behavior, stable machine formats.
2. **Human tier**: clig.dev-style concise help, examples, state-change feedback,
   useful errors, TTY/color/pager behavior.
3. **Agent/`exec` tier**: schema-first results, explicit JSON/envelopes,
   context-bounded outputs, structured errors, no prompts, deterministic command
   contracts, hidden `exec` subgroups for skill-only operations.
4. **Danger tier**: dry-run, preview, force/confirm flags, and stop conditions
   for external writes.
5. **Pre-ship checklist**: tests for `--version`, `--runtime`, `-h`, machine
   output, usage errors, and representative failure envelopes.
6. **Known Clinkr limitations**: rules that cannot yet be enforced by the
   framework should say "design around until ADR/change lands" rather than
   pretending the API already exists.

## ADR backlog from this survey

At minimum, write ADRs for:

- exit-code taxonomy vs structured error envelope;
- JSON compaction/streaming vs Python parity and pretty JSON defaults;
- pagination/truncation/output-volume primitives;
- usage-error enveloping;
- confirmation/danger tiers;
- public vs internal placement for `sdl-cli-design` given its Clinkr-specific
  internal references.
