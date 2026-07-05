# Explore Live Progress Rendering

## Summary

Implemented live inline progress rendering for the Pi `explore` fan-out tool. `runExploreTasks` now updates a display-only `ns.explore.progress` widget through the existing safe runner-subagent widget helper while keeping the compact `onUpdate` progress text/details for non-UI sessions and transcript visibility.

The widget shows a done/running counter and one ordered row per scout with queued/running/done status icons, task title, status, and recent child activity/tool text when available. The widget is cleared in a `finally` after completion or failure.

## Objective Impact

Completes the roadmap item for live inline progress rendering. Validation passed with the focused explore Vitest suite plus TypeScript check, lint, and format check.

## Follow-Ups

The explorer-child home-directory-guard bypass decision still gates real dogfooding. Do not run routine real explorer children until that decision is recorded.
