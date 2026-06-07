# PR Feedback Watch Waiver

## Summary

Added the new `/code:pr-feedback-watch` Pi command to the parity table as a WAIVED ambient watcher surface.

## Objective Impact

The watcher keeps deterministic PR feedback processing and GitHub mutations in the existing `pr-address` CLI/skill path. Pi owns only opt-in live polling, dedupe/status state, and prompt injection for the active session, so the agent-neutral fallback remains manual `pr-address` invocation.

## Follow-Ups

If future work moves classification, execution planning, or GitHub mutation logic into the TypeScript watcher, revisit this waiver and push that logic down into a shared CLI or skill-backed workflow.
