---
name: investigate
disable-model-invocation: true
description: Run a thorough read-only investigation and return evidence-backed findings without editing or detailed planning.
argument-hint: <investigation prompt>
---

Investigate the following prompt thoroughly in read-only mode and return an Investigation Report.

Run the investigation in-process in the current session. Do not delegate it to a separate investigator subagent.

Prompt:

$ARGUMENTS

Do not implement, edit files, commit, branch, push, or write a detailed implementation plan. Provide evidence, findings, likely fix shape, open questions/risks, and one suggested next action.
