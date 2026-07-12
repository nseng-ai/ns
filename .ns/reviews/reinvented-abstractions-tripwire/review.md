---
# Provenance (standalone): first-party tripwire owned end to end by ns. Its
# sources are this review's own assets — the canonical inventory under
# `references/canonicals/` and the scanner in `tools/scan-reinvention` — and
# the `reinvented-abstractions-tripwire` skill stub is a first-party symlink.
# Its final-judgment sibling is `dry-but-not-too-dry`: this tripwire is the
# cheap scout that emits investigation leads; that review makes consolidation
# calls.
#
# Regeneration instructions: no upstream to refresh from. Refresh when the
# canonical reference files or scanner detectors change: re-read
# `references/canonicals/`, keep the mandate confined to named, openable
# canonicals with silence as a valid outcome, preserve the frontmatter schema
# accepted by Reviews, and then run:
#
#   dprint check .ns/reviews/reinvented-abstractions-tripwire/review.md
#   pnpm --dir ts exec vitest run packages/capabilities/reviews/test/unit/review-definition.test.ts
description: |
  Reinvented Abstractions Tripwire: scan the diff for code that reinvents a
  non-trivial abstraction the repo already provides. Start with the local
  scanner, then open only the canonical reference files for flagged candidate
  kinds. Fire only when the canonical can be named and reuse is clearly correct;
  silence is a valid and expected outcome.
model_profile: quick
applies_to:
  include:
    - "**/*.ts"
    - "**/*.tsx"
  exclude:
    - "**/tests/**"
    - "**/test/**"
    - "**/*.test.ts"
    - ".agents/skills/**"
---

## Mandate

Flag one thing: **changed code that reinvents or bypasses a shared abstraction the
repository already provides**. A finding must name the existing canonical, show that
it is semantically compatible from the changed file, and explain why reuse buys
correctness, testability, or policy consistency. Do not fire for local dedupe,
style consistency, or a canonical that should exist but does not.

## Procedure

1. Run the review-local scanner first:

   ```bash
   pnpm --dir "{review_dir}/tools/scan-reinvention" --config.verify-deps-before-run=false run scan -- --diff-base "{base_ref}"
   ```

   The scanner is read-only. It derives changed production TypeScript/TSX files from
   `{base_ref}...HEAD` and reports candidates on added lines by default.
2. For each emitted candidate, read only the matching reference file named by
   `manifestRef` (for example `references/canonicals/subprocess.md`). Do not read the
   full canonical set unless multiple candidate kinds require it.
3. Open the candidate canonical source/API named by that reference. Confirm semantic
   equivalence, import/dependency compatibility, and the payoff. If you cannot confirm
   all three, emit nothing for that candidate.
4. If the scanner emits zero candidates, or only candidates that the reference says are
   structurally exempt, return zero findings unless you independently see a clear
   reinvention and can name/open its canonical.

Judgment-only canonicals that are not scanner detectors may still be flagged when the
diff clearly shows them and you can open the canonical:
`buildFencedTextBlock` for collision-safe Markdown fences and
`registerCliCommandExtension` for Pi command wrappers around package CLIs.

## Output contract

Emit a finding only when confident. State it as an assertion, not a question. Include:

- the changed diff location and raw operation;
- the existing canonical with path/import;
- why it is semantically equivalent and dependency-compatible;
- the concrete reroute.

End every finding's `details` with exactly:

```text
Evidence: `path`[, `path`...]
```

The evidence paths must include canonical files you opened in this session. If you did
not open the canonical, emit nothing.
