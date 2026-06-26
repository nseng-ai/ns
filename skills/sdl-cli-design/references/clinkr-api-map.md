# Clinkr API map + ADR index

Rule → Clinkr symbol → ADR. Symbols are exported from `@sdl/clinkr`
(`ts/packages/clinkr/src/index.ts`); file:line anchors are in the gap audit
(`.sdl/objectives/agent-cli-design-discipline/references/clinkr-agent-era-gap-audit.md`)
and may drift — re-grep before quoting line numbers.

## Outcome constructors (`ts/packages/clinkr/src/exit.ts`)

| Need                                    | Symbol                              | Exit code | ADR  |
| --------------------------------------- | ----------------------------------- | --------- | ---- |
| Success result                          | `ok(...)`                           | 0         | 0010 |
| Semantic no/empty/not-found non-success | `negative(...)`                     | 1         | 0013 |
| Operation failure with recovery data    | `failure(errorType, message, data)` | 2         | 0010 |
| Invalid usage / missing authorization   | `usageError(...)`                   | 2         | 0011 |
| Thrown failure preserving `data`        | `ClinkrFailure`                     | 2         | 0010 |

## Machine envelope

- `toMachineEnvelope`, `MachineEnvelope` — camelCase discriminated envelope
  (`status`, `exitCode`, `errorType`, `message`, optional `data`). ADR 0011.
- `machineEnvelopeSchema`, `buildMachineEnvelopeSchema`,
  `buildSuccessMachineEnvelopeSchema`, `buildFailureMachineEnvelopeSchema` —
  published schema surfaced by `--json-schema`. ADR 0011.
- `exitCodeForExit` — maps an exit to its process code (0/1/2). ADR 0010/0013.

## Interaction (`ts/packages/clinkr/src/confirmation.ts`)

- `ClinkrInteraction.confirm(request)` — the only confirmation primitive
  (`message` + `defaultAnswer`). ADR 0014.
- `ClinkrInteraction.isInteractive()` — TTY gate for prompting. ADR 0014.
- `requireInteractiveOrUsageError(...)` — non-interactive fail-fast helper that
  returns a `usageError`. ADR 0014.

## Command structure (`ts/packages/clinkr/src/group.ts`)

- `ClinkrGroup` — command group; construct hidden agent-only subgroups with
  `isHidden: true` (the `ClinkrGroupOptions.isHidden` flag; AGENTS.md
  "Skill-Invoked CLI Commands").
- Rendered commands expose `--format` and `--json-schema`. Output volume is
  command-local; there is no pagination/compact/JSONL option. ADR 0012.

## ADR index

| ADR                                                     | Decision                                                                                     |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `docs/adr/0010-clinkr-exit-code-semantics.md`           | Coarse stable exit codes; detail in the envelope.                                            |
| `docs/adr/0011-clinkr-ts-native-json-envelope.md`       | TS-native camelCase discriminated envelope; enveloped usage errors; published schema.        |
| `docs/adr/0012-clinkr-output-volume-discipline.md`      | No framework output-volume API; bounded output is command-local.                             |
| `docs/adr/0013-clinkr-negative-process-exit-default.md` | `negative=1`; removed `--shell-exit-code`/`shellNegative`.                                   |
| `docs/adr/0014-clinkr-confirmation-danger-tiers.md`     | Four danger tiers; `--yes`/`-y` vs `--force`/`-f`; dry-run as `ok`.                          |
| `docs/adr/0015-cli-surface-conformance-decisions.md`    | Raw-exit narrow exemption; hidden-`exec` write intent; miss/empty semantics; dotfile Tier 2. |

## Survey + audit provenance

- `docs/agent-era-cli-design-survey.md` — competing human-first vs agent-era
  positions with sources (clig.dev, Anthropic, Speakeasy, Agent Layer).
- `.sdl/objectives/agent-cli-design-discipline/references/clinkr-agent-era-gap-audit.md`
  — classified gap list (resolved / land-now / ADR-needed / backlog) with
  file:line evidence.
