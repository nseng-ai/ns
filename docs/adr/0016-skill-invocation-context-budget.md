# ADR 0016: Skill Exposure Spends the Ambient Context Budget Deliberately

## Status

Accepted

## Context

Agent harnesses place discoverable skill names and descriptions in ambient model context even though skill bodies are progressively disclosed. Every ambient skill therefore has a per-session context cost. Specialized workflows should remain available without making all of their metadata ambient, and cross-harness exposure artifacts must not drift through manual edits.

## Decision

Every managed skill has an explicit **Skill Exposure Policy**. The current policy set has exactly three values:

- `normal` for skills the model should discover from ordinary language, especially broad routers, common standards, safety-sensitive workflows, and widely applicable boundary guidance;
- `invoke-only` for specialized, rare, setup, migration, language-specific, administrative, or otherwise explicitly named workflows that should not consume ambient discovery context; and
- `command-backed` when a verified namespaced command is the preferred user surface and the backing skill should not also appear as a raw skill invocation.

Policies target an explicit skill directory or direct `SKILL.md` path and are applied, shown, and checked through `ns skill-exposure`. Its reconciliation owns the cross-harness exposure overlays and the command-backed replacement invariant. Authors do not hand-edit those derived artifacts or maintain a parallel registry table.

Historically, `unlisted` removed all invocation surfaces for one-shot bootstrap and scaffold skills, including mirror-backed typeahead surfaces. That policy is retired: it is not a current Skill Exposure Policy, and `ns skill-exposure` does not remove installation mirrors or provide a hidden/unlisted mode. `ambient-only` is likewise retired. Acquisition, installation, layout, and mirror health belong to their owning tooling rather than exposure policy.

Vendored or upstream skill directories are a separate review class. Normal repository review does not rewrite their embedded upstream code for local style or cleanup; repo-owned exposure overlays may still be reconciled with `ns skill-exposure`, and the integration boundary remains reviewable.

## Consequences

- Ambient discovery must justify its recurring context cost.
- Specialized skills remain explicitly invocable, while command-backed workflows expose one preferred surface.
- Current policy is mechanically reconciled rather than inferred from artifact combinations.
- Retired `unlisted` and `ambient-only` terminology cannot be used to describe current exposure state.
- Vendored content stays upstream-owned while local exposure integration remains controlled.

## Alternatives

- **Make every skill ambient:** rejected because frontmatter consumes an unbounded shared context budget.
- **Make every skill explicit-only:** rejected because routers, standards, and safety workflows need ordinary-language discovery.
- **Maintain a hand-written exposure table or edit harness artifacts directly:** rejected because it duplicates mechanically checkable state and drifts.
- **Retain `unlisted` as a current exposure policy:** rejected because removing all invocation and mirror surfaces crosses into acquisition and installation ownership.
