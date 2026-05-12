# Record-Progress Guidance Narrows Future Updates

## Summary

The initiative-record-progress skill and progress-record template now emphasize that initiative updates should be durable state deltas rather than branch changelogs. Future updates for this initiative should center roadmap movement, open-question changes, risks, blockers, decisions, and concrete follow-ups instead of replaying implementation mechanics or file inventories.

This is durable process context for the initiative rather than new GitHub conformance implementation progress.

## Roadmap Context

This does not complete or advance a GitHub conformance harness work area directly. It affects how future progress should be recorded while the existing roadmap remains focused on the canonical fixture repository, fake/real parity slice, mutation coverage, CI wiring, and operational maintenance.

The current checked-out durable initiative state already reflects the live conformance spine and explicit repository targeting, so no additional roadmap movement is needed from this update.

## Initiative Impact

`initiative.md` and `roadmap.md` remain current: the skill-guidance change does not alter the harness thesis, scope, constraints, open questions, or ordered work.

The main impact is interpretive: future agents should treat updates as evidence for curating durable state, not as a complete commit or file-change history. Older updates that called for curation should be read against the current checked-out `initiative.md` and `roadmap.md` before assuming that follow-up is still open.

## Follow-Ups

- Continue the existing roadmap follow-ups: provision or select the canonical conformance repository and finish the first fake/real read-only parity slice.
- No new GitHub conformance work is introduced by the skill-guidance change itself.
