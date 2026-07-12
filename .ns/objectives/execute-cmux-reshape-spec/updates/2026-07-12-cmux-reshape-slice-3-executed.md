# Cmux Reshape Slice 3 Executed

## Summary

Slice 3 removed the standalone `ccc` bin and `./cli` export and re-homed its
workspace-summary command as the source-discovered
`ns cmux exec workspace-summary` extension command. Runtime callers, the five
re-ratified caller/test/documentation locations, and the originally planned
skill and Pi documentation references were migrated. Descriptor and ns command
scenario coverage replaced the deleted standalone CLI scenario.

The implementation also migrated one additional command-documentation index
reference discovered during execution. This remained within the re-ratified
command migration intent and did not pull forward Slice 4 surface or skill
renames.

## Objective Impact

Roadmap Slice 3 is complete on local branch
`cmux-reshape/rehome-bin-as-extension`. Kernel source-dev discovery resolves
`ns cmux exec workspace-summary --help` from the repository root without any
registration edit, de-risking the Objective's discovery assumption. Root
`just` passed after formatter output was applied through the sanctioned fixer.

## Follow-Ups

Proceed sequentially to Slice 4 on
`cmux-reshape/rename-surfaces-and-skills`. Command-surface constants, extension
IDs, skill directory names, and areg registrations remain intentionally
unchanged until that slice.
