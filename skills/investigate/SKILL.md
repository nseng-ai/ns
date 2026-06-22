---
name: investigate
disable-model-invocation: true
description: Run a thorough read-only investigation and return evidence-backed findings without editing or detailed planning.
context: fork
agent: investigator
argument-hint: <investigation prompt>
---

Investigate the following prompt thoroughly in read-only mode and return an Investigation Report.

Prompt:

$ARGUMENTS

Do not implement, edit files, commit, branch, push, or write a detailed implementation plan. Provide evidence, findings, likely fix shape, open questions/risks, and one suggested next action.
