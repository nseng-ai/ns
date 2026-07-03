# Clinkr API map + ADR rationale

Concrete `@ns/clinkr` surfaces behind each `sdl-cli-design` rule, plus ADR
rationale. Symbols are exported from `@ns/clinkr`
(`ts/packages/infra/clinkr/src/index.ts`). File:line anchors in audits may drift;
re-grep before quoting line numbers.

## Outcome constructors and machine envelope (`ts/packages/infra/clinkr/src/exit.ts`)

Result constructors — return these from a handler; never call `process.exit`:

| Need                                    | Symbol                              | Exit code | ADR       |
| --------------------------------------- | ----------------------------------- | --------- | --------- |
| Success result                          | `ok(...)`                           | 0         | 0010      |
| Semantic no/empty/not-found non-success | `negative(...)`                     | 1         | 0013      |
| Operation failure with recovery data    | `failure(errorType, message, data)` | 2         | 0010      |
| Invalid usage / missing authorization   | `usageError(...)`                   | 2         | 0011/0014 |
| Thrown failure preserving `data`        | `ClinkrFailure`                     | 2         | 0010      |

`exitCodeForExit` maps an exit to its process code: `ok → 0`, `negative → 1`,
`failure → 2`, `usageError → 2`.

Machine envelope (`toMachineEnvelope` / `MachineEnvelope`) is a camelCase
discriminated union on `status`:

- `{ status: "ok", exitCode: 0, data }`
- `{ status: "negative", exitCode: 1, message, data? }`
- `{ status: "failure", exitCode: 2, errorType, message, data? }`
- `{ status: "usageError", exitCode: 2, errorType: "usageError", message, data? }`

Property names are camelCase; serialized enum-like **values** (`errorType` and any
command-local `code`/`type`/`status`/`kind` discriminants) are **kebab-case** for
ji-owned contracts — e.g. `registry-check-failed`, `branch-context-error`,
`dry-run`. No snake_case and no aliases (ADR 0010). Known external strings
(GitHub/Anthropic/Pi/git wire values) keep their exact spelling and are modeled as
TypeScript literal unions. `NS_TS_BAN_SNAKE_CASE_CLI_MACHINE_VALUE` guards the
`failure(...)` error type and `errorType` literal cases.

Per-command schemas: `buildSuccessMachineEnvelopeSchema(dataSchema)`,
`buildFailureMachineEnvelopeSchema(...)`, and `buildMachineEnvelopeSchema(dataSchema)`
narrow the envelope; `machineEnvelopeSchema` is the generic union. `--json-schema`
publishes the machine-envelope schema (`json-schema.ts`), so a typed
`resultSchema` is how agents learn the contract. `envelopeJsonText` serializes
pretty two-space JSON.

## Interaction (`ts/packages/infra/clinkr/src/confirmation.ts`)

`ClinkrInteraction` is the whole confirmation surface for this slice:

- `confirm({ message, defaultAnswer }): Promise<ConfirmationResult>` — the only
  interactive yes/no primitive. `ConfirmationResult` is
  `{ type: "confirmed" } | { type: "declined" } | { type: "aborted" }`;
  `aborted` means stdin closed/EOF. `defaultAnswer` is `"yes" | "no"`. The
  prompt writes to stderr.
- `isInteractive(): boolean` — injected TTY gate. Decide with it whether a prompt
  is allowed; a non-interactive caller must never reach `confirm`.
- `requireInteractiveOrUsageError(...)` — non-interactive fail-fast helper that
  returns a `usageError`.

There is deliberately no danger-tier enum, confirmation-policy metadata,
framework `--yes`/`--force`/`--dry-run`, or typed-preview type. Those are
command-local options plus the tier discipline in `SKILL.md`.

## Command structure (`ts/packages/infra/clinkr/src/group.ts`)

- `ClinkrGroup` — command group; construct hidden agent-only subgroups with
  `isHidden: true` (`ClinkrGroupOptions.isHidden`). The subgroup stays invocable;
  hiding only suppresses it from parent help.
- Rendered commands expose `--format` and `--json-schema`. Output volume is
  command-local; there is no pagination/compact/JSONL option.
