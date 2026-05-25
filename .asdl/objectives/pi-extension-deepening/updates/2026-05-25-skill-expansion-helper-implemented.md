# Skill Expansion Helper Implemented

## Summary

Candidate 5 has been implemented as a narrow Pi skill expansion helper slice.

- Added `skill-expansion.ts` with `expandSkillBlock(...)` and structural types for Pi skill command provenance, expanded bodies, and formatted skill blocks.
- The helper owns exact `source === "skill"` / `skill:<name>` command lookup, no-read missing-skill behavior, skill Markdown reading, frontmatter stripping, `sourceInfo.baseDir` fallback to `dirname(sourceInfo.path)`, and `<skill ...>` block formatting.
- Migrated Objective command handoffs to use the helper while keeping Objective selection, Objective fallback prompts, Objective stack prompt-template frontmatter stripping, and `sendUserMessage()` local.
- Migrated project-local `/just` to use the helper while keeping `just` execution, timeout policy, output truncation/formatting, notifications, status updates, fallback wording, and `sendUserMessage()` local.
- Inspected `create-brmem-plan-branch.ts` and left it unchanged because it has no Pi skill expansion path.
- Added focused helper tests, Objective integration coverage for an expanded skill block, and `/just` integration coverage through a dynamic import of the project-local extension.

Verification: focused skill-expansion, Objective, and `/just` tests passed; `bun run --cwd ts check` passed; `bun run --cwd ts test` passed.

## Objective Impact

Candidate 5 is complete. The accepted seam is Pi skill command expansion, not prompt dispatch or domain workflow orchestration. Deleting the helper would reintroduce the same provenance lookup, skill file read, frontmatter stripping, base-directory fallback, and block formatting in both Objective command handoffs and `/just`.

The Objective risk about shallow extractions is further constrained: this helper stays deep by owning only repeated Pi skill facts and formatting, while caller-specific Objective selection, `just` failure semantics, notifications, and dispatch remain local.

Evidence: local working diff against Graphite parent `brmem-plans/runner-subagent-contract-cleanup`. The deletion-test search found no remaining non-test caller manually searching Pi skill commands and formatting `<skill ...>` blocks.

## Follow-Ups

- Continue the ranked roadmap with Candidate 10 or the next explicitly selected candidate.
- Keep `skill-expansion.ts` limited to skill command expansion unless another deletion-test-backed caller proves a broader seam.
- Do not turn the helper into a generic Markdown/frontmatter or prompt-dispatch utility merely because future callers use skill content.
