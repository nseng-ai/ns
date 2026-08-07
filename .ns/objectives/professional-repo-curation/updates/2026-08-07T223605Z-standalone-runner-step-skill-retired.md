# Standalone Objective Runner step skill retired

## Summary

ADR 0057 retires the redundant standalone `objective-runner-step` skill. The self-contained `objective-autorun` skill remains the parent-facing workflow and continues to own the complete strict ADR 0024 bookended procedure, including runs with a one-step ceiling. Objective Runner commands, runner attestation, Runner Checkpoints, provenance commits, and ADR 0037 publication semantics are unchanged.

## Objective Impact

The current first-party inventory is 58 skills: 1 public, 24 incubating, and 33 internal. This count is verified against both canonical `SKILL.md` sources and local entries in `skills-lock.json`. The earlier skill-disposition Subobjective and its existing updates remain immutable historical evidence of the census and classifications at their point in time; this retirement changes the current product inventory without reopening that closed record.

Acquisition and provisioning surfaces for the retired identity are removed from the flat Harness Overlays, local skill lock, and `@nseng-ai/objectives` package extras. Current Objective guidance now directs one-step and repeated bookended orchestration through `objective-autorun` only.

## Follow-Ups

None. This retirement does not change the remaining curation, presentation, installation, or transfer work.
