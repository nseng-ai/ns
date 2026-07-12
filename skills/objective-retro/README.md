# objective-retro — maintainer notes

Human-facing notes for people changing this skill. Agents running the skill do
not need this file; the agent-facing contract is `SKILL.md`.

## Manual sanity check

When changing this skill, dry-run the reconstruction against `branch-context-plans-extension`. A healthy run should reconstruct PRs #2112, #2114, #2119, #2120, #2136, and #2138, and explicitly mention known gaps such as a non-objective `checkBranchRefFormat` drift commit and `[cp]` checkpoint noise.
