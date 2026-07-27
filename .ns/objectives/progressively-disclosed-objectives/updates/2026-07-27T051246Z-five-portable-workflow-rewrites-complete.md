# Five portable workflow skills rewritten to the capability-adaptation contract

## Summary

Rewrote `objective-create`, `objective-next`, `objective-update`, `objective-refresh`, and `objective-close` so each has a complete CLI-free procedure and uses optional `ns objective` operations only after an exact look-before-use probe, completing the workflow-rewrite portion of the portable-family roadmap row.

Each skill gained a `## Capability adaptation` section modeled on `objective-list`, naming its portable mechanics and the probed enhancements that may replace them. The umbrella `objective` skill is the single source of truth for two shared mechanics: **Frontmatter Verification** (probed `ns objective check`, with a portable best-effort two-record edge inspection as the complete fallback) and the Tracking Gate's enhancement status (portable `objective-next` is record-only and claims no Git freshness; the gate runs only after its exact-operation probe succeeds). `objective-close` gained a portable **edge walk** that enumerates counterparts from the closing record's own mirrored `edges:` frontmatter, covering closed counterparts without `ns objective show`. `objective-update` and `objective-refresh` treat `git`, `gt`, and `gh` as optional evidence tools whose absence narrows the evidence basis — reported honestly — never the record semantics.

## Objective Impact

The portable-family roadmap row's remaining rewrite work is done; the row stays active only for the seven-skill checkout-independent acquisition proof. This de-risks portable-procedure drift (one semantic contract per skill, mechanics varying only by probe outcome) and shallow capability detection (every enhancement names its exact probe). Best-effort portable blocked/edge authoring is now specified once in the umbrella and cited by create, update, close, and refresh.

Evidence: focused portable-skills extension test (2 passed) and Pi backing-skill-commands test (16 passed) pass; `ns skill-exposure check` reports the expected policies for all six touched skills; `dprint check` is clean on every changed file. Changes touch only the six canonical skill directories under `skills/incubating/objectives/`.

## Follow-Ups

- Add checkout-independent acquisition evidence for all seven portable skills (the row's remaining open evidence).
- Consider portable-fixture tests for the rewritten workflows analogous to the `objective-list` empty-`PATH` scenario, when the acquisition-proof slice lands.
