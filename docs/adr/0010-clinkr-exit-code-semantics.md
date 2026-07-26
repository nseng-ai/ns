# ADR 0010: Clinkr Rendered Result Contract

## Status

Accepted

## Context

Clinkr serves humans, shells, and machine consumers. Process status must remain simple enough for shell control flow, while agents need structured detail that does not compress domain failures into a global numeric taxonomy. Finite agent-facing commands also need one machine contract for successful, semantic-negative, failed, and invalid invocations.

## Decision

Rendered Clinkr commands use exactly this result and process-exit taxonomy:

- `ok` exits `0`;
- `negative` exits `1`; and
- `failure` and `usageError` exit `2`.

`ok` is the only success outcome. A pure query, predicate, harmless empty result, or no-op returns `ok` with explicit data such as `found: false`, `present: false`, or an empty collection. A command that dereferences or acts on a specifically requested target returns `negative` when that target is absent. A predicate may offer an explicit require-presence mode that turns absence into `negative` without changing the default query contract.

JSON output uses a camelCase discriminated envelope with `status`, `exitCode`, and variant-appropriate `errorType`, `message`, and `data`. `status` is one of `ok`, `negative`, `failure`, or `usageError`. ns-owned serialized discriminants and error types use kebab-case values; external protocol spellings are preserved. JSON-mode usage errors are enveloped when Clinkr can safely identify machine mode without parsing human-oriented parser output.

A command publishes its input schema, success-result schema, and actual envelope schema through `--json-schema`. Human output remains a separate, human-oriented rendering.

Raw exit is a narrow exception only when the command's true contract is a TUI, streaming protocol, process control, or third-party passthrough. Ordinary finite-result commands use the envelope and schemas. Raw and streaming contracts must still document their process behavior rather than pretending to return a Clinkr envelope.

There is no shell-negative opt-in or compatibility mode: `negative` is non-zero by default, and `--shell-exit-code`, `shellNegative`, and equivalent APIs are not part of the contract. A command may define additional process codes only for a specific, documented shell-only contract that cannot reasonably consume the envelope.

## Consequences

- Shell callers can treat every non-`ok` rendered outcome as non-zero.
- Agents inspect the discriminated envelope for stable detail instead of inferring domain meaning from numbers.
- Command authors must distinguish ordinary absence and emptiness from a requested action that did not succeed.
- Machine contracts have one casing convention and one discoverable schema surface.
- Genuine raw and streaming commands remain possible without becoming a general escape hatch.

## Alternatives

- **A global rich numeric taxonomy:** rejected because it duplicates and loses domain detail better represented in the envelope.
- **Success-like `negative` or a shell-exit opt-in:** rejected because machine truth and default process behavior would disagree.
- **Uniform miss handling:** rejected because absence is a normal predicate answer but a failed requested-target operation is not.
- **Dual snake_case and camelCase envelopes:** rejected because transitional aliases make the machine contract ambiguous.
- **Envelope every TUI, stream, or passthrough:** rejected because a fabricated finite result misrepresents those contracts.
