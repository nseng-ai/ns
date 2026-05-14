# Selection Rule Simplified

## Summary

The first roadmap slice changed Objective selection from touched-file auto-selection to explicit user choice.

Updated the shared Objective skill and operation skills so they now:

- Use an explicit slug or path when supplied.
- Otherwise list candidate directories under `.asdl/objectives/` and ask the user to choose.
- Report that no candidates exist when appropriate.
- Refuse to auto-select from candidate count or changed/touched files.
- Preserve the rule against inferring ownership from branch names, objectives, PR titles, package names, roadmap keywords, or hidden metadata.

The canonical docs and project context were updated to match, and stale selection wording was searched for and removed.

## Objective Impact

Roadmap PR 1 is complete. This de-risks the CLI pushdown by simplifying the existing skill behavior before adding `objective exec` commands.

Changed-path evidence remains available only after an Objective is selected, primarily for the Tracking Gate or other operation-specific checks. This keeps selection semantics independent from git or stack shape.

## Follow-Ups

- Start PR 2 by creating the `asdl-objectives` package, standalone `objective` CLI surface, plugin wiring, and hidden `exec` subgroup.
- When CLI support exists, delegate candidate listing mechanics without changing the explicit-selection-or-ask semantics.
