# exact-optional-spread

- Kind key: `exact-optional-spread`
- Canonical: optionalEntry / optionalEntries
- Import/path hints: @nseng-ai/foundation/primitives
- Raw-form tell: ...(x === undefined ? {} : { k: x })
- Why reuse matters: one greppable implementation of exactOptionalPropertyTypes omission semantics
- Structural exemptions: null checks and domain-specific conditional object construction
- Semantic judgment notes: Only fire for undefined-omission spreads; null is a different semantic.

Example finding wording: "This added code hand-rolls optionalEntry / optionalEntries instead of routing through the existing canonical. Reuse the canonical so the existing policy/test seam applies."
