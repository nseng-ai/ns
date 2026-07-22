# Deferred Tier B ideas

These higher-context design rules are not active review instructions. Keep them out of
`review.md`: the Reviews loader ships that file's post-frontmatter body verbatim as model
instructions.

- External/HTTP/model/tool input consumed without an obvious Zod schema.
- Hand-written type/interface that appears to mirror a nearby Zod schema instead of `z.infer`.
- Multiple booleans modeling one state machine where a discriminated union would be clearer.
- Internal discriminated union using a non-`type` tag without an obvious domain/external-contract reason.
- Mutation of returned/shared collections where ownership is unclear.
- Backend/runtime sniffing via name substring checks instead of capability flags.
- Hidden globals where a collaborator should be injected.
- Third-party SDK/client/library shapes leaking through core instead of a project-owned seam.
- Hand-authored parallel identity, slug, type, schema, or registry key that should be derived from one source of truth.
- New public API surface without a contract comment or test coverage for the promised behavior.
- Higher-context error-handling boundary/model questions not affirmatively demonstrated by the supplied
  diff, after the deferred error-handling standard is settled.
