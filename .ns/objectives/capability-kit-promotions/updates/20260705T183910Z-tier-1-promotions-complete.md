# Tier 1 Promotions Complete

## Summary

The local Graphite stack ending at `capability-kit-promotions/drop-slots-json-helper` completes all five Tier 1 promotion rows: flow text-generation types, ccc branch-slug model invocation, objectives git parsing, handoffs branch resolution, and slots JSON parsing now route through capability-kit surfaces instead of the local duplicate implementations.

## Objective Impact

All `## Work` rows are now `[x]` with evidence in `roadmap.md`. The two pinned kit extensions landed additively and with tests: raw text generation beside `deriveSlugWithModel`, and pathspec/rename-aware git status helpers. Each runner step reported targeted validation for the touched package(s) plus a green `just`, satisfying the Objective's Definition of Progress and Completion Criteria.

## Follow-Ups

Tier 2/3 promotion candidates remain parked for deliberate future Objectives or roadmap pulls. The brmem layering question, foundation-vs-kit placement questions, selector-family move, and neutral `parseJsonUnknown` rehome remain accepted follow-up decisions outside this completed scope.
