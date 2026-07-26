# ADR 0010: Clinkr Rendered Result Contract

## Status

Accepted

## Context

Clinkr serves humans, shells, machine consumers. Process status must stay simple enough for shell control flow. Agents need structured detail that does not compress domain failures into global numeric taxonomy. Finite agent-facing commands need one machine contract for successful, semantic-negative, failed, invalid invocations.

## Decision

Rendered Clinkr commands use exactly this result and process-exit taxonomy:

- `ok` exits `0`;
- `negative` exits `1`;
- `failure` and `usageError` exit `2`.

`ok` is only success outcome. Pure query, predicate, harmless empty result, or no-op returns `ok` with explicit data such as `found: false`, `present: false`, or empty collection. Command that dereferences or acts on specifically requested target returns `negative` when target absent. Predicate may offer explicit require-presence mode turning absence into `negative` without changing default query contract.

JSON output uses camelCase discriminated envelope with `status`, `exitCode`, variant-appropriate `errorType`, `message`, `data`. `status` is one of `ok`, `negative`, `failure`, `usageError`. ns-owned serialized discriminants and error types use kebab-case values; external protocol spellings stay. JSON-mode usage errors enveloped when Clinkr can safely identify machine mode without parsing human-oriented parser output.

Command publishes its input schema, success-result schema, actual envelope schema through `--json-schema`. Human output stays separate, human-oriented rendering.

Raw exit is narrow exception, only when command's true contract is TUI, streaming protocol, process control, third-party passthrough. Ordinary finite-result commands use envelope and schemas. Raw and streaming contracts must still document their process behavior, not pretend to return Clinkr envelope.

No shell-negative opt-in, no compatibility mode: `negative` is non-zero by default; `--shell-exit-code`, `shellNegative`, equivalent APIs are not part of contract. Command may define extra process codes only for specific, documented shell-only contract that cannot reasonably consume envelope.

## Consequences

- Shell callers can treat every non-`ok` rendered outcome as non-zero.
- Agents inspect discriminated envelope for stable detail instead of inferring domain meaning from numbers.
- Command authors must distinguish ordinary absence and emptiness from requested action that did not succeed.
- Machine contracts have one casing convention, one discoverable schema surface.
- Genuine raw and streaming commands stay possible without becoming general escape hatch.

## Alternatives

- **A global rich numeric taxonomy:** rejected because it duplicates and loses domain detail better represented in envelope.
- **Success-like `negative` or a shell-exit opt-in:** rejected because machine truth and default process behavior would disagree.
- **Uniform miss handling:** rejected because absence is normal predicate answer but failed requested-target operation is not.
- **Dual snake_case and camelCase envelopes:** rejected because transitional aliases make machine contract ambiguous.
- **Envelope every TUI, stream, or passthrough:** rejected because fabricated finite result misrepresents those contracts.
