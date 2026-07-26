# ADR 0016: Skill Exposure Spends the Ambient Context Budget Deliberately

## Status

Accepted

## Context

Agent harnesses place discoverable skill names and descriptions in ambient model context even though skill bodies are progressively disclosed. Every ambient skill carries per-session context cost. Specialized workflows should stay available without making all their metadata ambient. Cross-harness exposure artifacts must not drift through manual edits.

## Decision

Every managed skill has explicit **Skill Exposure Policy**. Current policy set has exactly three values:

- `normal` for skills model should discover from ordinary language, especially broad routers, common standards, safety-sensitive workflows, widely applicable boundary guidance;
- `invoke-only` for specialized, rare, setup, migration, language-specific, administrative, or otherwise explicitly named workflows that should not consume ambient discovery context;
- `command-backed` when verified namespaced command is preferred user surface and backing skill should not also appear as raw skill invocation.

Policies target explicit skill directory or direct `SKILL.md` path; applied, shown, checked through `ns skill-exposure`. Its reconciliation owns cross-harness exposure overlays and command-backed replacement invariant. Authors do not hand-edit those derived artifacts, do not maintain parallel registry table.

Historically, `unlisted` removed all invocation surfaces for one-shot bootstrap and scaffold skills, including mirror-backed typeahead surfaces. That policy is retired: not current Skill Exposure Policy; `ns skill-exposure` does not remove installation mirrors or provide hidden/unlisted mode. `ambient-only` likewise retired. Acquisition, installation, layout, mirror health belong to their owning tooling, not exposure policy.

Vendored or upstream skill directories are separate review class. Normal repository review does not rewrite their embedded upstream code for local style or cleanup; repo-owned exposure overlays may still be reconciled with `ns skill-exposure`; integration boundary stays reviewable.

## Consequences

- Ambient discovery must justify its recurring context cost.
- Specialized skills stay explicitly invocable; command-backed workflows expose one preferred surface.
- Current policy is mechanically reconciled, not inferred from artifact combinations.
- Retired `unlisted` and `ambient-only` terminology cannot be used to describe current exposure state.
- Vendored content stays upstream-owned; local exposure integration stays controlled.

## Alternatives

- **Make every skill ambient:** rejected because frontmatter consumes unbounded shared context budget.
- **Make every skill explicit-only:** rejected because routers, standards, safety workflows need ordinary-language discovery.
- **Maintain a hand-written exposure table or edit harness artifacts directly:** rejected because it duplicates mechanically checkable state and drifts.
- **Retain `unlisted` as a current exposure policy:** rejected because removing all invocation and mirror surfaces crosses into acquisition and installation ownership.
