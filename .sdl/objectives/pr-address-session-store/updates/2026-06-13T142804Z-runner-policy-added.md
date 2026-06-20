# Runner policy added for evidence gathering

## Summary

The Objective now includes durable execution guidance for `objective-next`. A new `## Definition of Progress` and `## Runner Policy` allow preview-confirmed, bounded local execution for evidence gathering, contract investigation, and one-slice local implementation work while keeping write-capable external actions out of scope by default.

The first roadmap row now has row-level policy for the fresh TypeScript `pr-address` run: local inspection, non-mutating helper execution, transcript or note capture, and Objective tracking are allowed after preview confirmation; resolving or replying to GitHub review threads, pushing, submitting PRs, publishing, or deployment remain out of scope unless separately and explicitly confirmed.

## Objective Impact

Future `objective-next` runs can offer execution for the fresh-TS-run evidence row without relying on a one-time chat confirmation. The policy keeps the Objective's safety contract explicit: local evidence gathering and repository edits are allowed only within the selected roadmap slice, while real external mutations require separate explicit confirmation.

## Follow-Ups

- Rerun `objective-next` for `pr-address-session-store`; it should now be able to preview execution for the first roadmap row.
- During the fresh TypeScript run, stop and ask before any command that would resolve or reply to GitHub review threads or otherwise perform write-capable external actions.
