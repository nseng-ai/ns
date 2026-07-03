# Profile specification moved into Objective

## Summary

Moved the skill invocation profiles specification from repo docs into this Objective as an Objective-local reference document:

- From: `docs/skill-invocation-profiles.md`
- To: `.asdl/objectives/areg-typescript-port/skill-invocation-profiles.md`

Updated live Objective prose and roadmap guidance to cite Objective-local `skill-invocation-profiles.md` as the canonical TypeScript implementation contract for the profile-system slice. PR #1510 remains prototype/provenance evidence.

## Objective Impact

The profile-system specification now travels with the `areg-typescript-port` Objective instead of living as a general repo doc. Downstream implementation sessions should read `.asdl/objectives/areg-typescript-port/skill-invocation-profiles.md` before implementing the profile slice.

The roadmap shape is unchanged from the prior scope decision: the old standalone `areg command convert|revert|list` porting row remains replaced by the profile-system row, with legacy `areg command` behavior treated only as compatibility behavior inside that slice.

## Follow-Ups

- When implementing the profile-system slice, treat `.asdl/objectives/areg-typescript-port/skill-invocation-profiles.md` as the source of truth.
- During distribution/cutover docs work, decide whether any public-facing profile documentation should be recreated outside the Objective after the TypeScript implementation lands.
