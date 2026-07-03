# Objective Metric Tooling

## Summary

Added temporary Objective-owned tooling under `tools/` to measure the Objective's two scorecard metrics locally:

1. typed optional-undefined property declarations; and
2. explicit undefined-normalization/check lines.

The tool emits Markdown by default for PR descriptions and JSON for automation or downstream comparison. It now uses the TypeScript AST for both metric families rather than regex matching.

## Objective Impact

Future Objective slices can use one repeatable command instead of ad hoc grep snippets when preparing before/after metric evidence. The counts remain raw scorecard inputs and do not replace semantic candidate classification; PRs still need scope, caveats, changed-field rationale, and validation evidence. Because SDL is private/unreleased, API/gateway/context-shaped declarations are candidates by default unless a concrete external-input, compatibility, dependency-bag, environment/process, signal, or schema-mirror reason applies.

Keeping the tool inside this Objective makes it temporary and local while the measurement model stabilizes. If repeated Objective work or other Objectives need the same pattern, the helper can be considered for promotion into tested SDL CLI support.

## Follow-Ups

- Use `node .sdl/objectives/eliminate-redundant-optional-undefined/tools/measure-objective.mjs [scope ...]` before and after cleanup slices.
- Include exact scopes and before/after counts in PR descriptions.
- Record caveats when the undefined-check metric rises due to temporary producer/builder normalization.
- Consider graduation only after the patterns and output contract prove useful across multiple slices or Objectives.