- Treat groups as configured at construction/registration time; do not mutate
  hidden state after construction.

## Raw exit (`ts/packages/infra/clinkr/src/raw/index.ts` and `group.ts`)

- `rawCommand(...)` marks a command spec with `isRawExit: true`.
- Raw execution opts out of the envelope, `resultSchema`, and `--json-schema`.
- ADR 0015 limits raw exit to TUI, streaming protocol, or process-control /
  third-party passthrough contracts. Ordinary finite agent-facing commands use
  rendered Clinkr exits.
- Even raw commands must reserve exit `1` for semantic non-success and map real
  backend failures to exit `2`.

## ADR index

| ADR                                                     | Decision                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `docs/adr/0010-clinkr-exit-code-semantics.md`           | Coarse stable exit codes; detail in the envelope.                                            |
| `docs/adr/0011-clinkr-ts-native-json-envelope.md`       | TS-native camelCase discriminated envelope; enveloped usage errors; published schema.        |
| `docs/adr/0012-clinkr-output-volume-discipline.md`      | No framework output-volume API; bounded output is command-local.                             |
| `docs/adr/0013-clinkr-negative-process-exit-default.md` | `negative=1`; removed `--shell-exit-code`/`shellNegative`.                                   |
| `docs/adr/0014-clinkr-confirmation-danger-tiers.md`     | Four danger tiers; `--yes`/`-y` vs `--force`/`-f`; dry-run as `ok`.                          |
| `docs/adr/0015-cli-surface-conformance-decisions.md`    | Raw-exit narrow exemption; hidden-`exec` write intent; miss/empty semantics; dotfile Tier 2. |

## ADR rationale and preserved dissent

### ADR 0010 — exit-code semantics

Decision: coarse stable process codes; detailed semantics in the envelope via
disciplined `errorType`/`code` plus structured `data`. Dissent preserved: richer
numeric exit taxonomies are convenient for shell conditionals but lossy for
agents, who must parse JSON anyway.

### ADR 0011 — TS-native JSON envelope

Decision: drop the byte-identical Python-parity snake_case contract for TS
`--format json`; publish camelCase discriminated envelopes with
`status`/`exitCode`; preserve structured failure `data`; envelope JSON-mode usage
errors for the Zod/request-validation path. Commander-level parse errors are
intentionally only conditionally enveloped.

### ADR 0012 — output-volume discipline

Decision: keep pretty JSON; add no `--compact`, pagination/truncation/range
primitive, generic bounded-result wrapper, or JSONL/streaming API now. Bounded
output is command-local `sdl-cli-design` guidance. Reopen framework extraction
only after repeated command pressure or one severe agent-context failure.

### ADR 0013 — negative process-exit default

Decision: `negative(...)` renders exit `1` by default; human/markdown negative
messages go to stderr; JSON envelopes stay on stdout with `exitCode: 1`; the
redundant `--shell-exit-code` / `shellNegative` surfaces were removed. One
audited harmless no-op (`brmem export` empty selection) became `ok(...)`.

### ADR 0014 — confirmation / danger tiers

Decision: four authoring tiers (0 read-only, 1 scoped/reversible, 2
destructive/external, 3 high blast radius); TTY-gated prompting;
non-interactive fail-fast; dry-run as `ok(...)`; `--yes`/`-y` (Tier 2 confirm)
vs `--force`/`-f` (Tier 3 precondition/guard override). Tiers are
`sdl-cli-design` discipline, not a Clinkr framework type.

### ADR 0015 — CLI surface conformance decisions

Decision: raw exit is a narrow exemption; hidden `exec` is write-intent for
agent-only operations; miss/empty semantics stay explicit; dotfile destructive
writes classify as Tier 2. Raw exit exists for inherently raw contracts, not as a
shortcut around machine envelopes.

## Source-of-truth pointers

- Survey: `docs/research/agent-era-cli-design-survey.md` (competing positions + sources).
- Gap audit:
  `.ns/objectives/agent-cli-design-discipline/references/clinkr-agent-era-gap-audit.md`.
- ADRs: `docs/adr/0010`–`0015`.
- Exec-subgroup + scenario-test conventions: root `AGENTS.md`.
