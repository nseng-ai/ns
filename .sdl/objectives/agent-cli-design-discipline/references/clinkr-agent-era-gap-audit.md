# Clinkr Agent-Era Gap Audit

## Purpose

This audit classifies Clinkr's current agent-era CLI design gaps after ADR 0010
(exit-code semantics) and ADR 0011 (TypeScript-native JSON envelope). It is a
point-in-time evidence map, not an ADR: decisions still need ADRs when the survey
identified a contested design tradeoff.

Classifications:

- **Resolved**: the gap has an accepted ADR and landed implementation evidence.
- **Land-now**: low-contest additive framework work that can proceed without a
  new ADR.
- **ADR-needed**: a contested design decision should be recorded before changing
  framework contracts.
- **Large backlog**: useful but too broad or domain-specific for the immediate
  Clinkr evolution slice.

## Summary Table

| Gap                                                     | Classification             | Evidence                                                                                                                                                                                                                                                                                  | Next action                                                                                                      |
| ------------------------------------------------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Exit-code taxonomy vs structured envelope               | Resolved                   | ADR 0010; `exitCodeForExit` keeps `0/1/2` process codes in `ts/packages/clinkr/src/exit.ts:175-188`                                                                                                                                                                                       | Reflect in `sdl-cli-design`                                                                                      |
| Python-parity snake_case envelope vs TS-native contract | Resolved                   | ADR 0011; camelCase envelope interfaces in `ts/packages/clinkr/src/exit.ts:38-65`                                                                                                                                                                                                         | Reflect in `sdl-cli-design`                                                                                      |
| Failure exits lack structured recovery data             | Resolved                   | `ClinkrFailureExit.data` and failure envelopes preserve `data` in `ts/packages/clinkr/src/exit.ts:25-29`, `171-172`, `203-210`; thrown `ClinkrFailure` propagation preserves `data` in `ts/packages/clinkr/src/group.ts:509-514`                                                          | Reflect in `sdl-cli-design`; encourage command-specific data schemas                                             |
| Usage errors bypass JSON envelope                       | Mostly resolved            | Zod/request validation errors emit `usage_error` envelopes in JSON mode in `ts/packages/clinkr/src/group.ts:468-480`; ADR 0011 explicitly limits Commander parse-error enveloping in `docs/adr/0011-clinkr-ts-native-json-envelope.md:37-41`                                              | No immediate code work unless a concrete Commander parse-error case matters                                      |
| Machine envelope schema not published                   | Resolved                   | `machineEnvelopeJsonSchema` is part of the schema document in `ts/packages/clinkr/src/json-schema.ts:5-23`                                                                                                                                                                                | Reflect in `sdl-cli-design`                                                                                      |
| Unconstrained `errorType` strings                       | Land-now                   | Base interfaces/schemas still accept any string in `ts/packages/clinkr/src/exit.ts:25-29`, `88-93`, `110-140`; ADR 0010 directs disciplined `error_type`/`code` values                                                                                                                    | Add authoring guidance and optional per-command failure schema/examples before a global taxonomy                 |
| Negative outcomes default to process exit `0`           | ADR-needed                 | `negative` maps to process exit `0` unless `--shell-exit-code` is set in `ts/packages/clinkr/src/exit.ts:175-184`; rendered commands expose `--shell-exit-code` in `ts/packages/clinkr/src/group.ts:436-441`                                                                              | Decide whether to keep compatibility/default human semantics or make semantic negatives shell-visible by default |
| Pretty JSON only; no compact/token-efficient mode       | ADR-needed                 | JSON serialization uses `JSON.stringify(value, null, 2)` in `ts/packages/clinkr/src/exit.ts:227-228`; `--json-schema` also prints pretty JSON in `ts/packages/clinkr/src/group.ts:450-456`; ADR 0011 defers compact JSON in `docs/adr/0011-clinkr-ts-native-json-envelope.md:47-48`       | Write output-volume ADR covering compact default/flag and schema output                                          |
| Pagination/truncation/range/streaming primitives        | ADR-needed / Large backlog | No Clinkr output-volume API is present near rendered command registration, which only adds `--format`, `--shell-exit-code`, and `--json-schema` in `ts/packages/clinkr/src/group.ts:430-445`; ADR 0011 defers these primitives in `docs/adr/0011-clinkr-ts-native-json-envelope.md:47-48` | ADR should choose framework primitives vs per-command guidance; likely park generic streaming/JSONL              |
| Confirmation/danger tiers                               | ADR-needed                 | Clinkr has a yes/no interaction seam only: `ConfirmationRequest` is just `message` + `defaultAnswer` in `ts/packages/clinkr/src/confirmation.ts:1-8`; no danger tier, typed preview, force/confirm convention, or non-interactive policy is encoded                                       | Write danger-tier ADR; decide framework API vs `sdl-cli-design` convention                                       |
| Dry-run / force / aliases are command-local             | Large backlog              | Parameter generation supports flags such as `--dry-run` and `--force` as ordinary schema-derived options in tests, but no framework semantic tier is attached                                                                                                                             | Keep command-local unless danger-tier ADR chooses common metadata                                                |

