# MCP as the Anticipated Third Host

Status: parked candidate, not scoped work. This note preserves option value; it
authorizes no implementation. The roadmap's "third-host generalization" parked
item points here.

## The insight

Clinkr CLIs define a set of capabilities that should also be invokable from
within a harness — and that set is surprisingly MCP-shaped. If developers write
CLIs inside Clinkr's existing discipline (schema-first inputs, semantic
outputs, injected elicitation), the same business logic becomes exposable as
CLI, as MCP tools, or directly in-harness, with the MCP surface derived rather
than hand-built. Developing and testing CLIs is much easier than developing
and testing MCP servers, so the CLI becomes the authoring and testing surface
and MCP a derived exposure. That opens whole classes of integrations at the
cost of one bounded adapter — but only if the semantic contract holds in the
meantime.

## Why the mapping is clean

The channel ontology maps onto MCP nearly one-to-one. This is partial
validation of the two-tier model: the contract really is host-neutral, not
terminal vocabulary under different names.

| Clinkr channel / capability | MCP equivalent                                                                                                               |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Request                     | tool call arguments (JSON Schema derived from the same zod schema that already drives the commander surface in `surface.ts`) |
| Response                    | tool result (structured content; `isError` for failures)                                                                     |
| Progress                    | `notifications/progress`                                                                                                     |
| Notice                      | `notifications/message` (logging)                                                                                            |
| Elicitation                 | MCP elicitation — the term this model imported                                                                               |
| `isInteractive()`           | client elicitation-capability check                                                                                          |

The key existing enabler: Clinkr commands declare inputs as zod schemas and
the CLI flags are *derived* (`ts/packages/public/infra/clinkr/src/surface.ts`).
An MCP adapter derives its tool `inputSchema` from the same source of truth.

## The 2026-07-28 MCP spec changes the adapter shape

Source: <https://blog.modelcontextprotocol.io/posts/2026-07-28/> (read
2026-07; summarized here because the model must not depend on the link).

- **Stateless protocol core.** `initialize`/sessions retired; every request is
  self-describing and can land on any server instance. A one-shot,
  invocation-scoped Clinkr command is a near-perfect match — the
  session/lifecycle friction a long-lived MCP server implied is gone.
- **MRTR (Multi Round-Trip Requests, SEP-2322)** replaces server-initiated
  `elicitation/create` over a held-open stream. When a tool needs user input
  mid-call, the server returns `resultType: "input_required"` with the
  questions; the client retries the original call with the answers attached in
  `inputResponses`. Elicitation in an MCP host is therefore
  **replay-with-answers, not live dialogue**: run the command, abort at the
  first unanswered elicitation, re-run from the top with the answer injected.
- The spec's guidance for cross-call state — mint an explicit handle and have
  the model pass it back, rather than hidden transport sessions — matches this
  repo's git-native, no-hidden-state doctrine.

Two consequences for the model:

1. **The fake is the production shape.** `createFakeClinkrInteraction()`
   (predetermined answers injected up front, fail on an unexpected prompt) is
   literally the MRTR execution model. The testing seam and the MCP adapter
   converge on the same contract — strong evidence the seam is drawn in the
   right place, and further reason never to let a live-terminal prompt
   library's held-open-stream model shape the public contract.
2. **Replay-safety becomes a host-portability requirement.** A command that
   mutates state before an unanswered elicitation would repeat that mutation
   on the MRTR retry. Terminal and Pi never expose this because their
   elicitation is synchronous-live. Rule: confirm before mutating, or be
   idempotent up to the prompt. (Repo LBYL doctrine already pushes this way.)

## Design tests this adds

While settling the model, run each decision against:

- **MCP-derivability:** could a mechanical MCP adapter expose this command
  without touching the business logic? (Companion to the existing
  no-stdout/stderr-vocabulary test.)
- **Replay-satisfiable elicitation:** can every elicitation be satisfied by
  pre-supplied answers, with the command safe to re-run up to the first
  unanswered prompt?

## What preserves the option (mostly already true or in scope)

1. Schema-first inputs — zod as single source of truth, CLI flags derived.
2. Semantic outputs — structured Response; rendering only in adapters.
3. Elicitation answerable by pre-supplied answers (replay), not only live.
4. No mutation before an unanswered elicitation.
5. No process-global state per invocation; invocation-scoped services.
6. Structured outcomes as the error source of truth; exit codes derived by
   the terminal adapter. (MCP has no exit-2-usage-error-to-stderr; the
   mapping to `isError` + content must come from structured outcomes.)

## What would destroy the option

- Terminal vocabulary or prompt-library types in the public contract.
- Commands that render inside business logic or write to process streams.
- Elicitation that only works as a held-open interactive dialogue.
- Mutation-before-confirmation command flows.

## Known gaps an eventual adapter must resolve

- **Raw commands:** `clinkr/raw` byte-stream commands have no MCP story; an
  MCP host exposes only rendered/semantic commands — a formal capability
  split.
- **Confirmation trust posture:** an agent auto-answering elicitations is a
  different trust posture than a human at a TTY; the danger/default policy the
  semantic contract owns becomes more important.
- **Error mapping:** principled Response-outcome → `isError`/content mapping.

## Relationship to the interaction-library question

A companion analysis (Clinkr interaction library fit report, 2026-07, produced
outside this objective) concluded: own the small semantic interaction
contract; do not expose Inquirer/Clack/`prompts` through public APIs; if the
standalone terminal ever needs raw-mode interaction (arrow-key select,
masking, live validation), adopt `@inquirer/prompts` strictly behind the
terminal adapter with `@inquirer/testing` for adapter conformance tests; keep
the line reader until then. The MCP-host analysis independently reaches the
same boundary from the other direction: MRTR-shaped elicitation is
incompatible with a live-terminal library defining the contract.

## Explicit non-decisions

- No MCP adapter, prototype, or new objective now; no concrete consumer
  exists and the 2026-07-28 SDKs are young.
- No generalization of `ClinkrInteraction` to select/etc. ahead of need
  (remains this objective's non-goal).
- MCP does not bend the vocabulary; the contract stays host-neutral and MCP
  is one adapter that happens to fit well.

The trigger for un-parking: a concrete consumer wanting ns capabilities over
MCP. At that point this becomes its own bounded objective, and it will be a
mechanical adapter project precisely because these constraints held.
