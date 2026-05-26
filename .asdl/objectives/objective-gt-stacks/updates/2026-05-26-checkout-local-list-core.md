# Checkout-local Objective list core

## Summary

Implemented the first Phase 1 checkout-local `objective list` slice. The Python CLI now discovers direct child directories under `.asdl/objectives/` in the current checkout, includes incomplete/untracked Objective directories, ignores `.asdl/objective-archive/`, treats direct `closed.md` as closed, and treats `active` as an alias for open records.

The new `objective list --format json` contract is record-oriented:

- top-level data fields: `trunk_branch`, `root_path`, `status_filter`, `names_only`, `records`
- record fields: `slug`, `status`, `latest_update_iso`

The removed branch-projection surface is now rejected or absent: `--current`, `--view`, and `--status in-flight` no longer work for `objective list`; old JSON fields such as `groups`, `base_branch`, `status_source`, branch rows, latest-work branch, parent branch, and slice commit counts are no longer emitted.

Verification: targeted list/unit/scenario tests passed; full non-integration pytest passed; `uv run ty check` passed; full `just` passed.

## Objective Impact

Phase 1 core behavior is now in place except for the deliberately deferred `(x)` dirty/outstanding-change marker. Roadmap rows for checkout-local discovery, status simplification, renderer simplification, and the non-dirty JSON/Markdown test coverage are complete.

Evidence from scenario coverage confirms untracked active Objective directories appear in `objective list`, archive-root-only records do not appear, branch-only fake-git records no longer appear, and removed flags/statuses reject through Click.

## Follow-Ups

- Implement the next Phase 1 dirty-marker slice for `(x)` latest-update prefixes and its tests.
- Migrate TypeScript/Pi consumers in the later planned phase to the new record-oriented schema.
- Reuse or relocate the preserved branch-projection helpers when `objective gt stacks` work begins.