## Findings

### 1. Envelope and exit-code foundation is now good enough for the skill

ADR 0010 and ADR 0011 resolve the Objective's largest prior uncertainty. Clinkr
now has a TS-native discriminated machine envelope for `ok`, `negative`,
`failure`, and `usage_error` outcomes. The runtime types and schemas expose
camelCase `status`, `exitCode`, `errorType`, `message`, and optional `data`
fields (`ts/packages/clinkr/src/exit.ts:38-108`). `--json-schema` publishes the
actual machine envelope schema alongside input and output schemas
(`ts/packages/clinkr/src/json-schema.ts:5-23`).

This is no longer a blocker for `sdl-cli-design`; the skill can treat Clinkr's
machine envelope as a decided hard gate.

### 2. Failure-data support landed, but error taxonomy discipline is still thin

Structured recovery context is supported: `failure(errorType, message, data)`
keeps optional `data` (`ts/packages/clinkr/src/exit.ts:171-172`), and thrown
`ClinkrFailure` data is preserved into rendered failure exits
(`ts/packages/clinkr/src/group.ts:509-514`). However, the base `errorType`
contract remains `string` in both the runtime interface and schemas
(`ts/packages/clinkr/src/exit.ts:25-29`, `88-93`, `110-140`).

Recommendation: do **not** invent a global error enum yet. Land-now work should
be documentation and examples in `sdl-cli-design`: each command should choose
stable snake_case or lower_snake-ish error types, include structured `data` when
it helps recovery, and optionally narrow failure schemas for commands with stable
machine consumers.

### 3. Usage errors are machine-readable for the important Zod path

Rendered commands in JSON mode now turn schema/request validation failures into a
`usage_error` envelope with structured issue data (`ts/packages/clinkr/src/group.ts:468-480`). That resolves the common agent path where an LLM passes a bad
flag value or omits a required modeled argument.

ADR 0011 intentionally leaves Commander-level parse errors conditional: those may
be enveloped only when Clinkr can safely determine JSON mode without parsing
Commander human output or forking Commander internals
(`docs/adr/0011-clinkr-ts-native-json-envelope.md:37-41`). Treat the residual as
accepted scope, not an immediate bug.

### 4. Output volume is the next real design decision

Clinkr still emits pretty JSON with two-space indentation
(`ts/packages/clinkr/src/exit.ts:227-228`), and schema output does the same
(`ts/packages/clinkr/src/group.ts:450-456`). There is no framework-level compact
mode, pagination helper, truncation contract, range selector, or streaming/JSONL
mode in rendered command registration; the generic rendered options are only
`--format`, `--shell-exit-code`, and `--json-schema`
(`ts/packages/clinkr/src/group.ts:430-445`).

This should be the next ADR because the survey preserves competing values:
pretty JSON is readable and stable; compact JSON and bounded result windows are
agent-token-efficient; generic pagination may be too coarse for domain-specific
commands.

Recommended ADR shape:

- keep pretty JSON as the default unless the ADR explicitly accepts a breaking
  change;
- add an opt-in compact spelling only if it applies consistently to envelopes and
  `--json-schema`;
- prefer per-command result shaping guidance for domain lists/diffs/logs before
  adding a generic pagination abstraction;
- park JSONL/streaming unless a concrete command needs it.

### 5. Confirmation exists, but danger tiers do not

Clinkr has an interaction seam for interactive yes/no confirmation
(`ts/packages/clinkr/src/confirmation.ts:17-19`) with a simple request model of
`message` and `defaultAnswer` (`ts/packages/clinkr/src/confirmation.ts:1-8`).
That is useful plumbing, but it is not an agent-era danger model. It cannot by
itself express mild/moderate/severe destructive writes, typed previews, required
confirmation phrases, `--force` semantics, dry-run requirements, or
non-interactive fail-fast behavior.

This needs an ADR before framework API work. The likely decision is a hybrid:
`ClinkrInteraction.confirm` remains the low-level interactive primitive, while
`sdl-cli-design` defines command-authoring rules for danger tiers immediately;
framework metadata can follow only if repeated commands need it.

### 6. Negative process-exit behavior remains a deliberate compatibility question

Machine envelopes report semantic negatives with `exitCode: 1`, but process exit
status remains `0` by default for `negative(...)` unless `--shell-exit-code` is
set (`ts/packages/clinkr/src/exit.ts:175-184`; `ts/packages/clinkr/src/group.ts:436-441`). ADR 0010 says process status should be coarse and non-zero for
non-success in principle, but it also called this compatibility-sensitive follow-up out explicitly.

Do not change this as drive-by cleanup. If shell-visible negative-by-default is
worth doing, write a focused ADR or amend ADR 0010 with migration rationale.

## Recommended Next Work

1. Write the output-volume ADR: compact JSON, pagination/truncation, and
   streaming/JSONL boundaries.
2. Write the confirmation/danger-tier ADR.
3. Start `sdl-cli-design` after those decisions, but already treat ADR 0010/0011
   as settled: TS-native envelopes, usage-error envelopes, structured failure
   data, and published machine-envelope schemas are hard rules.
